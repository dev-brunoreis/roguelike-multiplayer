import type { CardDef } from "@game/shared";
import type { Match, PlayerState } from "./types.js";
import { abilityById, addLog, emit } from "./world.js";

export function grantXp(match: Match, player: PlayerState, amount: number) {
  if (player.eliminated || player.level >= match.config.levelCap) return;
  player.xp += amount * (1 + player.stats.xpPct);
  tryLevel(match, player);
}

export function tryLevel(match: Match, player: PlayerState) {
  if (player.pendingCards.length > 0 || player.eliminated) return;
  if (player.level >= match.config.levelCap) return;
  const need = Math.max(1, Math.floor(match.config.xpBase * Math.pow(player.level, match.config.xpPower)));
  if (player.xp < need) return;
  player.xp -= need;
  player.level += 1;
  player.unspentPicks += 1;
  emit(match, { type: "level", round: match.round, playerId: player.id, level: player.level });
  addLog(match, `${player.name} subiu para o nível ${player.level}`);
  if (match.phase === "hub") offerCards(match, player);
  else tryLevel(match, player);
}

export function offerCards(match: Match, player: PlayerState) {
  const pool = match.data.cards.filter((card) => eligible(match, player, card));
  const picked: string[] = [];
  const draft = [...pool];
  const count = Math.min(match.config.cardsPerLevelUp, draft.length);
  for (let i = 0; i < count; i += 1) {
    const total = draft.reduce((sum, card) => sum + card.weight, 0);
    let roll = match.rng.next() * total;
    let index = draft.length - 1;
    for (let n = 0; n < draft.length; n += 1) {
      roll -= draft[n]!.weight;
      if (roll <= 0) {
        index = n;
        break;
      }
    }
    const [card] = draft.splice(index, 1);
    if (card) picked.push(card.id);
  }
  if (picked.length === 0) {
    player.unspentPicks = Math.max(0, player.unspentPicks - 1);
    return;
  }
  player.pendingCards = picked;
  player.cardTimer = match.config.cardPickSeconds;
  emit(match, { type: "card_offer", round: match.round, playerId: player.id, cards: picked });
}

export function eligible(match: Match, player: PlayerState, card: CardDef) {
  if (card.unique && player.cards.includes(card.id)) return false;
  if (card.requires?.ability && !player.abilities.some((slot) => slot.abilityId === card.requires?.ability)) return false;
  if (card.requires?.missingAbility && player.abilities.some((slot) => slot.abilityId === card.requires?.missingAbility)) {
    return false;
  }
  for (const effect of card.effects) {
    if (effect.type === "upgradeAbility" && effect.abilityId) {
      const slot = player.abilities.find((item) => item.abilityId === effect.abilityId);
      const def = abilityById(match, effect.abilityId);
      if (!slot || !def || slot.level >= def.levels.length) return false;
    }
    if (effect.type === "grantAbility" && effect.abilityId) {
      if (player.abilities.some((slot) => slot.abilityId === effect.abilityId)) return false;
    }
  }
  return true;
}
