import { applyCard } from "./effects.js";
import { eliminate } from "./elimination.js";
import { offerCards } from "./progression.js";
import { checkWinner } from "./victory.js";
import type { Match } from "./types.js";
import { clamp, emit, playerById } from "./world.js";

export function setInput(match: Match, playerId: string, x: number, y: number, aimX?: number, aimY?: number) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || player.isBot) return;
  if (match.phase === "ended") {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  player.inputX = clamp(x, -1, 1);
  player.inputY = clamp(y, -1, 1);
  if (aimX != null && aimY != null && Number.isFinite(aimX) && Number.isFinite(aimY)) {
    player.aimX = aimX;
    player.aimY = aimY;
  }
}

export function pickCard(match: Match, playerId: string, cardId: string, auto = false) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated) return;
  if (!player.pendingCards.includes(cardId)) return;
  player.pendingCards = [];
  player.cardTimer = 0;
  player.unspentPicks = Math.max(0, player.unspentPicks - 1);
  applyCard(match, player, cardId);
  emit(match, { type: "card_pick", round: match.round, playerId, cardId, auto });
  if (player.unspentPicks > 0 && match.phase === "hub" && player.pendingCards.length === 0) {
    offerCards(match, player);
  }
}

export function shopAct(
  match: Match,
  playerId: string,
  action: { kind: "buy" | "upgrade" | "reroll" | "ready"; cardId?: string; abilityId?: string },
) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || (match.phase !== "shop" && match.phase !== "hub")) return;
  if (action.kind === "ready") player.ready = true;
}

export function placeBet(_match: Match, _playerId: string, _targetId: string, _amount: number) {
  return;
}

export function syncPause(match: Match) {
  for (const player of match.players) {
    if (player.eliminated || player.isBot) player.pauseWant = false;
  }
  if (match.phase === "ended") {
    match.paused = false;
    return;
  }
  const humans = match.players.filter((player) => !player.isBot && !player.eliminated);
  match.paused = humans.length > 0 && humans.every((player) => player.pauseWant);
}

export function setPauseWant(match: Match, playerId: string, want: boolean) {
  const player = playerById(match, playerId);
  if (!player || player.isBot || player.eliminated || match.phase === "ended") return;
  player.pauseWant = want;
  syncPause(match);
}

export function surrender(match: Match, playerId: string) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || match.phase === "ended") return;
  player.surrendered = true;
  eliminate(match, player, "desistiu");
  checkWinner(match);
}
