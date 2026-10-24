import type { Match } from "./types.js";

export function isFighter(match: Match, playerId: string) {
  return match.duel.some((pair) => pair.a === playerId || pair.b === playerId);
}
