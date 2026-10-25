# Adicionar conteúdo

Edite o JSON em `packages/game-data/data` e reinicie o servidor. O Zod recusa arquivo quebrado na subida.

## Habilidade

Em `abilities.json`. `cast` e `targeting` precisam já estar registrados.

Ações atuais: `strike`, `chain`, `burst`, `shoot`, `cone`, `pattern`, `zone`, `dash`, `summon`, `heal`, `warn`, `orbit`.

Targeting atual: `nearest`, `lowestHp`, `random`, `densest`. Com mira do mouse, `strike`, `shoot` e o primeiro salto do `chain` usam a linha até o ponto; `burst` estoura no ponto só se tem inimigo no raio; vazio, não gasta cooldown. O targeting do JSON vale enquanto `aimX`/`aimY` ainda são nulos.

`levels` é a progressão. Nível 1 usa o primeiro item. Cada ação lê esses números e só substitui o campo que ela mesma declara. `chain` lê `targets` e `falloff`. `vfx` escolhe a folha em `vfx.ts`.

Ação nova: arquivo em `packages/sim/src/spells`, `registerAction("nome", fn)` e import em `content.ts` (por `spells/index.ts`). A função devolve `true` só se disparou (senão o cooldown não começa).

## Carta

Em `cards.json`. `effects` usa um type registrado: `stat`, `grantAbility`, `upgradeAbility`, `onHit`, `onKill`.

`unique: true` não repete. `requires.ability` exige ter a skill. `requires.missingAbility` exige não ter.

Efeito novo: `registerEffect` em `effects.ts` (ou um arquivo importado por `content.ts`).

## Creep, onda, boss

`creeps.json` define status e `behavior`. `waves.json` escolhe a onda de maior `round` que ainda é menor ou igual à rodada atual; depois da última, ela se repete mais forte. `bosses.json` marca a rodada de chefe (`everyRounds`). O chefe não entra no spawn: nasce quando o quadrado daquele jogador limpa.

IA nova: `registerCreepBehavior`. Hoje: `chase` (corpo a corpo) e `kite` (ranged, recua e atira). No corpo a corpo, `attackWindup` é o tempo da bolinha: o bicho para, a bolinha cresce, e o dano sai no fim se o alvo ainda está no alcance.

Skill opcional no creep, campo `skill` ou lista `skills`, no mesmo formato `cast` da habilidade. O golpe normal continua. A skill gasta `cooldown`. `dash` anda e toma o tick. `burst` com `windup` espera o `attackWindup`. `summon`, `heal` e `strike` não travam o golpe. Dano e cura escalam com a rodada, como a vida do bicho. Chefe acrescenta `phases`: cada item tem `hpBelow`, `rotation` (ids das skills) e `speedMul` opcional. A fase mais baixa ainda acima da vida atual vale.

## Visual

O snapshot manda `view` = id do herói ou do creep. O visual padrão é um sprite de pixel em `apps/client/src/game/sprites.ts`, com idle, corrida, ataque e hit. A folha CC0 fica em `apps/client/public/sprites/0x72/`.

Sprite novo de um frame do pack: entrada em `PACK` e o id em `visual/actors.json` (`source: "pack"`). Sprite desenhado no cliente: entrada em `DRAWN` e `source: "drawn"`. Nesse JSON ficam o multiplicador do corpo, o fps de cada clipe, a duração do ataque e a escala da sombra. Ícone da habilidade fica em `apps/client/src/game/icons.tsx`, um desenho por id. Folha de efeito entra em `visual/vfx.json` (`frames`, `fps`, `loop`, `wide`, `tall`, `tint`, `aim`, `sheet`). O `vfx` da habilidade ou da skill escolhe o id. `byAbility` e `fxKind` cobrem o que não declara. `bolt` é a folha do raio entre dois pontos. Flecha, lança e dardo continuam canvas quando o def tem `builtin`. Em dev, `/lab` mostra o resultado e grava o JSON. Modelo 3D no lugar do sprite:

```tsx
registerEntityView("guerreiro", GuerreiroModel);
```

O componente só posiciona o visual. Dano, vida e cooldown continuam na simulação.

## Masmorra

`dungeon.json` define salas, portais, coleira, reviver e os encontros. `encounters` escolhe o grupo de maior `depth` que ainda cabe na sala. `elites` e `bosses` citam `creepId`. `aggro` opcional no creep sobrescreve `aggroRadius` e `leashRadius`.

## Bot

`registerBot("agressivo", fn)` e troque o nome lido em `runBots` quando houver mais de uma estratégia. A função mexe só em input e nas ações já existentes (`pickCard`, `shopAct` ready).
