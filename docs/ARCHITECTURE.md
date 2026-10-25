# Arquitetura

Caos é um roguelike multiplayer autoritativo. A partida inteira vive no servidor. O cliente só mostra o estado e manda intenção (mover, mirar o chão, escolher carta, comprar, apostar, desistir, falar no chat).

## Pacotes

- `packages/shared`: schemas Zod, tipos de snapshot e mensagens.
- `packages/game-data`: JSON de heróis, habilidades, cartas, creeps, ondas, bosses, partida e sinergias. `buildGameData(raw)` valida e checa referências sem ler disco. `loadGameData()` lê os arquivos e chama ele. O export `"."` no navegador aponta para um stub, para o bundle do cliente não puxar `node:fs`. `visual/*.json` (efeitos, atores, arena do lab) o servidor não carrega; o cliente importa estático.
- `packages/sim`: simulação pura, tick fixo (`match.json` → `tickRate`, padrão 20). Não importa Colyseus nem React. O tick emite `SimEvent`. `present.ts` transforma o que é visual (log, banner, float, fx). O que persiste sai como `PersistEvent` e o servidor grava. O roteiro da partida é um modo (`registerMode`): `arena` fica em `modes/arena/` e `masmorra` em `modes/dungeon/`. O modo `lab` (`modes/lab/`, API `@game/sim/lab`) é só o laboratório: uma arena, sem onda e sem fim. Não entra no lobby nem no `matchOptionsSchema`. O tick chama `mode.update` e `mode.checkEnd`. Comandos de depuração (`setGodmode`, `jumpWave`, `revivePlayer`, `skipDuel`, `setDuels`, `setBotsGodmode`) saem por `@game/sim/debug`, não pela API principal. `/onda`, `/duelos` e `/skipduelo` só valem na arena.
- `apps/server`: Express (login, estáticos, `/api/matches`) e Colyseus (`lobby`, `match`).
- `apps/client`: React + React Three Fiber. Câmera ortográfica inclinada. O 3D lê `snapRef` e um índice `Map` por id, sem re-render a cada snapshot. A interpolação usa o `tick` do servidor, um buffer de 3 amostras e um atraso que começa em 0,2 s e acompanha o jitter. O retângulo visível sai do frustum da câmera; arena, tiro, efeito e número de dano fora dele não montam. Nome e dano são sprites de canvas (cache de textura, pool de uns 40 números), não DOM. O HUD assina fatias com `useSyncExternalStore` (fase, placar, habilidades, carta, banner, log) para o chat e o menu não redesenharem o resto. `NetStat` mostra fps, ping, perda, entidades montadas e nós de HTML. Heróis e bichos são sprites de pixel (sem luz): a folha do 0x72 (CC0) cobre idle, corrida, ataque e hit; morcego, aranha e olho são desenhados no cliente. O ícone da habilidade é pixel, por id. Tiro, zona e efeito saem de `VfxField`: um `InstancedMesh` por folha descrita em `visual/vfx.json` (tiras CC0 em `public/sprites/vfx/`). O raio entre dois pontos usa a folha `bolt` desse JSON. Altura, fps, ataque e sombra vêm de `visual/actors.json`. Em dev, `/lab` roda o sim no navegador, edita o JSON com preview e grava com Ctrl+S. Flecha, lança, dardo e lâmina continuam desenhados no cliente. Aviso no chão é um anel que enche. Stun, slow e burn tingem o sprite. A barra do chefe (`BossBar`) lê a fatia `boss`. No corpo a corpo, uma sombra vermelha bem clara cresce no chão, debaixo do bicho, até o golpe (`strike`). O chão, o meio-fio e os adereços de cada arena são só visuais. A poeira fica no mundo e não segue a câmera. Modelo `.glb` entra pelo registro de visuais se alguém quiser. A música compõe uma faixa de 16 bits a cada trecho: melodia com frase e resposta, baixo, acordejado e ritmo, sorteando tom, modo e desenho. Salão e loja ficam calmos, a onda ganha outra peça mais cheia, o duelo (só de quem está no par) outra mais rápida, o chefe (quando o snapshot manda `boss`) entra em frígio ou menor harmônico, e o fim fica lento. Efeitos ficam em outro volume. Nada disso entra na simulação. Telas ficam em `ui/Login.tsx`, `ui/Home.tsx`, `ui/WaitRoom.tsx` e `ui/match/`. A conexão da partida é `useMatchRoom`.

## Fluxo

