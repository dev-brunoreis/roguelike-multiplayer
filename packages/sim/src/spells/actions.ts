import { dealDamage } from "../damage.js";
import { getAction, getTargeting, registerAction } from "../registry.js";
import { spawnCreep } from "../spawn.js";
import type { CastCtx, Entity, Match, PlayerState, Volley } from "../types.js";
import { creepById, dist, emitFx, floatText, roundScale, skillOf } from "../world.js";
import { launchVolley, pushShot } from "./shots.js";
import { applyStatus } from "./status.js";

function areaOf(player: PlayerState | null) {
  return player ? 1 + player.stats.areaPct : 1;
}

function spellDamage(ctx: CastCtx, base: number) {
  if (!ctx.player) return { amount: base * roundScale(ctx.match).damage, crit: false };
  let amount = base * (1 + ctx.player.stats.damagePct);
  let crit = false;
  if (ctx.player.stats.critChance > 0 && ctx.match.rng.next() < ctx.player.stats.critChance) {
    amount *= ctx.player.stats.critMultiplier;
    crit = true;
  }
  return { amount, crit };
}

function aimedPoint(player: PlayerState | null) {
  if (!player || player.aimX == null || player.aimY == null) return null;
  return { x: player.aimX, y: player.aimY };
}

function clampAim(origin: Entity, aim: { x: number; y: number }, range: number) {
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len <= range || len < 0.0001) return { x: origin.x + dx, y: origin.y + dy };
  const scale = range / len;
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 0.0000001) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function seek(ctx: CastCtx, origin: Entity, range: number, ignore: Set<number>) {
  const fn = getTargeting(ctx.targeting) ?? getTargeting("nearest");
  if (!fn) return null;
  return fn(ctx.match, origin, range, ignore);
}

function enemyOnAim(ctx: CastCtx, origin: Entity, range: number, ignore: Set<number>) {
  const aim = aimedPoint(ctx.player);
  if (!aim || !ctx.player) return null;
  const end = clampAim(origin, aim, range);
  const slack = ctx.match.config.aimSlack;
  let best: Entity | null = null;
  let bestCursor = Infinity;
  for (const entity of ctx.match.entities) {
    if (!entity.alive || ignore.has(entity.id) || entity.arenaId !== origin.arenaId || entity.team === origin.team) continue;
    if (dist(origin, entity) > range + entity.radius) continue;
    if (distToSegment(entity.x, entity.y, origin.x, origin.y, end.x, end.y) > entity.radius + slack) continue;
    const cursor = Math.hypot(entity.x - aim.x, entity.y - aim.y);
    if (cursor < bestCursor) {
      best = entity;
      bestCursor = cursor;
    }
  }
  return best;
}

function markSwing(entity: Entity) {
  entity.swing = (entity.swing ?? 0) + 1;
}

function paintStatus(ctx: CastCtx, target: Entity) {
  const kind = ctx.action.status;
  if (!kind) return;
  applyStatus(ctx.match, target, kind, ctx.numbers.statusTime, ctx.numbers.statusValue, {
    sourceId: ctx.caster.id,
    ownerId: ctx.player?.id ?? "",
    spellId: ctx.spellId,
  });
}

function hurt(ctx: CastCtx, target: Entity, amount: number, crit: boolean) {
  dealDamage(ctx.match, {
    source: ctx.caster,
    sourcePlayer: ctx.player ?? undefined,
    target,
    amount,
    abilityId: ctx.spellId,
    crit,
  });
  paintStatus(ctx, target);
}

registerAction("strike", (ctx) => {
  const reach = ctx.numbers.range * areaOf(ctx.player);
  const target = aimedPoint(ctx.player)
    ? enemyOnAim(ctx, ctx.caster, reach, new Set())
    : seek(ctx, ctx.caster, reach, new Set());
  if (!target) return false;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  hurt(ctx, target, hit.amount, hit.crit);
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "bolt",
    x: ctx.caster.x,
    y: ctx.caster.y,
    x2: target.x,
    y2: target.y,
    radius: 0.22,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.22,
  });
  if (ctx.player) {
    emitFx(ctx.match, {
      kind: "slash",
      x: target.x,
      y: target.y,
      radius: 1.1,
      color: ctx.color,
      arenaId: ctx.caster.arenaId,
    });
  }
  return true;
});

