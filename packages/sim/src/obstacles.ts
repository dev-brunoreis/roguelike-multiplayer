import type { Arena, Match, Obstacle } from "./types.js";

export interface Body {
  x: number;
  y: number;
  radius: number;
}

export function obstaclesOf(match: Match, arenaId: string) {
  return match.obstacles.get(arenaId) ?? [];
}

function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const gap = Math.hypot(ax - bx, ay - by);
  return gap < ar + br;
}

function boxHit(px: number, py: number, pr: number, box: { x: number; y: number; w: number; h: number }) {
  const hx = box.w / 2;
  const hy = box.h / 2;
  const cx = Math.max(box.x - hx, Math.min(px, box.x + hx));
  const cy = Math.max(box.y - hy, Math.min(py, box.y + hy));
  return Math.hypot(px - cx, py - cy) < pr;
}

export function insideAny(list: Obstacle[], point: { x: number; y: number }, pad: number) {
  for (const item of list) {
    if (item.shape === "circle" && circleHit(point.x, point.y, pad, item.x, item.y, item.r)) return true;
    if (item.shape === "box" && boxHit(point.x, point.y, pad, item)) return true;
  }
  return false;
}

function pushCircle(body: Body, ox: number, oy: number, radius: number) {
  const dx = body.x - ox;
  const dy = body.y - oy;
  const gap = Math.hypot(dx, dy);
  const min = body.radius + radius;
  if (gap >= min) return;
  if (gap < 0.0001) {
    body.x += min;
    return;
  }
  const scale = min / gap;
  body.x = ox + dx * scale;
  body.y = oy + dy * scale;
}

function pushBox(body: Body, box: { x: number; y: number; w: number; h: number }) {
  const hx = box.w / 2;
  const hy = box.h / 2;
  const left = box.x - hx - body.radius;
  const right = box.x + hx + body.radius;
  const top = box.y - hy - body.radius;
  const bottom = box.y + hy + body.radius;
  if (body.x <= left || body.x >= right || body.y <= top || body.y >= bottom) return;
  const east = right - body.x;
  const west = body.x - left;
  const north = body.y - top;
  const south = bottom - body.y;
  const least = Math.min(east, west, north, south);
  if (least === east) body.x = right;
  else if (least === west) body.x = left;
  else if (least === north) body.y = top;
  else body.y = bottom;
}

export function pushOut(body: Body, list: Obstacle[]) {
  for (const item of list) {
    if (item.shape === "circle") pushCircle(body, item.x, item.y, item.r);
    else pushBox(body, item);
  }
}

function segHitsCircle(ax: number, ay: number, bx: number, by: number, ox: number, oy: number, radius: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 0.0000001) return Math.hypot(ax - ox, ay - oy) < radius;
  const t = Math.max(0, Math.min(1, ((ox - ax) * abx + (oy - ay) * aby) / len2));
  return Math.hypot(ax + abx * t - ox, ay + aby * t - oy) < radius;
}

function segHitsBox(ax: number, ay: number, bx: number, by: number, box: { x: number; y: number; w: number; h: number }, pad: number) {
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (boxHit(ax + (bx - ax) * t, ay + (by - ay) * t, pad, box)) return true;
  }
  return false;
}

export function blocked(list: Obstacle[], a: { x: number; y: number }, b: { x: number; y: number }, pad: number) {
  for (const item of list) {
    if (item.shape === "circle" && segHitsCircle(a.x, a.y, b.x, b.y, item.x, item.y, item.r + pad)) return true;
    if (item.shape === "box" && segHitsBox(a.x, a.y, b.x, b.y, item, pad)) return true;
  }
  return false;
}

export function resolveObstacles(match: Match) {
  if (match.obstacles.size === 0) return;
  for (const entity of match.entities) {
    if (!entity.alive) continue;
    const list = obstaclesOf(match, entity.arenaId);
    if (list.length === 0) continue;
    pushOut(entity, list);
  }
}

export function materializeLayout(arena: Arena, layout: { id: string; obstacles: { shape: "circle" | "box"; x: number; y: number; r?: number; w?: number; h?: number }[] }) {
  const cx = arena.x + arena.size / 2;
  const cy = arena.y + arena.size / 2;
  const list: Obstacle[] = [];
  layout.obstacles.forEach((item, index) => {
    const id = `${arena.id}:${layout.id}:${index}`;
    if (item.shape === "circle" && item.r) {
      list.push({
        id,
        arenaId: arena.id,
        shape: "circle",
        x: cx + item.x * arena.size,
        y: cy + item.y * arena.size,
        r: item.r * arena.size,
      });
      return;
    }
    if (item.shape === "box" && item.w && item.h) {
      list.push({
        id,
        arenaId: arena.id,
        shape: "box",
        x: cx + item.x * arena.size,
        y: cy + item.y * arena.size,
        w: item.w * arena.size,
        h: item.h * arena.size,
      });
    }
  });
  return list;
}

export function openPoint(list: Obstacle[], arena: Arena, point: { x: number; y: number }, pad: number) {
  const probe: Body = { x: point.x, y: point.y, radius: pad };
  for (let i = 0; i < 12; i += 1) {
    pushOut(probe, list);
    if (!insideAny(list, probe, pad)) {
      return { x: probe.x, y: probe.y };
    }
  }
  const center = { x: arena.x + arena.size / 2, y: arena.y + arena.size / 2 };
  if (!insideAny(list, center, pad)) return center;
  return { x: point.x, y: point.y };
}
