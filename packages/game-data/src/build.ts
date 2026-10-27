import {
  abilitySchema,
  bossSchema,
  cardSchema,
  creepSchema,
  abyssSchema,
  dungeonSchema,
  heroSchema,
  matchConfigSchema,
  synergySchema,
  waveSchema,
  type AbilityDef,
  type BossDef,
  type CardDef,
  type CreepDef,
  type AbyssDef,
  type DungeonDef,
  type HeroDef,
  type MatchConfig,
  type SynergyDef,
  type WaveDef,
} from "@game/shared";

export interface GameData {
  version: string;
  heroes: HeroDef[];
  abilities: AbilityDef[];
  cards: CardDef[];
  creeps: CreepDef[];
  waves: WaveDef[];
  bosses: BossDef[];
  synergies: SynergyDef[];
  match: MatchConfig;
  dungeon: DungeonDef;
  abyss: AbyssDef;
  byId: {
    heroes: Map<string, HeroDef>;
    abilities: Map<string, AbilityDef>;
    cards: Map<string, CardDef>;
    creeps: Map<string, CreepDef>;
  };
}

export interface RawGameFiles {
  match: unknown;
  heroes: unknown;
  abilities: unknown;
  cards: unknown;
  creeps: unknown;
  waves: unknown;
  bosses: unknown;
  synergies: unknown;
  dungeon: unknown;
  abyss: unknown;
}

interface Issue {
  path: PropertyKey[];
  message: string;
}

interface Schema<T> {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: Issue[] } };
}

function parse<T>(file: string, data: unknown, schema: Schema<T>): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${file} inválido: ${details}`);
  }
  return result.data;
}

export function checkRefs(data: GameData) {
  const abilities = new Set(data.abilities.map((ability) => ability.id));
  const creeps = new Set(data.creeps.map((creep) => creep.id));
  for (const hero of data.heroes) {
    if (!abilities.has(hero.startingAbility)) {
      throw new Error(`Herói ${hero.id} aponta habilidade inexistente: ${hero.startingAbility}`);
    }
  }
  for (const card of data.cards) {
    if (card.requires?.ability && !abilities.has(card.requires.ability)) {
      throw new Error(`Carta ${card.id} exige habilidade inexistente.`);
    }
    if (card.requires?.missingAbility && !abilities.has(card.requires.missingAbility)) {
      throw new Error(`Carta ${card.id} bloqueia habilidade inexistente.`);
    }
    for (const effect of card.effects) {
      if (effect.abilityId && !abilities.has(effect.abilityId)) {
        throw new Error(`Carta ${card.id} cita habilidade inexistente: ${effect.abilityId}`);
      }
    }
  }
  for (const wave of data.waves) {
    for (const spawn of wave.spawns) {
      if (!creeps.has(spawn.creepId)) throw new Error(`Onda ${wave.round} cita creep inexistente: ${spawn.creepId}`);
    }
  }
  for (const boss of data.bosses) {
    if (!creeps.has(boss.creepId)) throw new Error(`Boss ${boss.id} cita creep inexistente: ${boss.creepId}`);
  }
  for (const creep of data.creeps) {
    const spells = [...(creep.skills ?? []), ...(creep.skill ? [creep.skill] : [])];
    for (const spell of spells) {
      for (const action of spell.cast) {
        if (action.creepId && !creeps.has(action.creepId)) {
          throw new Error(`Creep ${creep.id} invoca creep inexistente: ${action.creepId}`);
        }
      }
    }
  }
  const cited = [
    ...data.dungeon.encounters.flatMap((encounter) => encounter.spawns),
    ...data.dungeon.elites,
    ...data.dungeon.bosses,
  ];
  for (const spawn of cited) {
    if (!creeps.has(spawn.creepId)) throw new Error(`Masmorra cita creep inexistente: ${spawn.creepId}`);
  }
  const floors = new Set(data.abyss.floors.map((floor) => floor.id));
  for (const spawn of data.abyss.spawns) {
    if (!floors.has(spawn.floor)) throw new Error(`Abismo cita andar inexistente: ${spawn.floor}`);
    if (!creeps.has(spawn.creepId)) throw new Error(`Abismo cita creep inexistente: ${spawn.creepId}`);
  }
  if (data.dungeon.roomsMax < data.dungeon.roomsMin) {
    throw new Error("dungeon.json: roomsMax menor que roomsMin");
  }
}

export function buildGameData(raw: RawGameFiles): GameData {
  const match = parse("match.json", raw.match, matchConfigSchema);
  const data: GameData = {
    version: match.version,
    heroes: parse("heroes.json", raw.heroes, heroSchema.array().min(1)),
    abilities: parse("abilities.json", raw.abilities, abilitySchema.array().min(1)),
    cards: parse("cards.json", raw.cards, cardSchema.array().min(1)),
    creeps: parse("creeps.json", raw.creeps, creepSchema.array().min(1)),
    waves: parse("waves.json", raw.waves, waveSchema.array().min(1)),
    bosses: parse("bosses.json", raw.bosses, bossSchema.array()),
    synergies: parse("synergies.json", raw.synergies, synergySchema.array()),
    match,
    dungeon: parse("dungeon.json", raw.dungeon, dungeonSchema),
    abyss: parse("abyss.json", raw.abyss, abyssSchema),
    byId: { heroes: new Map(), abilities: new Map(), cards: new Map(), creeps: new Map() },
  };
  data.byId = {
    heroes: new Map(data.heroes.map((hero) => [hero.id, hero])),
    abilities: new Map(data.abilities.map((ability) => [ability.id, ability])),
    cards: new Map(data.cards.map((card) => [card.id, card])),
    creeps: new Map(data.creeps.map((creep) => [creep.id, creep])),
  };
  checkRefs(data);
  return data;
}
