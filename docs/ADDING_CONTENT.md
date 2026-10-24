# Adicionar conteúdo

Edite o JSON em `packages/game-data/data` e reinicie o servidor. O Zod recusa arquivo quebrado na subida.

## Habilidade

Em `abilities.json`. `behavior` e `targeting` precisam já estar registrados.

Behaviors atuais: `single`, `chain`, `aoe`, `projectile`, `cone`.

Targeting atual: `nearest`, `lowestHp`, `random`, `densest`. Com mira do mouse, `single`, `projectile` e o primeiro salto do `chain` usam a linha até o ponto; `aoe` estoura no ponto e gasta cooldown mesmo vazio. O targeting do JSON vale enquanto `aimX`/`aimY` ainda são nulos.

`levels` é a progressão. Nível 1 usa o primeiro item. `chain` lê `targets` e `falloff`.

Behavior novo: arquivo em `packages/sim/src`, `registerAbilityBehavior("nome", fn)` e import em `content.ts`. A função recebe o caster e devolve `true` só se disparou (senão o cooldown não começa).

## Carta

Em `cards.json`. `effects` usa um type registrado: `stat`, `grantAbility`, `upgradeAbility`, `onHit`, `onKill`.

`unique: true` não repete. `requires.ability` exige ter a skill. `requires.missingAbility` exige não ter.

Efeito novo: `registerEffect` em `effects.ts` (ou um arquivo importado por `content.ts`).

## Creep, onda, boss

`creeps.json` define status e `behavior`. `waves.json` escolhe a onda de maior `round` que ainda é menor ou igual à rodada atual; depois da última, ela se repete mais forte. `bosses.json` soma um spawn quando a rodada divide `everyRounds`.

IA nova: `registerCreepBehavior`. Hoje: `chase` (corpo a corpo) e `kite` (ranged, recua e atira). No corpo a corpo, `attackWindup` é o tempo da bolinha: o bicho para, a bolinha cresce, e o dano sai no fim se o alvo ainda está no alcance.

Skill opcional no creep, campo `skill`. O golpe normal continua. A skill gasta `cooldown` e lê o resto do objeto: `charge` (investida: `damage`, `range`, `speed`), `burst` (estouro no `radius` depois do `attackWindup`, se o herói está em `range`), `summon` (`creepId`, `count` vivos daquele conjurador), `mend` (`amount`, `range` no aliado mais ferido), `bolt` (`damage`, `range`). Dano e cura escalam com a rodada, como a vida do bicho. Skill nova: `registerCreepSkill` num arquivo importado por `content.ts`.

## Visual

O snapshot manda `view` = id do herói ou do creep. O visual padrão é um sprite de pixel em `apps/client/src/game/sprites.ts`, com idle, corrida, ataque e hit. A folha CC0 fica em `apps/client/public/sprites/0x72/`.

Sprite novo de um frame do pack: entrada em `PACK`. Sprite desenhado no cliente: entrada em `DRAWN`. Ícone da habilidade fica em `apps/client/src/game/icons.tsx`, um desenho por id. Tiro com forma própria entra em `shotShape` em `sprites.ts` (flecha, lança, dardo). Modelo 3D no lugar do sprite:

```tsx
registerEntityView("guerreiro", GuerreiroModel);
```

O componente só posiciona o visual. Dano, vida e cooldown continuam na simulação.

## Bot

`registerBot("agressivo", fn)` e troque o nome lido em `runBots` quando houver mais de uma estratégia. A função mexe só em input e nas ações já existentes (`pickCard`, `shopAct` ready).