registerAction("chain", (ctx) => {
  const reach = ctx.numbers.range * areaOf(ctx.player);
  const jumps = ctx.numbers.targets;
  const falloff = ctx.numbers.falloff;
  const ignore = new Set<number>();
  let from = ctx.caster;
  let fired = false;
  for (let i = 0; i < jumps; i += 1) {
    const probe = { ...from, team: ctx.caster.team, id: -1 };
    const step = i === 0 ? ctx : { ...ctx, targeting: "nearest" };
    const target = i === 0 && aimedPoint(ctx.player)
      ? enemyOnAim(ctx, probe, reach, ignore)
      : seek(step, probe, reach, ignore);
    if (!target) break;
    ignore.add(target.id);
    const ratio = falloff[Math.min(i, falloff.length - 1)] ?? 1;
    const hit = spellDamage(ctx, ctx.numbers.damage * ratio);
    hurt(ctx, target, hit.amount, hit.crit);
    emitFx(ctx.match, {
      kind: "bolt",
      x: from.x,
      y: from.y,
      x2: target.x,
      y2: target.y,
      radius: 0.28,
      color: ctx.color,
      arenaId: ctx.caster.arenaId,
      life: 0.28,
    });
    emitFx(ctx.match, {
      kind: "flash",
      x: target.x,
      y: target.y,
      radius: 0.85,
      color: ctx.color,
      arenaId: ctx.caster.arenaId,
    });
    from = target;
    fired = true;
  }
  if (fired) markSwing(ctx.caster);
  return fired;
});

function victimsIn(match: Match, caster: Entity, center: { x: number; y: number }, radius: number) {
  return match.entities.filter(
    (entity) => entity.alive && entity.arenaId === caster.arenaId && entity.team !== caster.team && dist(center, entity) <= radius + entity.radius,
  );
}

export function popBurst(match: Match, creep: Entity) {
  const state = skillOf(match, creep.id);
  const radius = state.payloadRadius;
  emitFx(match, {
    kind: "ring",
    x: creep.x,
    y: creep.y,
    radius,
    color: creep.color,
    arenaId: creep.arenaId,
    life: 0.32,
  });
  for (const hero of match.entities) {
    if (!hero.alive || hero.team === creep.team || hero.arenaId !== creep.arenaId) continue;
    if (dist(creep, hero) > radius + hero.radius) continue;
    dealDamage(match, {
      source: creep,
      target: hero,
      amount: state.payload,
      abilityId: creep.defId,
      crit: state.crit,
    });
  }
  creep.swing = (creep.swing ?? 0) + 1;
  state.step = "";
  creep.winding = 0;
}

registerAction("burst", (ctx, force) => {
  const scale = areaOf(ctx.player);
  const reach = ctx.numbers.range * scale;
  const radius = (ctx.numbers.radius || ctx.numbers.range) * scale;
  if (ctx.action.windup && !force) {
    if (!seek(ctx, ctx.caster, reach, new Set())) return false;
    const hit = spellDamage(ctx, ctx.numbers.damage);
    const state = skillOf(ctx.match, ctx.caster.id);
    state.step = "burst";
    state.left = ctx.caster.attackWindup ?? 0;
    state.payload = hit.amount;
    state.crit = hit.crit;
    state.payloadRadius = radius;
    ctx.caster.winding = state.left;
    if (state.left <= 0) popBurst(ctx.match, ctx.caster);
    return true;
  }
  const center = ctx.action.at === "caster"
    ? ctx.caster
    : ctx.aim
      ? clampAim(ctx.caster, ctx.aim, reach)
      : seek(ctx, ctx.caster, reach, new Set());
  if (!center) return false;
  const victims = victimsIn(ctx.match, ctx.caster, center, radius);
  if (victims.length === 0 && !force) return false;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  for (const target of victims) hurt(ctx, target, hit.amount, hit.crit);
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "ring",
    x: center.x,
    y: center.y,
    radius,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.45,
  });
  return true;
});

