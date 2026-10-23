import { applyCard } from "./effects.js";
import { eligible } from "./damage.js";
import { eliminate } from "./damage.js";
import { checkWinner, rollShop } from "./phases.js";
import type { Match } from "./types.js";
import { abilityById, cardById, clamp, emit, playerById } from "./world.js";

export function setInput(match: Match, playerId: string, x: number, y: number) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || player.isBot) return;
  if (player.paused || match.phase === "ended") {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  player.inputX = clamp(x, -1, 1);
  player.inputY = clamp(y, -1, 1);
}

export function pickCard(match: Match, playerId: string, cardId: string, auto = false) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated) return;
  if (!player.pendingCards.includes(cardId)) return;
  player.pendingCards = [];
  player.cardTimer = 0;
  player.paused = false;
  applyCard(match, player, cardId);
  emit(match, { type: "card_pick", round: match.round, playerId, cardId, auto });
}

export function upgradeCost(match: Match, level: number) {
  return Math.round(match.data.economy.upgradeCostBase * match.data.economy.upgradeCostGrowth ** (level - 1));
}

export function cardPrice(match: Match, rarity: string) {
  return match.data.economy.prices[rarity] ?? 30;
}

export function shopAct(
  match: Match,
  playerId: string,
  action: { kind: "buy" | "upgrade" | "reroll" | "ready"; cardId?: string; abilityId?: string },
) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || match.phase !== "shop") return;
  if (action.kind === "ready") {
    player.ready = true;
    return;
  }
  if (action.kind === "reroll") {
    const cost = match.data.economy.rerollCost;
    if (player.gold < cost) return;
    player.gold -= cost;
    player.shopOffers = rollShop(match, player);
    emit(match, { type: "shop", round: match.round, playerId, action: "reroll", cost });
    return;
  }
  if (action.kind === "buy" && action.cardId) {
    if (!player.shopOffers.includes(action.cardId)) return;
    const card = cardById(match, action.cardId);
    if (!card || !eligible(match, player, card)) return;
    const cost = cardPrice(match, card.rarity);
    if (player.gold < cost) return;
    player.gold -= cost;
    player.shopOffers = player.shopOffers.filter((id) => id !== card.id);
    applyCard(match, player, card.id);
    emit(match, { type: "shop", round: match.round, playerId, action: "buy", cardId: card.id, cost });
    return;
  }
  if (action.kind === "upgrade" && action.abilityId) {
    const slot = player.abilities.find((item) => item.abilityId === action.abilityId);
    const def = abilityById(match, action.abilityId);
    if (!slot || !def || slot.level >= def.levels.length) return;
    const cost = upgradeCost(match, slot.level);
    if (player.gold < cost) return;
    player.gold -= cost;
    slot.level += 1;
    emit(match, { type: "shop", round: match.round, playerId, action: "upgrade", abilityId: slot.abilityId, cost });
  }
}

export function isFighter(match: Match, playerId: string) {
  return match.duel.some((pair) => pair.a === playerId || pair.b === playerId);
}

export function placeBet(match: Match, playerId: string, targetId: string, amount: number) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || player.bet || match.phase !== "betting") return;
  if (isFighter(match, playerId)) return;
  const fighters = match.duel.flatMap((pair) => [pair.a, pair.b]);
  if (!fighters.includes(targetId)) return;
  const bet = clamp(Math.floor(amount), match.data.economy.betMin, match.data.economy.betMax);
  if (player.gold < bet) return;
  player.gold -= bet;
  player.bet = { targetId, amount: bet };
  emit(match, { type: "bet", round: match.round, playerId, targetId, amount: bet });
}

export function surrender(match: Match, playerId: string) {
  const player = playerById(match, playerId);
  if (!player || player.eliminated || match.phase === "ended") return;
  player.surrendered = true;
  eliminate(match, player, "desistiu");
  checkWinner(match);
}
