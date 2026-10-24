import { pickCard, shopAct } from "./actions.js";
import { getBot, getMode, registerBot } from "./registry.js";
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
  return match.data.byId.cards.get(id)?.rarity ?? "";
}

function attackPlan(match: Match, player: PlayerState) {
  let melee = Infinity;
  let ranged = 0;
  for (const slot of player.abilities) {
    const def = abilityById(match, slot.abilityId);
    const level = def?.levels[Math.min(slot.level, def.levels.length) - 1];
    if (!def || !level) continue;
    if (def.behavior === "projectile" || def.behavior === "chain") ranged = Math.max(ranged, level.range);
    else if (def.behavior === "aoe") melee = Math.min(melee, (level.radius ?? level.range) * 0.8);
    else melee = Math.min(melee, level.range * 0.82);
  }
  if (melee < Infinity) return { hold: melee, kite: false };
  return { hold: Math.max(3.2, ranged * 0.72), kite: true };
}

export function steer(match: Match, player: PlayerState) {
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
    player.aimX = entity.x + Math.cos(player.wander) * 4;
    player.aimY = entity.y + Math.sin(player.wander) * 4;
    return;
  }
  player.aimX = target.x;
  player.aimY = target.y;
  const gap = dist(entity, target);
  const plan = attackPlan(match, player);
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const biting = enemies.some((enemy) => dist(entity, enemy) <= enemy.attackRange + entity.radius * 0.5);
  if (!plan.kite) {
    if (gap > plan.hold) {
      setMove(player, entity, arena, dx, dy);
      return;
    }
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  const hpRatio = entity.hp / entity.maxHp;
  const hold = hpRatio < 0.4 ? plan.hold + 1.4 : plan.hold;
  if (biting || gap < hold - 1.1) {
    let sx = 0;
    let sy = 0;
    for (const enemy of enemies) {
      if (dist(entity, enemy) > enemy.attackRange + entity.radius + 0.4 && enemy !== target) continue;
      sx += entity.x - enemy.x;
      sy += entity.y - enemy.y;
    }
    setMove(player, entity, arena, sx || -dx, sy || -dy);
    return;
  }
  if (gap > hold + 0.45) {
    setMove(player, entity, arena, dx, dy);
    return;
  }
  player.inputX = 0;
  player.inputY = 0;
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
  const bot = getBot(getMode(match.mode).bot);
  if (!bot) return;
  for (const player of match.players) {
    if (!player.isBot || player.eliminated) continue;
    bot(match, player);
  }
}