registerAction("cone", (ctx) => {
  const reach = ctx.numbers.range * areaOf(ctx.player);
  const angle = (ctx.numbers.angle * Math.PI) / 180;
  const facing = ctx.caster.facing;
  const victims = ctx.match.entities.filter((entity) => {
    if (!entity.alive || entity.arenaId !== ctx.caster.arenaId || entity.team === ctx.caster.team) return false;
    const gap = dist(ctx.caster, entity);
    if (gap > reach + entity.radius) return false;
    const aim = Math.atan2(entity.y - ctx.caster.y, entity.x - ctx.caster.x);
    let delta = Math.abs(aim - facing);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    return delta <= angle / 2;
  });
  if (victims.length === 0) return false;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  for (const target of victims) hurt(ctx, target, hit.amount, hit.crit);
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "bolt",
    x: ctx.caster.x,
    y: ctx.caster.y,
    x2: ctx.caster.x + Math.cos(facing) * reach,
    y2: ctx.caster.y + Math.sin(facing) * reach,
    radius: 0.45,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.28,
  });
  emitFx(ctx.match, {
    kind: "cone",
    x: ctx.caster.x,
    y: ctx.caster.y,
    radius: reach,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
  });
  return true;
});

function shotVfx(ctx: CastCtx) {
  return ctx.action.vfx || ctx.vfx || "orb";
}

registerAction("shoot", (ctx) => {
  const reach = ctx.numbers.range * areaOf(ctx.player);
  const target = aimedPoint(ctx.player)
    ? enemyOnAim(ctx, ctx.caster, reach, new Set())
    : seek(ctx, ctx.caster, reach, new Set());
  if (!target) return false;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  const speed = ctx.numbers.speed || 10;
  const dx = target.x - ctx.caster.x;
  const dy = target.y - ctx.caster.y;
  const len = Math.hypot(dx, dy) || 1;
  pushShot(ctx.match, {
    x: ctx.caster.x,
    y: ctx.caster.y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    radius: 0.18,
    damage: hit.amount,
    crit: hit.crit,
    arenaId: ctx.caster.arenaId,
    team: ctx.caster.team,
    ownerId: ctx.player?.id ?? "",
    sourceId: ctx.caster.id,
    abilityId: ctx.spellId,
    color: ctx.color,
    ttl: 2.2,
    vfx: shotVfx(ctx),
    pierce: ctx.action.returns ? Math.max(ctx.numbers.pierce, 1) : ctx.numbers.pierce,
    curve: ctx.numbers.curve,
    returns: ctx.action.returns === true,
    originX: ctx.caster.x,
    originY: ctx.caster.y,
    range: reach,
    status: ctx.action.status ?? "",
    statusTime: ctx.numbers.statusTime,
    statusValue: ctx.numbers.statusValue,
    orbit: false,
    angle: 0,
    orbitRadius: 0,
    spin: 0,
  });
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "flash",
    x: ctx.caster.x,
    y: ctx.caster.y,
    radius: 0.4,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.2,
  });
  return true;
});

registerAction("pattern", (ctx) => {
  const count = Math.max(1, Math.round(ctx.numbers.count));
  const speed = ctx.numbers.speed;
  if (speed <= 0) return false;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  const spin = (ctx.numbers.spin * Math.PI) / 180;
  const bursts = Math.max(1, Math.round(ctx.numbers.bursts));
  const shape = ctx.action.shape || "ring";
  const width = shape === "fan" ? ctx.numbers.angle : ctx.numbers.radius;
  const volley: Volley = {
    id: ctx.match.nextId++,
    casterId: ctx.caster.id,
    left: ctx.numbers.interval,
    interval: ctx.numbers.interval,
    bursts: bursts - 1,
    angle: ctx.caster.facing,
    spin,
    count,
    shape,
    speed,
    damage: hit.amount,
    crit: hit.crit,
    width,
    pierce: ctx.numbers.pierce,
    curve: ctx.numbers.curve,
    returns: ctx.action.returns === true,
    range: ctx.numbers.range * areaOf(ctx.player),
    status: ctx.action.status ?? "",
    statusTime: ctx.numbers.statusTime,
    statusValue: ctx.numbers.statusValue,
    team: ctx.caster.team,
    arenaId: ctx.caster.arenaId,
    ownerId: ctx.player?.id ?? "",
    spellId: ctx.spellId,
    color: ctx.color,
    vfx: shotVfx(ctx),
  };
  launchVolley(ctx.match, volley);
  if (bursts > 1) {
    volley.angle += spin;
    ctx.match.volleys.push(volley);
  }
  markSwing(ctx.caster);
  emitFx(ctx.match, {
    kind: "flash",
    x: ctx.caster.x,
    y: ctx.caster.y,
    radius: 0.45,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.16,
  });
  return true;
});

