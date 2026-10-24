import { eligible } from "../progression.js";
import type { Match, PlayerState } from "../types.js";
import { beginHub, updateHub } from "./hub.js";

export function beginShop(match: Match) {
  beginHub(match);
}

export function rollShop(match: Match, player: PlayerState) {
  const pool = match.data.cards.filter((card) => eligible(match, player, card));
  const draft = [...pool];
  const offers: string[] = [];
  for (let i = 0; i < match.config.shopSlots && draft.length > 0; i += 1) {
    const total = draft.reduce((sum, card) => sum + card.weight, 0);
    let roll = match.rng.next() * total;
    let index = 0;
    for (let n = 0; n < draft.length; n += 1) {
      roll -= draft[n]!.weight;
      if (roll <= 0) {
        index = n;
        break;
      }
    }
    const [card] = draft.splice(index, 1);
    if (card) offers.push(card.id);
  }
  return offers;
}

export function updateShop(match: Match, dt: number) {
  updateHub(match, dt);
}
