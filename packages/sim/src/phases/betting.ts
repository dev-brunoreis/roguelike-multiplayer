import type { Match } from "../types.js";
import { addLog } from "../world.js";
import { beginDuel } from "./duel.js";

export function beginBetting(match: Match) {
  if (match.phase === "ended") return;
  match.phase = "betting";
  match.phaseTime = match.config.bettingSeconds;
  match.duel = pairFromAlive(match);
  addLog(match, "Apostas abertas");
  for (const player of match.players) player.bet = null;
}

function pairFromAlive(match: Match) {
  const ids = match.players.filter((player) => !player.eliminated).map((player) => player.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = match.rng.int(i + 1);
    const swap = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = swap;
  }
  const a = ids[0];
  const b = ids[1];
  if (!a || !b) return [];
  return [{ a, b, arenaId: `duel-${match.round}-1`, resolved: false }];
}

export function updateBetting(match: Match, dt: number) {
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  if (match.phaseTime <= 0) beginDuel(match);
}