function zoneCount(match: Match, arenaId: string) {
  let count = 0;
  for (const zone of match.zones) {
    if (zone.arenaId === arenaId) count += 1;
  }
  return count;
}

registerAction("zone", (ctx, force) => {
  const scale = areaOf(ctx.player);
  const reach = (ctx.numbers.range || ctx.numbers.radius) * scale;
  const follow = ctx.action.follow ?? "point";
  if (follow === "point" && !ctx.aim && !force && !seek(ctx, ctx.caster, reach, new Set())) return false;
  const center = follow === "point" && ctx.aim ? clampAim(ctx.caster, ctx.aim, reach) : ctx.caster;
  if (zoneCount(ctx.match, ctx.caster.arenaId) >= 48) return false;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  ctx.match.zones.push({
    id: ctx.match.nextId++,
    x: center.x,
    y: center.y,
    radius: (ctx.numbers.radius || ctx.numbers.range) * scale,
    arenaId: ctx.caster.arenaId,
    team: ctx.caster.team,
    ownerId: ctx.player?.id ?? "",
    sourceId: ctx.caster.id,
    spellId: ctx.spellId,
    color: ctx.color,
    vfx: shotVfx(ctx),
    damage: hit.amount,
    crit: hit.crit,
    every: ctx.numbers.every,
    acc: ctx.numbers.every,
    ttl: ctx.numbers.duration,
    born: ctx.match.time,
    follow,
    drops: ctx.numbers.drops,
    dropRadius: (ctx.numbers.dropRadius || ctx.numbers.radius * 0.35) * scale,
    status: ctx.action.status ?? "",
    statusTime: ctx.numbers.statusTime,
    statusValue: ctx.numbers.statusValue,
    childLife: 1.15,
  });
  emitFx(ctx.match, {
    kind: "ring",
    x: center.x,
    y: center.y,
    radius: (ctx.numbers.radius || 1) * scale,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.28,
  });
  return true;
});

registerAction("dash", (ctx) => {
  const reach = ctx.numbers.range;
  const speed = ctx.numbers.speed;
  const target = seek(ctx, ctx.caster, reach, new Set());
  if (!target || speed <= 0) return false;
  const gap = dist(ctx.caster, target);
  if (gap <= ctx.caster.attackRange) return false;
  const dx = (target.x - ctx.caster.x) / gap;
  const dy = (target.y - ctx.caster.y) / gap;
  const hit = spellDamage(ctx, ctx.numbers.damage);
  const state = skillOf(ctx.match, ctx.caster.id);
  state.vx = dx * speed;
  state.vy = dy * speed;
  state.left = reach / speed;
  state.step = "dash";
  state.hit = false;
  state.payload = hit.amount;
  state.crit = hit.crit;
  ctx.caster.facing = Math.atan2(dy, dx);
  emitFx(ctx.match, {
    kind: "slash",
    x: ctx.caster.x,
    y: ctx.caster.y,
    radius: 1.2,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.24,
  });
  return true;
});

registerAction("summon", (ctx) => {
  const creepId = ctx.action.creepId;
  const cap = Math.round(ctx.numbers.count);
  if (!creepId || !creepById(ctx.match, creepId) || cap <= 0) return false;
  const living = ctx.match.entities.filter((entity) => entity.alive && entity.summonedBy === ctx.caster.id).length;
  if (living >= cap) return false;
  const before = ctx.match.entities.length;
  spawnCreep(ctx.match, ctx.caster.arenaId, creepId);
  const spawned = ctx.match.entities.length > before ? ctx.match.entities[ctx.match.entities.length - 1] : undefined;
  if (!spawned || spawned.defId !== creepId) return false;
  const angle = ctx.caster.facing + Math.PI;
  spawned.x = ctx.caster.x + Math.cos(angle) * (ctx.caster.radius + spawned.radius + 0.35);
  spawned.y = ctx.caster.y + Math.sin(angle) * (ctx.caster.radius + spawned.radius + 0.35);
  spawned.summonedBy = ctx.caster.id;
  const parent = skillOf(ctx.match, ctx.caster.id);
  if (parent.homeX != null && parent.homeY != null) {
    const child = skillOf(ctx.match, spawned.id);
    child.homeX = spawned.x;
    child.homeY = spawned.y;
  }
  emitFx(ctx.match, {
    kind: "flash",
    x: spawned.x,
    y: spawned.y,
    radius: 1.1,
    color: ctx.color,
    arenaId: ctx.caster.arenaId,
    life: 0.3,
  });
  return true;
});

