import { isFighter } from "./queries.js";
import type { Match, PlayerState } from "./types.js";
import { addLog, emit, heroEntity, pushBanner } from "./world.js";

export function loseLife(match: Match, player: PlayerState) {
  if (player.eliminated) return;
  player.lives -= 1;
  player.deaths += 1;
  const entity = heroEntity(match, player);
  if (entity) {
    entity.alive = false;
    entity.hp = 0;
  }
  emit(match, { type: "death", round: match.round, playerId: player.id, livesLeft: Math.max(0, player.lives) });
  if (player.lives <= 0) {
    eliminate(match, player, "sem vidas");
    return;
  }
  addLog(match, `${player.name} morreu`);
  const dueling = match.phase === "duel" && isFighter(match, player.id);
  if (!dueling) {
    pushBanner(match, {
      kind: "death",
      title: `${player.name} morreu`,
      detail: player.lives === 1 ? "Resta 1 vida" : `Restam ${player.lives} vidas`,
    });
  }
  if (match.phase === "pve" || (match.phase === "duel" && !dueling)) player.respawnIn = match.config.respawnSeconds;
}

export function eliminate(match: Match, player: PlayerState, reason: string) {
  if (player.eliminated) return;
  player.eliminated = true;
  player.lives = 0;
  player.paused = false;
  player.pendingCards = [];
  player.unspentPicks = 0;
  player.waveClear = true;
  player.eliminatedAt = match.time;
  player.ready = true;
  const entity = heroEntity(match, player);
  if (entity) entity.alive = false;
  emit(match, { type: "eliminate", round: match.round, playerId: player.id, reason });
  if (reason === "desistiu") {
    addLog(match, `${player.name} desistiu`);
    pushBanner(match, { kind: "surrender", title: `${player.name} desistiu`, detail: "Fora da partida", life: 4 });
    return;
  }
  addLog(match, `${player.name} foi eliminado`);
  if (reason !== "duelo") {
    pushBanner(match, { kind: "eliminate", title: `${player.name} foi eliminado`, life: 4 });
  }
}
