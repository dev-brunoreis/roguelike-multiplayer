import { pickCard } from "../../actions.js";
import { steer } from "../../bots.js";
import { faceWalk } from "../../nav.js";
import { registerBot } from "../../registry.js";
import type { Match, PlayerState } from "../../types.js";
import { dist, heroEntity } from "../../world.js";

const RARITY: Record<string, number> = { comum: 0, incomum: 1, raro: 2, epico: 3, lendario: 4 };

function pickOffer(match: Match, player: PlayerState) {
  if (player.pendingCards.length === 0) return;
  const best = [...player.pendingCards].sort((a, b) => {
    const left = RARITY[match.data.byId.cards.get(a)?.rarity ?? ""] ?? 0;
    const right = RARITY[match.data.byId.cards.get(b)?.rarity ?? ""] ?? 0;
    return right - left;
  })[0];
  if (best) pickCard(match, player.id, best, false);
}

function neighbors(match: Match) {
  const map = new Map<string, string[]>();
  for (const portal of match.dungeon?.portals ?? []) {
    const list = map.get(portal.arenaId) ?? [];
    list.push(portal.toArenaId);
    map.set(portal.arenaId, list);
  }
  return map;
}

function nearestGoal(match: Match, from: string) {
  const goals = match.players.filter((player) => !player.isBot && !player.eliminated);
  const pool = goals.length > 0 ? goals : match.players.filter((player) => !player.eliminated);
  let best: string | null = null;
  let bestHop: string | null = null;
  let bestDist = Infinity;
  const next = neighbors(match);
  for (const goal of pool) {
    if (goal.arenaId === from) return { room: from, hop: null };
    const queue = [{ id: from, hop: null as string | null, dist: 0 }];
    const seen = new Set([from]);
    while (queue.length > 0) {
      const at = queue.shift()!;
      if (at.id === goal.arenaId && at.dist < bestDist) {
        best = goal.arenaId;
        bestHop = at.hop;
        bestDist = at.dist;
        break;
      }
      for (const step of next.get(at.id) ?? []) {
        if (seen.has(step)) continue;
        seen.add(step);
        queue.push({ id: step, hop: at.hop ?? step, dist: at.dist + 1 });
      }
    }
  }
  return { room: best, hop: bestHop };
}

registerBot("coop", (match, player) => {
  pickOffer(match, player);
  const entity = heroEntity(match, player);
  if (!entity?.alive || player.downed || player.paused) {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  const downed = match.players.find((ally) => {
    if (ally.id === player.id || !ally.downed || ally.eliminated) return false;
    const body = heroEntity(match, ally);
    return body?.arenaId === entity.arenaId;
  });
  if (downed) {
    const body = heroEntity(match, downed);
    if (body) faceWalk(match, player, entity, body, match.data.dungeon.reviveRadius * 0.7);
    return;
  }
  const enemies = match.entities.some((other) => other.alive && other.kind !== "hero" && other.arenaId === entity.arenaId);
  if (enemies) {
    steer(match, player);
    return;
  }
  const goal = nearestGoal(match, entity.arenaId);
  if (!goal.hop) {
    const human = match.players.find((ally) => !ally.isBot && !ally.eliminated && ally.arenaId === entity.arenaId);
    const body = human ? heroEntity(match, human) : undefined;
    if (body && dist(entity, body) > 2.2) faceWalk(match, player, entity, body, 1.6);
    else {
      player.inputX = 0;
      player.inputY = 0;
    }
    return;
  }
  const portal = match.dungeon?.portals.find((item) => item.arenaId === entity.arenaId && item.toArenaId === goal.hop);
  if (!portal) {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  faceWalk(match, player, entity, portal, 0.2);
});