registerAction("heal", (ctx) => {
  const reach = ctx.numbers.range;
  const amount = ctx.player ? ctx.numbers.amount : ctx.numbers.amount * roundScale(ctx.match).hp;
  let wounded: Entity | null = null;
  let lowest = 1;
  for (const ally of ctx.match.entities) {
    if (!ally.alive || ally.id === ctx.caster.id || ally.team !== ctx.caster.team || ally.arenaId !== ctx.caster.arenaId) continue;
    if (ally.hp >= ally.maxHp) continue;
    if (dist(ctx.caster, ally) > reach + ally.radius) continue;
    const ratio = ally.hp / ally.maxHp;
    if (ratio >= lowest) continue;
    wounded = ally;
    lowest = ratio;
  }
  if (!wounded || amount <= 0) return false;
  const healed = Math.min(amount, wounded.maxHp - wounded.hp);
  wounded.hp += healed;
  floatText(ctx.match, wounded, `+${Math.round(healed)}`);
  emitFx(ctx.match, {
    kind: "flash",
    x: wounded.x,
    y: wounded.y,
    radius: 1.15,
    color: "#8fdb67",
    arenaId: wounded.arenaId,
    life: 0.28,
  });
  return true;
});

registerAction("warn", (ctx, force) => {
  const scale = areaOf(ctx.player);
  const reach = (ctx.numbers.range || ctx.numbers.radius) * scale;
  if (!force && reach > 0 && !seek(ctx, ctx.caster, reach, new Set())) return false;
  const shape = ctx.action.shape === "line" || ctx.action.shape === "cone" ? ctx.action.shape : "circle";
  const aim = ctx.aim ?? ctx.caster;
  const dx = aim.x - ctx.caster.x;
  const dy = aim.y - ctx.caster.y;
  const len = Math.hypot(dx, dy) || 1;
  const atAim = ctx.action.at === "aim" && ctx.aim;
  const origin = atAim ? clampAim(ctx.caster, ctx.aim!, reach) : ctx.caster;
  ctx.match.warnings.push({
    id: ctx.match.nextId++,
    x: origin.x,
    y: origin.y,
    x2: origin.x + (dx / len) * reach,
    y2: origin.y + (dy / len) * reach,
    shape,
    radius: shape === "circle" ? (ctx.numbers.radius || reach) : ctx.numbers.radius || 0.7,
    angle: ctx.numbers.angle,
    arenaId: ctx.caster.arenaId,
    color: ctx.color,
    team: ctx.caster.team,
    born: ctx.match.time,
    life: Math.max(0.05, ctx.numbers.time),
  });
  return true;
});

registerAction("orbit", (ctx) => {
  const count = Math.max(1, Math.round(ctx.numbers.count));
  const hit = spellDamage(ctx, ctx.numbers.damage);
  const spin = (ctx.numbers.speed * Math.PI) / 180;
  const orbitRadius = ctx.numbers.radius * areaOf(ctx.player);
  for (let i = 0; i < count; i += 1) {
    pushShot(ctx.match, {
      x: ctx.caster.x,
      y: ctx.caster.y,
      vx: 0,
      vy: 0,
      radius: 0.22,
      damage: hit.amount,
      crit: hit.crit,
      arenaId: ctx.caster.arenaId,
      team: ctx.caster.team,
      ownerId: ctx.player?.id ?? "",
      sourceId: ctx.caster.id,
      abilityId: ctx.spellId,
      color: ctx.color,
      ttl: ctx.numbers.duration,
      vfx: shotVfx(ctx),
      pierce: 99,
      curve: 0,
      returns: false,
      originX: ctx.caster.x,
      originY: ctx.caster.y,
      range: 0,
      status: ctx.action.status ?? "",
      statusTime: ctx.numbers.statusTime,
      statusValue: ctx.numbers.statusValue,
      orbit: true,
      angle: (i * Math.PI * 2) / count,
      orbitRadius,
      spin,
    });
  }
  markSwing(ctx.caster);
  return true;
});

export function runAction(ctx: CastCtx, force: boolean) {
  const fn = getAction(ctx.action.do);
  if (!fn) return false;
  return fn(ctx, force);
}
