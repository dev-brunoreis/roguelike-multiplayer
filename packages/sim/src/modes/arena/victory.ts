import { flushDamage } from "../../spawn.js";
import type { Match } from "../../types.js";
import { addLog, alivePlayers, emit } from "../../world.js";

export function checkWinner(match: Match) {
  if (match.phase === "ended") return;
  const alive = alivePlayers(match);
  if (alive.length === 0) {
    finish(match, null);
    return;
  }
  if (match.rosterCount >= 2 && alive.length === 1) finish(match, alive[0]!.id);
}

function finish(match: Match, winnerId: string | null) {
  flushDamage(match);
  match.phase = "ended";
  match.phaseTime = 0;
  match.winnerId = winnerId;
  const winner = match.players.find((player) => player.id === winnerId);
  addLog(match, winner ? `${winner.name} venceu a partida` : "A partida terminou sem vencedor");
  emit(match, { type: "win", round: match.round, playerId: winnerId });
}