1. Login JWT (HMAC). O token vai no join do Colyseus.
2. A entrada lista salas de espera abertas. Quem cria vira host e fica na sala vendo quem entra. Dentro da sala cada um escolhe a cor da sombra e o herói, vendo o sprite dos outros. O host define vagas, vidas, cartas por nível e bots, e dá start.
3. O host escolhe o modo na sala de espera (`arena` ou `masmorra`). O servidor cria uma `MatchRoom` com `createMatch()`. Humanos e bots entram na mesma simulação. A masmorra aceita um jogador.
4. Cada tick chama `tick()`. O relógio da sala acumula o tempo real e alcança até 4 passos se atrasar; o snapshot sai logo depois, a 10 Hz. A parte comum (fase, arenas no filtro, entidades, tiros, zonas, avisos, fx, floats, chefe) é montada uma vez por conjunto de arenas. A parte do jogador (carta pendente, `youId`) vai por cima. No join o cliente recebe `meta` (arenas, nomes, texto de habilidade e carta) e de novo só quando a lista de arenas ou de jogadores muda. O snapshot fica com índice curto de arena e números com duas casas. O cliente manda `watch`: o servidor inclui a arena desse jogador, o salão e o duelo ativo. O placar continua com todos. A oferta de carta usa o `weight` de cada carta.
5. Na arena, o mapa tem um salão no centro (`hub`) e um quadrado PvE por jogador em anel. A onda espera o último vivo. Depois todos voltam ao salão. Duelo é um par só. O snapshot manda um `announce` reutilizável (duelo, vitória, morte, desistência) e `duelAnnounce` só controla o timer do 1v1. Na masmorra, a semente gera salas ligadas por portais; o interesse manda só a sala de quem é observado, e o `meta` traz o mapa e os portais.
6. Pausa é um pedido. A simulação congela quando todo humano ainda vivo pediu (`pause`). Bots não votam. O relógio, o combate e os cooldowns ficam parados até alguém cancelar.
7. Fechar a aba espera 8 segundos. Sem voltar, conta como desistência. Sem persistir a partida no próximo login.
8. Eventos importantes vão para SQLite (`users`, `matches`, `match_players`, `events`), uma linha por acontecimento. O arquivo usa WAL e `synchronous=NORMAL`. Os statements ficam preparados. As linhas do tick entram numa fila e gravam fora do tick, numa transação. O schema sobe por migrações numeradas em `schema.ts`. `updateMatchPlayer` usa o id da linha inserida.
9. O chat fica na sala (`lobby` e `match`), fora do tick. O servidor corta o texto, ignora vazio e rajada curta, e manda a linha para quem está conectado. Quem entra recebe o histórico recente. Não vai para o snapshot nem para o banco. Mensagens da partida (`input`, `pick`, `shop`, `bet`, `pause`, `watch`) passam por Zod. O texto de comando é reconhecido em `chat.ts` e, na partida, `runMatchCommand` aplica na simulação. Esses comandos só valem para o host, ou com `CAOS_DEV=1`. `/godmode` alterna a invulnerabilidade de quem escreveu, mesmo morto, e o snapshot marca `godmode`. `/skipduelo` cancela o duelo anunciado ou em curso, sem tirar vida. `/duelos` liga ou desliga o agendamento (`duelsEnabled`). `/onda N` chama `jumpWave` e essa onda começa na hora. `/bots` liga ou desliga `godmode` em todo bot, morto também, e guarda `botsGodmode`. `/reviver` levanta quem escreveu, ou o nome que vier depois; eliminado volta com 1 vida e, se a partida tinha acabado, o salão reabre. Na sala de espera o comando só avisa que vale na partida.

## Plugins

Registros em `packages/sim/src/registry.ts`:

- `registerAction` (`strike`, `chain`, `burst`, `cone`, `shoot`, `pattern`, `zone`, `dash`, `summon`, `heal`, `warn`, `orbit` em `spells/`)
- `registerStatus` (`stun`, `slow`, `burn`, `root`)
- `registerTargeting`
- `registerEffect`
- `registerCreepBehavior`
- `registerBot`
- `registerMode` (`arena`, `masmorra`, `lab`)
- `registerHitHook` (`burn`, `execute`, `splash`; o limiar, o raio e a constante de armadura vêm do `match.json`)
- `registerBeforeDamage`, `registerAfterDamage`, `registerOnKill`

Habilidade e skill de creep são a mesma lista `cast`. O nível (ou a própria ação) guarda os números. `dash` e `burst` com `windup` ocupam o tick em `match.skillState`. Status, zona, aviso e rajada ficam no `Match`, fora de `Entity`. O stun respeita `stunImmuneSeconds`. Na arena, o chefe de `bosses.json` nasce depois que o quadrado limpa, com banner `boss` e `bossSeconds` a mais; a fase (`phases` no creep) vale igual na masmorra. O snapshot manda `boss` da arena observada. `GameData.byId` e os mapas de entidade, jogador e arena evitam busca linear no tick.

No cliente, `registerEntityView` em `apps/client/src/game/views.tsx`.

A simulação chama o nome que está no JSON. Nome sem registro quebra na criação da partida com erro explícito.

## O que não fazer

- Não calcular dano no cliente.
- Não importar `apps/server` ou `react` dentro de `packages/sim`.
- Não espalhar número mágico de gameplay no TypeScript se ele já existe no JSON.

Se a arquitetura mudar, atualize este arquivo e `.cursor/rules`.
