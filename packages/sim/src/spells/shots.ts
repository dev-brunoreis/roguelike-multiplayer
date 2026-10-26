import { dealDamage } from "../damage.js";
import { blocked, insideAny, obstaclesOf } from "../obstacles.js";
import type { Match, Projectile, Volley } from "../types.js";
import { dist, entityById, playerById } from "../world.js";
import { applyStatus } from "./status.js";

export function pushShot(match: Match, shot: Omit<Projectile, "id" | "hit" | "travel" | "returning">): boolean {
  const cap = match.config.maxShotsPerArena;
  let count = 0;
  for (const item of match.projectiles) {
    if (item.arenaId !== shot.arenaId) continue;
    count += 1;
    if (count >= cap) return false;
  }
  match.projectiles.push({
    ...shot,
    id: match.nextId++,
    hit: [],
    travel: 0,
    returning: false,
  });
  return true;
}

export function patternPoints(
  shape: string,
  x: number,
  y: number,
  facing: number,
  count: number,
  angleDeg: number,
  width: number,
) {
  const points: { x: number; y: number; vx: number; vy: number }[] = [];
  if (shape === "fan") {
    const span = (angleDeg * Math.PI) / 180;
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = facing - span / 2 + span * t;
      points.push({ x, y, vx: Math.cos(angle), vy: Math.sin(angle) });
    }
    return points;
  }
  if (shape === "wave") {
    const span = width > 0 ? width : 2.4;
    const nx = -Math.sin(facing);
    const ny = Math.cos(facing);
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * span;
      points.push({
        x: x + nx * t,
        y: y + ny * t,
        vx: Math.cos(facing),
        vy: Math.sin(facing),
      });
    }
    return points;
  }
  for (let i = 0; i < count; i += 1) {
    const angle = facing + (i * Math.PI * 2) / count;
    points.push({ x, y, vx: Math.cos(angle), vy: Math.sin(angle) });
  }
  return points;
}

export function launchVolley(match: Match, volley: Volley) {
  const caster = entityById(match, volley.casterId);
  if (!caster?.alive) return;
  const points = patternPoints(volley.shape, caster.x, caster.y, volley.angle, volley.count, volley.width, volley.width);
  for (const point of points) {
    pushShot(match, {
      x: point.x,
      y: point.y,
      vx: point.vx * volley.speed,
      vy: point.vy * volley.speed,
      radius: 0.16,
      damage: volley.damage,
      crit: volley.crit,
      arenaId: volley.arenaId,
      team: volley.team,
      ownerId: volley.ownerId,
      sourceId: volley.casterId,
      abilityId: volley.spellId,
      color: volley.color,
      ttl: 2.6,
      vfx: volley.vfx,
      pierce: volley.pierce,
      curve: volley.curve,
      returns: volley.returns,
      originX: point.x,
      originY: point.y,
      range: volley.range,
      status: volley.status,
      statusTime: volley.statusTime,
      statusValue: volley.statusValue,
      orbit: false,
      angle: 0,
      orbitRadius: 0,
      spin: 0,
    });
  }
}

function strikeShot(match: Match, shot: Projectile) {
  const owner = playerById(match, shot.ownerId);
  const source = owner || shot.sourceId == null ? undefined : entityById(match, shot.sourceId);
  const hero = owner ? entityById(match, owner.entityId) : undefined;
  for (const entity of match.entities) {
    if (!entity.alive || entity.arenaId !== shot.arenaId || entity.team === shot.team) continue;
    if (shot.hit.includes(entity.id)) continue;
    if (dist(entity, shot) > entity.radius + shot.radius) continue;
    dealDamage(match, {
      source: hero ?? source ?? undefined,
      sourcePlayer: owner,
      target: entity,
      amount: shot.damage,
      abilityId: shot.abilityId,
      crit: shot.crit,
    });
    if (shot.status) {
      applyStatus(match, entity, shot.status, shot.statusTime, shot.statusValue, {
        sourceId: shot.sourceId ?? hero?.id ?? 0,
        ownerId: shot.ownerId,
        spellId: shot.abilityId,
      });
    }
    shot.hit.push(entity.id);
    if (!shot.orbit && shot.hit.length > shot.pierce) shot.ttl = 0;
    if (shot.ttl <= 0) return;
  }
  if (!shot.orbit) return;
  shot.hit = shot.hit.filter((id) => {
    const entity = entityById(match, id);
    return !!entity?.alive && dist(entity, shot) <= entity.radius + shot.radius;
  });
}

export function tickShots(match: Match, dt: number) {
  for (const shot of match.projectiles) {
    shot.ttl -= dt;
    if (shot.orbit) {
      const caster = shot.sourceId == null ? undefined : entityById(match, shot.sourceId);
      if (!caster?.alive) {
        shot.ttl = 0;
        continue;
      }
      shot.angle += shot.spin * dt;
      shot.x = caster.x + Math.cos(shot.angle) * shot.orbitRadius;
      shot.y = caster.y + Math.sin(shot.angle) * shot.orbitRadius;
      strikeShot(match, shot);
      continue;
    }
    if (shot.curve !== 0) {
      const speed = Math.hypot(shot.vx, shot.vy) || 0;
      const angle = Math.atan2(shot.vy, shot.vx) + (shot.curve * Math.PI) / 180 * dt;
      shot.vx = Math.cos(angle) * speed;
      shot.vy = Math.sin(angle) * speed;
    }
    const walls = obstaclesOf(match, shot.arenaId);
    const prev = { x: shot.x, y: shot.y };
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (walls.length > 0 && (blocked(walls, prev, shot, shot.radius) || insideAny(walls, shot, shot.radius))) {
      shot.ttl = 0;
      continue;
    }
    shot.travel += Math.hypot(shot.vx, shot.vy) * dt;
    if (shot.returns && !shot.returning && shot.range > 0 && shot.travel >= shot.range) {
      shot.vx *= -1;
      shot.vy *= -1;
      shot.returning = true;
      shot.hit = [];
    }
    if (shot.returning && dist(shot, { x: shot.originX, y: shot.originY }) < 0.35) shot.ttl = 0;
    if (shot.ttl > 0) strikeShot(match, shot);
  }
  match.projectiles = match.projectiles.filter((shot) => shot.ttl > 0);
}
