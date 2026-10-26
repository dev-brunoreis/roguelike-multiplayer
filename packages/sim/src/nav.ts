import { blocked, insideAny, obstaclesOf } from "./obstacles.js";
import type { Arena, Entity, Match, NavGrid, Obstacle, PathCache, PlayerState } from "./types.js";
import { dist } from "./world.js";

const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function padOf(match: Match) {
  return Math.max(0.35, (match.data.dungeon?.navCell ?? 0.5) * 0.9);
}

function los(list: Obstacle[], a: { x: number; y: number }, b: { x: number; y: number }, pad: number) {
  return !blocked(list, a, b, pad);
}

export function buildNav(arena: Arena, list: Obstacle[], cell: number): NavGrid {
  const cols = Math.max(1, Math.ceil(arena.size / cell));
  const rows = cols;
  const walk = new Uint8Array(cols * rows);
  const inflate = 0.5;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = arena.x + (col + 0.5) * cell;
      const y = arena.y + (row + 0.5) * cell;
      const edge = x < arena.x + inflate || y < arena.y + inflate
        || x > arena.x + arena.size - inflate || y > arena.y + arena.size - inflate;
      walk[row * cols + col] = !edge && !insideAny(list, { x, y }, inflate) ? 1 : 0;
    }
  }
  return {
    arenaId: arena.id,
    originX: arena.x,
    originY: arena.y,
    cell,
    cols,
    rows,
    walk,
  };
}

function cellOf(grid: NavGrid, point: { x: number; y: number }) {
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor((point.x - grid.originX) / grid.cell)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor((point.y - grid.originY) / grid.cell)));
  return { col, row };
}

function worldOf(grid: NavGrid, col: number, row: number) {
  return {
    x: grid.originX + (col + 0.5) * grid.cell,
    y: grid.originY + (row + 0.5) * grid.cell,
  };
}

function nearestWalk(grid: NavGrid, point: { x: number; y: number }) {
  const start = cellOf(grid, point);
  if (grid.walk[start.row * grid.cols + start.col]) return start;
  let best = start;
  let bestScore = Infinity;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (!grid.walk[row * grid.cols + col]) continue;
      const gap = (col - start.col) ** 2 + (row - start.row) ** 2;
      if (gap < bestScore) {
        best = { col, row };
        bestScore = gap;
      }
    }
  }
  return best;
}

function passable(grid: NavGrid, col: number, row: number) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.walk[row * grid.cols + col] === 1;
}

function search(grid: NavGrid, from: { x: number; y: number }, to: { x: number; y: number }) {
  const start = nearestWalk(grid, from);
  const goal = nearestWalk(grid, to);
  const startKey = start.row * grid.cols + start.col;
  const goalKey = goal.row * grid.cols + goal.col;
  if (!grid.walk[startKey] || !grid.walk[goalKey]) return [] as { x: number; y: number }[];
  const came = new Int32Array(grid.walk.length).fill(-1);
  const cost = new Float32Array(grid.walk.length).fill(Infinity);
  const heap: number[] = [startKey];
  cost[startKey] = 0;
  const goalCol = goal.col;
  const goalRow = goal.row;
  while (heap.length > 0) {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < heap.length; i += 1) {
      const key = heap[i]!;
      const col = key % grid.cols;
      const row = (key - col) / grid.cols;
      const hint = Math.max(Math.abs(col - goalCol), Math.abs(row - goalRow));
      const score = cost[key]! + hint;
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    }
    const key = heap.splice(best, 1)[0]!;
    if (key === goalKey) break;
    const col = key % grid.cols;
    const row = (key - col) / grid.cols;
    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      if (!passable(grid, nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!passable(grid, col + dc, row) || !passable(grid, col, row + dr))) continue;
      const next = nr * grid.cols + nc;
      const step = dc !== 0 && dr !== 0 ? 1.414 : 1;
      const nextCost = cost[key]! + step;
      if (nextCost >= cost[next]!) continue;
      cost[next] = nextCost;
      came[next] = key;
      if (!heap.includes(next)) heap.push(next);
    }
  }
  if (came[goalKey] === -1 && startKey !== goalKey) return [];
  const cells: { col: number; row: number }[] = [];
  let at = goalKey;
  cells.push(goal);
  while (at !== startKey) {
    const prev = came[at]!;
    if (prev < 0) break;
    const col = prev % grid.cols;
    const row = (prev - col) / grid.cols;
    cells.push({ col, row });
    at = prev;
  }
  cells.reverse();
  return cells.map((cell) => worldOf(grid, cell.col, cell.row));
}

