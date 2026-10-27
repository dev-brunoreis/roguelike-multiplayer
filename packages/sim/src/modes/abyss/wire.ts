import type { AbyssMeta, AbyssSnap, WireAbyss } from "@game/shared";
import type { Match } from "../../types.js";
import { emptyMask, maskToBase64 } from "./generate.js";
import { abyssOf } from "./state.js";

export function abyssMeta(match: Match): AbyssMeta | null {
  const state = abyssOf(match);
  if (!state) return null;
  const map = state.map;
  return {
    seed: match.seed,
    tiles: map.tiles,
    tileSize: map.tileSize,
    vision: map.vision,
    floors: map.floors.map((floor) => ({
      id: floor.id,
      nome: floor.nome,
      kind: floor.kind,
      palette: floor.palette,
    })),
    stairs: map.stairs.map((stair) => ({
      floor: stair.floor,
      x: stair.x,
      y: stair.y,
      dir: stair.dir,
    })),
    heart: { floor: map.heart.floor, x: map.heart.x, y: map.heart.y },
  };
}

export function abyssWire(match: Match, watchId: string): WireAbyss | null {
  const state = abyssOf(match);
  if (!state) return null;
  const player = match.playersById.get(watchId) ?? match.players[0];
  const found = state.map.floors.findIndex((floor) => floor.id === player?.arenaId);
  const floor = found >= 0 ? found : 0;
  return {
    floor,
    nome: state.map.floors[floor]?.nome ?? "",
    objective: state.objective,
    revealed: maskToBase64(state.revealed[floor] ?? emptyMask(state.map.tiles)),
    result: state.result,
  };
}

export function abyssSnap(match: Match, watchId: string): AbyssSnap | null {
  const meta = abyssMeta(match);
  const wire = abyssWire(match, watchId);
  if (!meta || !wire) return null;
  return { ...meta, ...wire };
}
