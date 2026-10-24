# Arquitetura

Caos é um roguelike multiplayer autoritativo. A partida inteira vive no servidor. O cliente só mostra o estado e manda intenção (mover, escolher carta, comprar, apostar, desistir).

## Pacotes

- `packages/shared`: schemas Zod, tipos de snapshot e mensagens.
- `packages/game-data`: JSON de heróis, habilidades, cartas, creeps, ondas, bosses, economia, partida e sinergias. `loadGameData()` valida e checa referências.
- `packages/sim`: simulação pura, tick fixo (`match.json` → `tickRate`, padrão 20). Não importa Colyseus nem React.
- `apps/server`: Express (login, estáticos, `/api/matches`) e Colyseus (`lobby`, `match`).
- `apps/client`: React + React Three Fiber. Câmera ortográfica inclinada. O 3D lê `snapRef` no frame, sem re-render a cada snapshot, e interpola posição entre snapshots. Heróis e bichos são sprites de pixel (sem luz): a folha do 0x72 (CC0) cobre idle, corrida, ataque e hit; morcego, aranha e olho são desenhados no cliente. O ícone da habilidade é pixel, por id. Flecha, lança e dardo saem com sprite próprio; os outros tiros são a bolinha. No corpo a corpo, uma bolinha clara cresce acima da cabeça até o golpe (`strike`). O chão, o meio-fio e os adereços de cada arena são só visuais. A poeira fica no mundo e não segue a câmera. Modelo `.glb` entra pelo registro de visuais se alguém quiser. A música sorteia uma faixa lenta e, na mesma melodia, sobe o andamento na onda e de novo no duelo só de quem está no par; efeitos ficam em outro volume. Nada disso entra na simulação.

## Fluxo

1. Login JWT (HMAC). O token vai no join do Colyseus.
2. A entrada lista salas de espera abertas. Quem cria vira host e fica na sala vendo quem entra. Dentro da sala cada um escolhe a cor da sombra e o herói, vendo o sprite dos outros. O host define vagas, vidas, cartas por nível e bots, e dá start.
3. O servidor cria uma `MatchRoom` com `createMatch()`. Humanos e bots entram na mesma simulação.
4. Cada tick chama `tick()`. PvE e duelo simulam combate. No salão só tem movimento. O snapshot sai a 10 Hz, filtrado por jogador (cartas só para quem escolhe). Sem ouro: a oferta de carta usa `luck`.
5. O mapa tem um salão no centro (`hub`) e um quadrado PvE por jogador em anel. A onda espera o último vivo. Depois todos voltam ao salão. Duelo é um par só. O snapshot manda um `announce` reutilizável (duelo, vitória, morte, desistência) e `duelAnnounce` só controla o timer do 1v1.
6. Pausa é um pedido. A simulação congela quando todo humano ainda vivo pediu (`pause`). Bots não votam. O relógio, o combate e os cooldowns ficam parados até alguém cancelar.
7. Fechar a aba espera 8 segundos. Sem voltar, conta como desistência. Sem persistir a partida no próximo login.
8. Eventos importantes vão para SQLite (`users`, `matches`, `match_players`, `events`), uma linha por acontecimento.

## Plugins

Registros em `packages/sim/src/registry.ts`:

- `registerAbilityBehavior`
- `registerTargeting`
- `registerEffect`
- `registerCreepBehavior`
- `registerBot`
- `registerBeforeDamage`, `registerAfterDamage`, `registerOnKill`

No cliente, `registerEntityView` em `apps/client/src/game/views.tsx`.

A simulação chama o nome que está no JSON. Nome sem registro quebra na criação da partida com erro explícito.

## O que não fazer

- Não calcular dano no cliente.
- Não importar `apps/server` ou `react` dentro de `packages/sim`.
- Não espalhar número mágico de gameplay no TypeScript se ele já existe no JSON.

Se a arquitetura mudar, atualize este arquivo e `.cursor/rules`.
