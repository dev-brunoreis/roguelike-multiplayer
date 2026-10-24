import { dealDamage } from "./damage.js";
import { registerCreepBehavior } from "./registry.js";
import type { Entity, Match } from "./types.js";
import { moveScale } from "./spells/status.js";
import { pushShot } from "./spells/shots.js";
import { creepById, dist, skillOf } from "./world.js";

function heroesIn(match: Match, creep: Entity) {
  return match.entities.filter(
    (entity) => entity.alive && entity.kind === "hero" && entity.arenaId === creep.arenaId && entity.team !== creep.team,
  );
}

function homeOf(match: Match, creep: Entity) {
  const skill = match.skillState.get(creep.id);
  if (!skill || skill.homeX == null || skill.homeY == null) return null;
  const def = creepById(match, creep.defId);
  return {
    x: skill.homeX,
    y: skill.homeY,
    radius: def?.aggro?.radius ?? match.data.dungeon?.aggroRadius ?? 6,
    reach: def?.aggro?.leash ?? match.data.dungeon?.leashRadius ?? 9,
  };
}

function nearest(creep: Entity, heroes: Entity[]) {
  const sorted = [...heroes].sort((a, b) => dist(creep, a) - dist(creep, b));
  return sorted[0] ?? null;
}

function walkHome(match: Match, creep: Entity, dt: number, home: { x: number; y: number }) {
  const gap = dist(creep, home);
  if (gap <= 0.35) {
    const skill = skillOf(match, creep.id);
    skill.returning = false;
    creep.hp = creep.maxHp;
    creep.x = home.x;
    creep.y = home.y;
    return;
  }
  const step = Math.min(creep.speed * dt * moveScale(match, creep.id), gap);
  creep.facing = Math.atan2(home.y - creep.y, home.x - creep.x);
  creep.x += ((home.x - creep.x) / gap) * step;
  creep.y += ((home.y - creep.y) / gap) * step;
}

function pickTarget(match: Match, creep: Entity) {
  const home = homeOf(match, creep);
  const heroes = heroesIn(match, creep);
  if (!home) return nearest(creep, heroes);
  const skill = skillOf(match, creep.id);
  if (skill.returning || dist(creep, home) > home.reach) {
    skill.returning = true;
    return null;
  }
  const near = heroes.filter((hero) => dist(creep, hero) <= home.radius && dist(hero, home) <= home.reach);
  return nearest(creep, near);
}

function holdOrHome(match: Match, creep: Entity, dt: number) {
  const home = homeOf(match, creep);
  const target = pickTarget(match, creep);
  if (!target) {
    if (home && dist(creep, home) > 0.05) {
      skillOf(match, creep.id).returning = true;
      walkHome(match, creep, dt, home);
    }
    return null;
  }
  return target;
}

registerCreepBehavior("chase", (match, creep, dt) => {
  const target = holdOrHome(match, creep, dt);
  if (!target) return;
  const gap = dist(creep, target);
  const reach = creep.attackRange + target.radius * 0.4;
  creep.facing = Math.atan2(target.y - creep.y, target.x - creep.x);
  if ((creep.winding ?? 0) > 0) {
    creep.winding = Math.max(0, (creep.winding ?? 0) - dt);
    if (creep.winding > 0) return;
    creep.attackTimer = creep.attackCooldown;
    creep.swing = (creep.swing ?? 0) + 1;
    if (gap <= reach) dealDamage(match, { source: creep, target, amount: creep.damage });
    return;
  }
  if (gap > reach) {
    const step = creep.speed * dt * moveScale(match, creep.id);
    creep.x += ((target.x - creep.x) / gap) * step;
    creep.y += ((target.y - creep.y) / gap) * step;
    return;
  }
  const windup = creep.attackWindup ?? 0;
  if (windup > 0 && creep.attackTimer <= windup) {
    creep.winding = creep.attackTimer > 0 ? creep.attackTimer : windup;
    creep.attackTimer = 0;
    return;
  }
  creep.attackTimer -= dt;
  if (creep.attackTimer > 0) return;
  creep.attackTimer = creep.attackCooldown;
  creep.swing = (creep.swing ?? 0) + 1;
  dealDamage(match, { source: creep, target, amount: creep.damage });
});

registerCreepBehavior("kite", (match, creep, dt) => {
  const target = holdOrHome(match, creep, dt);
  if (!target) return;
  const gap = dist(creep, target);
  creep.facing = Math.atan2(target.y - creep.y, target.x - creep.x);
  const close = creep.attackRange * 0.55;
  const far = creep.attackRange * 0.92;
  if (gap < close || gap > far) {
    const dir = gap < close ? -1 : 1;
    const step = creep.speed * dt * moveScale(match, creep.id);
    creep.x += ((target.x - creep.x) / Math.max(gap, 0.01)) * step * dir;
    creep.y += ((target.y - creep.y) / Math.max(gap, 0.01)) * step * dir;
    if (gap > far) return;
  }
  creep.attackTimer -= dt;
  if (creep.attackTimer > 0) return;
  creep.attackTimer = creep.attackCooldown;
  creep.swing = (creep.swing ?? 0) + 1;
  const speed = 9;
  const aimX = target.x - creep.x;
  const aimY = target.y - creep.y;
  const len = Math.hypot(aimX, aimY) || 1;
  pushShot(match, {
    x: creep.x,
    y: creep.y,
    vx: (aimX / len) * speed,
    vy: (aimY / len) * speed,
    radius: 0.16,
    damage: creep.damage,
    crit: false,
    arenaId: creep.arenaId,
    team: creep.team,
    ownerId: "",
    sourceId: creep.id,
    abilityId: creep.defId,
    color: creep.color,
    ttl: 1.8,
    vfx: "orb",
    pierce: 0,
    curve: 0,
    returns: false,
    originX: creep.x,
    originY: creep.y,
    range: 0,
    status: "",
    statusTime: 0,
    statusValue: 0,
    orbit: false,
    angle: 0,
    orbitRadius: 0,
    spin: 0,
  });
});
