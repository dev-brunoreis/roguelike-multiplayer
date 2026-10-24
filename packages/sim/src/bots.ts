import { isFighter, pickCard, placeBet, shopAct, upgradeCost } from "./actions.js";
import { getBot, registerBot } from "./registry.js";
import type { Match, PlayerState } from "./types.js";
import { cardById, dist, heroEntity } from "./world.js";

const RARITY: Record<string, number> = { comum: 0, incomum: 1, raro: 2, epico: 3, lendario: 4 };

registerBot("simple", (match, player) => {
  if (player.pendingCards.length > 0) {
    const best = [...player.pendingCards].sort((a, b) => {
      const left = RARITY[cardById(match, a)?.rarity ?? ""] ?? 0;
      const right = RARITY[cardById(match, b)?.rarity ?? ""] ?? 0;
      return right - left;
    })[0];
    if (best) pickCard(match, player.id, best, false);
  }
  if ((match.phase === "shop" || match.phase === "hub") && !player.botActed) {
    player.botActed = true;
    for (const slot of player.abilities) {
      const def = match.data.abilities.find((ability) => ability.id === slot.abilityId);
      if (!def || slot.level >= def.levels.length) continue;
      if (player.gold >= upgradeCost(match, slot.level)) {
        shopAct(match, player.id, { kind: "upgrade", abilityId: slot.abilityId });
        break;
      }
    }
    shopAct(match, player.id, { kind: "ready" });
  }
  if (
    (match.phase === "betting" || (match.phase === "hub" && match.duel.length > 0))
    && !player.bet
    && !isFighter(match, player.id)
  ) {
    const fighters = match.duel.flatMap((pair) => [pair.a, pair.b]);
    if (fighters.length > 0 && player.gold >= match.data.economy.betMin) {
      placeBet(match, player.id, match.rng.pick(fighters), match.data.economy.betMin);
    }
  }
  steer(match, player);
});

function steer(match: Match, player: PlayerState) {
  const entity = heroEntity(match, player);
  if (!entity?.alive || player.paused) {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  const enemies = match.entities.filter(
    (other) => other.alive && other.arenaId === entity.arenaId && other.team !== entity.team,
  );
  enemies.sort((a, b) => dist(entity, a) - dist(entity, b));
  const target = enemies[0];
  if (!target) {
    if (match.tick % 40 === 0) player.wander = match.rng.next() * Math.PI * 2;
    player.inputX = Math.cos(player.wander);
    player.inputY = Math.sin(player.wander);
    return;
  }
  const away = entity.hp / entity.maxHp < 0.28;
  player.inputX = (target.x - entity.x) * (away ? -1 : 1);
  player.inputY = (target.y - entity.y) * (away ? -1 : 1);
}

export function runBots(match: Match) {
  const bot = getBot("simple");
  if (!bot) return;
  for (const player of match.players) {
    if (!player.isBot || player.eliminated) continue;
    bot(match, player);
  }
}
