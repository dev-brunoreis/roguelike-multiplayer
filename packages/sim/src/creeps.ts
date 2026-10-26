import { dealDamage } from "./damage.js";
import { canSee, walkTo } from "./nav.js";
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

function callGroup(match: Match, creep: Entity, target: Entity) {
  const radius = match.data.dungeon?.callRadius ?? 6;
  for (const other of match.entities) {
    if (!other.alive || other.kind === "hero" || other.arenaId !== creep.arenaId || other.id === creep.id) continue;
    if (dist(creep, other) > radius) continue;
    const skill = skillOf(match, other.id);
    if (skill.mood === "return") continue;
    if (skill.homeX == null) continue;
    skill.mood = "chase";
    skill.focus = target.id;
    skill.returning = false;
    skill.stuck = 0;
  }
}

function pickTarget(match: Match, creep: Entity) {
  const home = homeOf(match, creep);
  const heroes = heroesIn(match, creep);
  const skill = skillOf(match, creep.id);
  const giveUp = match.data.dungeon?.giveUpSeconds ?? 2.4;
  if (!home) return nearest(creep, heroes);
  if (skill.mood === "" || skill.mood === "idle") skill.mood = "idle";
  if (skill.mood === "return" || dist(creep, home) > home.reach || skill.stuck >= giveUp) {
    skill.mood = "return";
    skill.returning = true;
    skill.focus = 0;
    return null;
  }
  const held = skill.focus ? heroes.find((hero) => hero.id === skill.focus) : undefined;
  if (held && dist(held, home) <= home.reach && (canSee(match, creep, held) || skill.mood === "chase")) {
    skill.mood = "chase";
    return held;
  }
  const seen = heroes.filter((hero) => dist(creep, hero) <= home.radius && dist(hero, home) <= home.reach && canSee(match, creep, hero));
  const next = nearest(creep, seen);
  if (!next) {
    if (skill.mood === "chase") {
      skill.mood = "return";
      skill.returning = true;
      skill.focus = 0;
    }
    return null;
  }
  if (skill.mood !== "chase") callGroup(match, creep, next);
  skill.mood = "chase";
  skill.focus = next.id;
  skill.returning = false;
  return next;
}

function holdOrHome(match: Match, creep: Entity, dt: number) {
  const home = homeOf(match, creep);
  const target = pickTarget(match, creep);
  if (!target) {
    if (home && dist(creep, home) > 0.05) {
      const skill = skillOf(match, creep.id);
      skill.mood = "return";
      skill.returning = true;
      const speed = match.data.dungeon?.returnSpeedMul ?? 1.15;
      walkTo(match, creep, home, dt, speed);
      const giveUp = match.data.dungeon?.giveUpSeconds ?? 2.4;
      if (dist(creep, home) > 0.25 && skill.stuck < giveUp) return null;
      creep.hp = creep.maxHp;
      skill.returning = false;
      skill.mood = "idle";
      skill.stuck = 0;
      skill.focus = 0;
      creep.x = home.x;
      creep.y = home.y;
    }
    return null;
  }
  return target;
}

function flankOf(match: Match, creep: Entity, target: Entity) {
  const radius = match.data.dungeon?.flankRadius ?? 1.35;
  const angle = (creep.id * 2.399963) % (Math.PI * 2);
  return {
    x: target.x + Math.cos(angle) * radius,
    y: target.y + Math.sin(angle) * radius,
  };
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
    const flank = flankOf(match, creep, target);
    walkTo(match, creep, canSee(match, creep, flank) ? flank : target, dt, moveScale(match, creep.id));
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
  const scale = moveScale(match, creep.id);
  if (!canSee(match, creep, target)) {
    walkTo(match, creep, flankOf(match, creep, target), dt, scale);
    return;
  }
  if (gap < close || gap > far) {
    const dir = gap < close ? -1 : 1;
    const aim = {
      x: creep.x + ((target.x - creep.x) / Math.max(gap, 0.01)) * dir * 1.6,
      y: creep.y + ((target.y - creep.y) / Math.max(gap, 0.01)) * dir * 1.6,
    };
    walkTo(match, creep, aim, dt, scale);
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
