import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  abilitySchema,
  bossSchema,
  cardSchema,
  creepSchema,
  dungeonSchema,
  heroSchema,
  matchConfigSchema,
  synergySchema,
  waveSchema,
  type AbilityDef,
  type BossDef,
  type CardDef,
  type CreepDef,
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
  byId: {
    heroes: Map<string, HeroDef>;
    abilities: Map<string, AbilityDef>;
    cards: Map<string, CardDef>;
    creeps: Map<string, CreepDef>;
  };
}

function dataDir(): string {
  if (process.env.GAME_DATA_DIR) return process.env.GAME_DATA_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../data"),
    join(here, "../../data"),
    join(process.cwd(), "packages/game-data/data"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "match.json"))) return candidate;
  }
  throw new Error("Pasta de game data não encontrada. Defina GAME_DATA_DIR.");
}

interface Issue {
  path: PropertyKey[];
  message: string;
}

interface Schema<T> {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: Issue[] } };
}

function parseFile<T>(dir: string, file: string, schema: Schema<T>): T {
  const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${file} inválido: ${details}`);
  }
  return result.data;
}

function checkRefs(data: GameData) {
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
    if (creep.skill?.creepId && !creeps.has(creep.skill.creepId)) {
      throw new Error(`Creep ${creep.id} invoca creep inexistente: ${creep.skill.creepId}`);
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
  if (data.dungeon.roomsMax < data.dungeon.roomsMin) {
    throw new Error("dungeon.json: roomsMax menor que roomsMin");
  }
}

let cached: GameData | null = null;

export function loadGameData(dir = dataDir()): GameData {
  const match = parseFile(dir, "match.json", matchConfigSchema);
  const data: GameData = {
    version: match.version,
    heroes: parseFile(dir, "heroes.json", heroSchema.array().min(1)),
    abilities: parseFile(dir, "abilities.json", abilitySchema.array().min(1)),
    cards: parseFile(dir, "cards.json", cardSchema.array().min(1)),
    creeps: parseFile(dir, "creeps.json", creepSchema.array().min(1)),
    waves: parseFile(dir, "waves.json", waveSchema.array().min(1)),
    bosses: parseFile(dir, "bosses.json", bossSchema.array()),
    synergies: parseFile(dir, "synergies.json", synergySchema.array()),
    match,
    dungeon: parseFile(dir, "dungeon.json", dungeonSchema),
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

export function getGameData(): GameData {
  cached ??= loadGameData();
  return cached;
}
