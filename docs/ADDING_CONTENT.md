# Adicionar conteúdo

Edite o JSON em `packages/game-data/data` e reinicie o servidor. O Zod recusa arquivo quebrado na subida.

## Habilidade

Em `abilities.json`. `behavior` e `targeting` precisam já estar registrados.

Behaviors atuais: `single`, `chain`, `aoe`, `projectile`, `cone`.

Targeting atual: `nearest`, `lowestHp`, `random`, `densest`.

`levels` é a progressão. Nível 1 usa o primeiro item. `chain` lê `targets` e `falloff`.

Behavior novo: arquivo em `packages/sim/src`, `registerAbilityBehavior("nome", fn)` e import em `content.ts`. A função recebe o caster e devolve `true` só se disparou (senão o cooldown não começa).

## Carta

Em `cards.json`. `effects` usa um type registrado: `stat`, `grantAbility`, `upgradeAbility`, `onHit`, `onKill`.

`unique: true` não repete. `requires.ability` exige ter a skill. `requires.missingAbility` exige não ter.

Efeito novo: `registerEffect` em `effects.ts` (ou um arquivo importado por `content.ts`).

## Creep, onda, boss

`creeps.json` define status e `behavior` (hoje `chase`). `waves.json` escolhe a onda de maior `round` que ainda é menor ou igual à rodada atual. `bosses.json` soma um spawn quando a rodada divide `everyRounds`.

IA nova: `registerCreepBehavior`.

## Visual 3D

O snapshot manda `view` = id do herói ou do creep. O padrão é uma esfera.

```tsx
registerEntityView("guerreiro", GuerreiroModel);
```

O componente só posiciona o modelo. Dano, vida e cooldown continuam na simulação.

## Bot

`registerBot("agressivo", fn)` e troque o nome lido em `runBots` quando houver mais de uma estratégia. A função mexe só em input e nas ações já existentes (`pickCard`, `shopAct`, `placeBet`).
