import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameData, type GameData, type RawGameFiles } from "./build.js";

export type { GameData, RawGameFiles } from "./build.js";

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

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
}

export function readGameFiles(dir = dataDir()): RawGameFiles {
  return {
    match: readJson(dir, "match.json"),
    heroes: readJson(dir, "heroes.json"),
    abilities: readJson(dir, "abilities.json"),
    cards: readJson(dir, "cards.json"),
    creeps: readJson(dir, "creeps.json"),
    waves: readJson(dir, "waves.json"),
    bosses: readJson(dir, "bosses.json"),
    synergies: readJson(dir, "synergies.json"),
    dungeon: readJson(dir, "dungeon.json"),
  };
}

let cached: GameData | null = null;

export function loadGameData(dir = dataDir()): GameData {
  return buildGameData(readGameFiles(dir));
}

export function getGameData(): GameData {
  cached ??= loadGameData();
  return cached;
}
