import { dealDamage } from "./damage.js";
import { getTargeting, registerAbilityBehavior } from "./registry.js";
import type { AbilityContext, Entity, Match, PlayerState } from "./types.js";
import { dist, emitFx } from "./world.js";

function markSwing(entity: Entity) {
  entity.swing = (entity.swing ?? 0) + 1;
}

function rolledDamage(match: Match, player: PlayerState, base: number) {
  let amount = base * (1 + player.stats.damagePct);
  let crit = false;
  if (player.stats.critChance > 0 && match.rng.next() < player.stats.critChance) {
    amount *= player.stats.critMultiplier;
    crit = true;
  }
  return { amount, crit };
}

function seek(ctx: AbilityContext, origin: Entity, range: number, ignore: Set<number>) {
  const fn = getTargeting(ctx.ability.targeting) ?? getTargeting("nearest");
  if (!fn) return null;
  return fn(ctx.match, origin, range * (1 + ctx.player.stats.areaPct), ignore);
}

registerAbilityBehavior("single", (ctx) => {
  const range = ctx.level.range * (1 + ctx.player.stats.areaPct);
  const target = seek(ctx, ctx.caster, range, new Set());
  if (!target) return false;
  const hit = rolledDamage(ctx.match, ctx.player, ctx.level.damage);
  dealDamage(ctx.match, {
    source: ctx.caster,
    sourcePlayer: ctx.player,
    target,
    amount: hit.amount,
    abilityId: ctx.ability.id,
    crit: hit.crit,
  });
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "bolt",
    x: ctx.caster.x,
    y: ctx.caster.y,
    x2: target.x,
    y2: target.y,
    radius: 0.22,
    color: ctx.ability.color,
    arenaId: ctx.caster.arenaId,
    life: 0.22,
  });
  emitFx(ctx.match, {
    kind: "slash",
    x: target.x,
    y: target.y,
    radius: 1.1,
    color: ctx.ability.color,
    arenaId: ctx.caster.arenaId,
  });
  return true;
});

registerAbilityBehavior("chain", (ctx) => {
  const range = ctx.level.range * (1 + ctx.player.stats.areaPct);
  const jumps = ctx.level.targets ?? 1;
  const falloff = ctx.level.falloff ?? [1];
  const ignore = new Set<number>();
  let from = ctx.caster;
  let fired = false;
  for (let i = 0; i < jumps; i += 1) {
    const probe = { ...from, team: ctx.caster.team, id: -1 };
    const step = { ...ctx, ability: { ...ctx.ability, targeting: i === 0 ? ctx.ability.targeting : "nearest" } };
    const target = seek(step, probe, range, ignore);
    if (!target) break;
    ignore.add(target.id);
    const ratio = falloff[Math.min(i, falloff.length - 1)] ?? 1;
    const hit = rolledDamage(ctx.match, ctx.player, ctx.level.damage * ratio);
    dealDamage(ctx.match, {
      source: ctx.caster,
      sourcePlayer: ctx.player,
      target,
      amount: hit.amount,
      abilityId: ctx.ability.id,
      crit: hit.crit,
    });
    emitFx(ctx.match, {
      kind: "bolt",
      x: from.x,
      y: from.y,
      x2: target.x,
      y2: target.y,
      radius: 0.28,
      color: ctx.ability.color,
      arenaId: ctx.caster.arenaId,
      life: 0.28,
    });
    emitFx(ctx.match, {
      kind: "flash",
      x: target.x,
      y: target.y,
      radius: 0.85,
      color: ctx.ability.color,
      arenaId: ctx.caster.arenaId,
    });
    from = target;
    fired = true;
  }
  if (fired) markSwing(ctx.caster);
  return fired;
});

registerAbilityBehavior("aoe", (ctx) => {
  const range = ctx.level.range * (1 + ctx.player.stats.areaPct);
  const radius = (ctx.level.radius ?? ctx.level.range) * (1 + ctx.player.stats.areaPct);
  const center = seek(ctx, ctx.caster, range, new Set());
  if (!center) return false;
  const hit = rolledDamage(ctx.match, ctx.player, ctx.level.damage);
  const victims = ctx.match.entities.filter(
    (entity) => entity.alive && entity.arenaId === ctx.caster.arenaId && entity.team !== ctx.caster.team && dist(center, entity) <= radius + entity.radius,
  );
  if (victims.length === 0) return false;
  for (const target of victims) {
    dealDamage(ctx.match, {
      source: ctx.caster,
      sourcePlayer: ctx.player,
      target,
      amount: hit.amount,
      abilityId: ctx.ability.id,
      crit: hit.crit,
    });
  }
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "ring",
    x: center.x,
    y: center.y,
    radius,
    color: ctx.ability.color,
    arenaId: ctx.caster.arenaId,
    life: 0.45,
  });
  return true;
});

registerAbilityBehavior("projectile", (ctx) => {
  const range = ctx.level.range * (1 + ctx.player.stats.areaPct);
  const target = seek(ctx, ctx.caster, range, new Set());
  if (!target) return false;
  const hit = rolledDamage(ctx.match, ctx.player, ctx.level.damage);
  const speed = ctx.level.projectileSpeed ?? 10;
  const dx = target.x - ctx.caster.x;
  const dy = target.y - ctx.caster.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.match.projectiles.push({
    id: ctx.match.nextId++,
    x: ctx.caster.x,
    y: ctx.caster.y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    radius: 0.18,
    damage: hit.amount,
    crit: hit.crit,
    arenaId: ctx.caster.arenaId,
    team: ctx.caster.team,
    ownerId: ctx.player.id,
    abilityId: ctx.ability.id,
    color: ctx.ability.color,
    ttl: 2.2,
  });
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "flash",
    x: ctx.caster.x,
    y: ctx.caster.y,
    radius: 0.4,
    color: ctx.ability.color,
    arenaId: ctx.caster.arenaId,
    life: 0.2,
  });
  return true;
});

registerAbilityBehavior("cone", (ctx) => {
  const range = ctx.level.range * (1 + ctx.player.stats.areaPct);
  const angle = ((ctx.level.angle ?? 60) * Math.PI) / 180;
  const facing = ctx.caster.facing;
  const victims = ctx.match.entities.filter((entity) => {
    if (!entity.alive || entity.arenaId !== ctx.caster.arenaId || entity.team === ctx.caster.team) return false;
    const d = dist(ctx.caster, entity);
    if (d > range + entity.radius) return false;
    const aim = Math.atan2(entity.y - ctx.caster.y, entity.x - ctx.caster.x);
    let delta = Math.abs(aim - facing);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    return delta <= angle / 2;
  });
  if (victims.length === 0) return false;
  const hit = rolledDamage(ctx.match, ctx.player, ctx.level.damage);
  for (const target of victims) {
    dealDamage(ctx.match, {
      source: ctx.caster,
      sourcePlayer: ctx.player,
      target,
      amount: hit.amount,
      abilityId: ctx.ability.id,
      crit: hit.crit,
    });
  }
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "bolt",
    x: ctx.caster.x,
    y: ctx.caster.y,
    x2: ctx.caster.x + Math.cos(facing) * range,
    y2: ctx.caster.y + Math.sin(facing) * range,
    radius: 0.45,
    color: ctx.ability.color,
    arenaId: ctx.caster.arenaId,
    life: 0.28,
  });
  emitFx(ctx.match, {
    kind: "cone",
    x: ctx.caster.x,
    y: ctx.caster.y,
    radius: range,
    color: ctx.ability.color,
    arenaId: ctx.caster.arenaId,
  });
  return true;
});
