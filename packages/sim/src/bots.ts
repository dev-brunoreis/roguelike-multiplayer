import { pickCard, shopAct } from "./actions.js";
import { getBot, registerBot } from "./registry.js";
import type { Match, PlayerState } from "./types.js";
import type { Arena } from "./types.js";
import { abilityById, arenaById, dist, heroEntity } from "./world.js";

const RARITY: Record<string, number> = { comum: 0, incomum: 1, raro: 2, epico: 3, lendario: 4 };

registerBot("simple", (match, player) => {
  if (player.pendingCards.length > 0) {
    const best = [...player.pendingCards].sort((a, b) => {
      const left = RARITY[cardRarity(match, a)] ?? 0;
      const right = RARITY[cardRarity(match, b)] ?? 0;
      return right - left;
    })[0];
    if (best) pickCard(match, player.id, best, false);
  }
  if (match.phase === "hub" && !player.botActed) {
    player.botActed = true;
    shopAct(match, player.id, { kind: "ready" });
  }
  steer(match, player);
});

function cardRarity(match: Match, id: string) {
  return match.data.cards.find((card) => card.id === id)?.rarity ?? "";
}

function preferRange(match: Match, player: PlayerState, hpRatio: number) {
  let range = 1.7;
  for (const slot of player.abilities) {
    const def = abilityById(match, slot.abilityId);
    const level = def?.levels[Math.min(slot.level, def.levels.length) - 1];
    if (!def || !level) continue;
    if (def.behavior === "projectile" || def.behavior === "chain") range = Math.max(range, level.range * 0.7);
    else if (def.behavior === "aoe") range = Math.max(range, (level.radius ?? level.range) * 0.55);
    else range = Math.max(range, Math.min(level.range, 2.4));
  }
  if (hpRatio < 0.42) range = Math.max(range, 4.4);
  if (hpRatio < 0.24) range = Math.max(range, 5.8);
  return range;
}

function steer(match: Match, player: PlayerState) {
  const entity = heroEntity(match, player);
  if (!entity?.alive || player.paused) {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  const arena = arenaById(match, entity.arenaId);
  const enemies = match.entities.filter(
    (other) => other.alive && other.arenaId === entity.arenaId && other.team !== entity.team,
  );
  enemies.sort((a, b) => dist(entity, a) - dist(entity, b));
  const target = enemies[0];
  if (!target) {
    if (match.tick % 40 === 0) player.wander = match.rng.next() * Math.PI * 2;
    setMove(player, entity, arena, Math.cos(player.wander), Math.sin(player.wander));
    return;
  }
  const gap = dist(entity, target);
  const want = preferRange(match, player, entity.hp / entity.maxHp);
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  if (gap < want - 0.45) {
    setMove(player, entity, arena, -dx, -dy);
    return;
  }
  if (gap > want + 0.7) {
    setMove(player, entity, arena, dx, dy);
    return;
  }
  const side = player.id.charCodeAt(0) % 2 === 0 ? 1 : -1;
  setMove(player, entity, arena, -dy * side, dx * side);
}

function setMove(
  player: PlayerState,
  entity: { x: number; y: number; radius: number },
  arena: Arena | undefined,
  dx: number,
  dy: number,
) {
  let nx = dx;
  let ny = dy;
  if (arena) {
    const pad = entity.radius + 0.55;
    const nextX = entity.x + Math.sign(dx || 1) * 0.8;
    const nextY = entity.y + Math.sign(dy || 1) * 0.8;
    const hitX = nextX < arena.x + pad || nextX > arena.x + arena.size - pad;
    const hitY = nextY < arena.y + pad || nextY > arena.y + arena.size - pad;
    if (hitX) nx = 0;
    if (hitY) ny = 0;
    if (nx === 0 && ny === 0) {
      const center = { x: arena.x + arena.size / 2, y: arena.y + arena.size / 2 };
      nx = center.x - entity.x;
      ny = center.y - entity.y;
    }
  }
  const len = Math.hypot(nx, ny) || 1;
  player.inputX = nx / len;
  player.inputY = ny / len;
}

export function runBots(match: Match) {
  const bot = getBot("simple");
  if (!bot) return;
  for (const player of match.players) {
    if (!player.isBot || player.eliminated) continue;
    bot(match, player);
  }
}
