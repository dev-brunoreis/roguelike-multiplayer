import { creepSkillBusy } from "./creepSkills.js";
import { getBehavior, getCreepBehavior } from "./registry.js";
import type { Entity, Match } from "./types.js";
import { dealDamage } from "./damage.js";
import { playerById } from "./world.js";
import {
  abilityById,
  alivePlayers,
  arenaById,
  clampToArena,
  dist,
  heroEntity,
} from "./world.js";

function clampAll(match: Match) {
  for (const entity of match.entities) {
    if (!entity.alive) continue;
    const arena = arenaById(match, entity.arenaId);
    if (arena) clampToArena(entity, arena);
  }
}

export function simulateMove(match: Match, dt: number) {
  moveHeroes(match, dt);
  separate(match);
  clampAll(match);
}

export function simulateCombat(match: Match, dt: number) {
  moveHeroes(match, dt);
  moveCreeps(match, dt);
  separate(match);
  clampAll(match);
  castAbilities(match);
  moveProjectiles(match, dt);
}

function moveHeroes(match: Match, dt: number) {
  for (const player of alivePlayers(match)) {
    const entity = heroEntity(match, player);
    if (!entity?.alive) continue;
    let x = player.inputX;
    let y = player.inputY;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const speed = entity.speed * (1 + player.stats.moveSpeedPct);
    if (len > 0.05) {
      entity.x += x * speed * dt;
      entity.y += y * speed * dt;
    }
    if (player.aimX != null && player.aimY != null) {
      entity.facing = Math.atan2(player.aimY - entity.y, player.aimX - entity.x);
    } else if (len > 0.05) {
      entity.facing = Math.atan2(y, x);
    } else {
      const enemy = nearestEnemy(match, entity);
      if (enemy) entity.facing = Math.atan2(enemy.y - entity.y, enemy.x - entity.x);
    }
  }
}

function nearestEnemy(match: Match, entity: Entity) {
  let best: Entity | undefined;
  let bestDist = Infinity;
  for (const other of match.entities) {
    if (!other.alive || other.arenaId !== entity.arenaId || other.team === entity.team) continue;
    const gap = dist(entity, other);
    if (gap < bestDist) {
      best = other;
      bestDist = gap;
    }
  }
  return best;
}

function moveCreeps(match: Match, dt: number) {
  for (const entity of match.entities) {
    if (!entity.alive || entity.kind === "hero") continue;
    if (creepSkillBusy(match, entity, dt)) continue;
    const behavior = getCreepBehavior(entity.behavior);
    behavior?.(match, entity, dt);
  }
}

function separate(match: Match) {
  const list = match.entities.filter((entity) => entity.alive);
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.arenaId !== b.arenaId) continue;
      const gap = dist(a, b);
      const min = a.radius + b.radius;
      if (gap >= min) continue;
      if (gap < 0.0001) {
        a.x += 0.05;
        continue;
      }
      const push = (min - gap) / 2;
      const nx = (a.x - b.x) / gap;
      const ny = (a.y - b.y) / gap;
      a.x += nx * push;
      a.y += ny * push;
      b.x -= nx * push;
      b.y -= ny * push;
    }
  }
}

function castAbilities(match: Match) {
  for (const player of alivePlayers(match)) {
    const caster = heroEntity(match, player);
    if (!caster?.alive) continue;
    for (const slot of player.abilities) {
      if (slot.cooldown > 0) continue;
      const ability = abilityById(match, slot.abilityId);
      if (!ability) continue;
      const level = ability.levels[Math.min(slot.level, ability.levels.length) - 1];
      if (!level) continue;
      const behavior = getBehavior(ability.behavior);
      if (!behavior) continue;
      const fired = behavior({ match, player, caster, ability, level });
      if (!fired) continue;
      const haste = 1 + player.stats.attackSpeedPct;
      const cdr = 1 - Math.min(0.6, player.stats.cooldownPct);
      const cooldown = (level.cooldown / haste) * cdr;
      slot.cooldown = cooldown;
      slot.cooldownMax = cooldown;
    }
  }
}

function moveProjectiles(match: Match, dt: number) {
  for (const shot of match.projectiles) {
    shot.ttl -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    const owner = playerById(match, shot.ownerId);
    const source = owner
      ? heroEntity(match, owner)
      : match.entities.find((entity) => entity.id === shot.sourceId);
    const hit = match.entities.find(
      (entity) =>
        entity.alive &&
        entity.arenaId === shot.arenaId &&
        entity.team !== shot.team &&
        dist(entity, shot) <= entity.radius + shot.radius,
    );
    if (!hit) continue;
    dealDamage(match, {
      source: source ?? undefined,
      sourcePlayer: owner,
      target: hit,
      amount: shot.damage,
      abilityId: shot.abilityId,
      crit: shot.crit,
    });
    shot.ttl = 0;
  }
  match.projectiles = match.projectiles.filter((shot) => shot.ttl > 0);
}
