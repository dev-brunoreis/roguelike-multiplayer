import { resolveObstacles } from "./obstacles.js";
import { getCreepBehavior } from "./registry.js";
import type { Entity, Match } from "./types.js";
import {
  abilityById,
  alivePlayers,
  arenaById,
  clampToArena,
  dist,
  heroEntity,
} from "./world.js";
import { castSpell } from "./spells/cast.js";
import { creepCastBusy, tickBossPhases, tickTelegraphs, tickVolleys, tickWarnings, tickZones } from "./spells/runtime.js";
import { tickShots } from "./spells/shots.js";
import { isStunned, moveScale, tickStatuses } from "./spells/status.js";

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
  resolveObstacles(match);
}

export function resolveCombat(match: Match, dt: number) {
  castAbilities(match);
  tickShots(match, dt);
  tickZones(match, dt);
  tickVolleys(match, dt);
  tickTelegraphs(match, dt);
  tickWarnings(match);
  tickStatuses(match, dt);
}

export function simulateCombat(match: Match, dt: number) {
  moveHeroes(match, dt);
  moveCreeps(match, dt);
  separate(match);
  clampAll(match);
  resolveObstacles(match);
  resolveCombat(match, dt);
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
    const speed = entity.speed * (1 + player.stats.moveSpeedPct) * moveScale(match, entity.id);
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
  tickBossPhases(match);
  for (const entity of match.entities) {
    if (!entity.alive || entity.kind === "hero") continue;
    if (isStunned(match, entity.id)) continue;
    if (creepCastBusy(match, entity, dt)) continue;
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
    if (!caster?.alive || isStunned(match, caster.id)) continue;
    for (const slot of player.abilities) {
      if (slot.cooldown > 0) continue;
      const ability = abilityById(match, slot.abilityId);
      if (!ability) continue;
      const level = ability.levels[Math.min(slot.level, ability.levels.length) - 1];
      if (!level) continue;
      const fired = castSpell(match, caster, ability, {
        player,
        level,
        spellId: ability.id,
        color: ability.color,
        vfx: ability.vfx ?? "",
        targeting: ability.targeting,
      });
      if (!fired) continue;
      const haste = 1 + player.stats.attackSpeedPct;
      const cdr = 1 - Math.min(0.6, player.stats.cooldownPct);
      const cooldown = (level.cooldown / haste) * cdr;
      slot.cooldown = cooldown;
      slot.cooldownMax = cooldown;
    }
  }
}

