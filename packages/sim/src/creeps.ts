import { dealDamage } from "./damage.js";
import { registerCreepBehavior } from "./registry.js";
import { dist } from "./world.js";

registerCreepBehavior("chase", (match, creep, dt) => {
  const heroes = match.entities.filter(
    (entity) => entity.alive && entity.kind === "hero" && entity.arenaId === creep.arenaId && entity.team !== creep.team,
  );
  if (heroes.length === 0) return;
  heroes.sort((a, b) => dist(creep, a) - dist(creep, b));
  const target = heroes[0]!;
  const gap = dist(creep, target);
  creep.facing = Math.atan2(target.y - creep.y, target.x - creep.x);
  if (gap > creep.attackRange + target.radius * 0.4) {
    const step = creep.speed * dt;
    creep.x += ((target.x - creep.x) / gap) * step;
    creep.y += ((target.y - creep.y) / gap) * step;
    return;
  }
  creep.attackTimer -= dt;
  if (creep.attackTimer > 0) return;
  creep.attackTimer = creep.attackCooldown;
  creep.swing = (creep.swing ?? 0) + 1;
  dealDamage(match, { source: creep, target, amount: creep.damage });
});

registerCreepBehavior("kite", (match, creep, dt) => {
  const heroes = match.entities.filter(
    (entity) => entity.alive && entity.kind === "hero" && entity.arenaId === creep.arenaId && entity.team !== creep.team,
  );
  if (heroes.length === 0) return;
  heroes.sort((a, b) => dist(creep, a) - dist(creep, b));
  const target = heroes[0]!;
  const gap = dist(creep, target);
  creep.facing = Math.atan2(target.y - creep.y, target.x - creep.x);
  const close = creep.attackRange * 0.55;
  const far = creep.attackRange * 0.92;
  if (gap < close || gap > far) {
    const dir = gap < close ? -1 : 1;
    const step = creep.speed * dt;
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
  match.projectiles.push({
    id: match.nextId++,
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
  });
});
