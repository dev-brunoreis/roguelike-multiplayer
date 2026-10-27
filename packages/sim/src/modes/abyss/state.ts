import type { Match } from "../../types.js";
import type { AbyssMap } from "./generate.js";

export interface AbyssState {
  map: AbyssMap;
  revealed: Uint8Array[];
  seen: boolean[];
  result: "win" | null;
  objective: string;
}

const states = new WeakMap<Match, AbyssState>();

export function abyssOf(match: Match) {
  return states.get(match) ?? null;
}

export function bindAbyss(match: Match, state: AbyssState) {
  states.set(match, state);
}
