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
  dealDamage(match, { source: creep, target, amount: creep.damage });
});