function pull(list: Obstacle[], points: { x: number; y: number }[], pad: number) {
  if (points.length <= 2) return points;
  const out = [points[0]!];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !los(list, points[i]!, points[j]!, pad)) j -= 1;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

function fresh(match: Match, goal: { x: number; y: number }, cache: PathCache | undefined) {
  if (!cache) return true;
  if (match.time >= cache.until) return true;
  if (Math.hypot(goal.x - cache.goalX, goal.y - cache.goalY) > 1) return true;
  return cache.points.length === 0;
}

export function nextStep(match: Match, entity: Entity, goal: { x: number; y: number }) {
  const list = obstaclesOf(match, entity.arenaId);
  const pad = padOf(match);
  if (list.length === 0 || los(list, entity, goal, pad)) {
    match.paths.delete(entity.id);
    return { x: goal.x, y: goal.y };
  }
  const grid = match.navs.get(entity.arenaId);
  if (!grid) return { x: goal.x, y: goal.y };
  let cache = match.paths.get(entity.id);
  if (fresh(match, goal, cache)) {
    const raw = search(grid, entity, goal);
    const points = pull(list, raw.length > 0 ? [entity, ...raw, goal] : [], pad);
    cache = {
      points,
      cursor: 0,
      goalX: goal.x,
      goalY: goal.y,
      until: match.time + (match.data.dungeon?.repathSeconds ?? 0.25),
    };
    match.paths.set(entity.id, cache);
  }
  if (!cache || cache.points.length === 0) return null;
  while (cache.cursor < cache.points.length - 1 && dist(entity, cache.points[cache.cursor]!) < 0.35) {
    cache.cursor += 1;
  }
  return cache.points[cache.cursor] ?? goal;
}

export function walkTo(match: Match, entity: Entity, goal: { x: number; y: number }, dt: number, speedMul = 1) {
  const gap = dist(entity, goal);
  if (gap <= 0.22) {
    entity.x = goal.x;
    entity.y = goal.y;
    match.paths.delete(entity.id);
    return false;
  }
  const step = nextStep(match, entity, goal);
  if (!step) {
    skillStuck(match, entity, dt);
    return false;
  }
  skillStuck(match, entity, 0);
  const reach = dist(entity, step) || 1;
  const speed = entity.speed * speedMul * dt;
  const move = Math.min(speed, reach);
  entity.facing = Math.atan2(step.y - entity.y, step.x - entity.x);
  entity.x += ((step.x - entity.x) / reach) * move;
  entity.y += ((step.y - entity.y) / reach) * move;
  return true;
}

function skillStuck(match: Match, entity: Entity, dt: number) {
  const skill = match.skillState.get(entity.id);
  if (!skill) return;
  skill.stuck = dt > 0 ? skill.stuck + dt : 0;
}

export function faceWalk(match: Match, player: PlayerState, from: Entity, dest: { x: number; y: number }, stop: number) {
  const gap = dist(from, dest);
  if (gap <= stop) {
    player.inputX = 0;
    player.inputY = 0;
    return;
  }
  const step = nextStep(match, from, dest) ?? dest;
  const dx = step.x - from.x;
  const dy = step.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  player.inputX = dx / len;
  player.inputY = dy / len;
  player.aimX = dest.x;
  player.aimY = dest.y;
}

export function canSee(match: Match, a: { x: number; y: number; arenaId: string }, b: { x: number; y: number }) {
  return los(obstaclesOf(match, a.arenaId), a, b, 0.15);
}

export function navReady(match: Match, arena: Arena, list: Obstacle[]) {
  const cell = match.data.dungeon?.navCell ?? 0.5;
  match.navs.set(arena.id, buildNav(arena, list, cell));
}
