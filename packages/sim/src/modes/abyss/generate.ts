import { makeRng, type Rng } from "@game/shared";

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_PIT = 2;

export type AbyssKind = "limiar" | "galeria" | "cisterna" | "ossuario" | "coracao";

export interface AbyssFloorDef {
  id: string;
  nome: string;
  kind: AbyssKind;
  palette: string;
}

export interface AbyssDef {
  tiles: number;
  tileSize: number;
  vision: number;
  stairCooldown: number;
  floors: AbyssFloorDef[];
}

export interface AbyssPoint {
  x: number;
  y: number;
}

export interface AbyssStair {
  floor: number;
  x: number;
  y: number;
  dir: "up" | "down";
  toFloor: number;
  toX: number;
  toY: number;
}

export interface AbyssFloor {
  id: string;
  nome: string;
  kind: AbyssKind;
  palette: string;
  tiles: Uint8Array;
  entry: AbyssPoint;
  exit: AbyssPoint;
}

export interface AbyssMap {
  tiles: number;
  tileSize: number;
  vision: number;
  stairCooldown: number;
  floors: AbyssFloor[];
  stairs: AbyssStair[];
  heart: AbyssPoint & { floor: number };
  start: AbyssPoint;
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function generateAbyss(seed: number, def: AbyssDef): AbyssMap {
  const rng = makeRng(seed);
  const n = def.tiles;
  const built = def.floors.map((floor) => {
    const tiles = new Uint8Array(n * n);
    const ends = carveFloor(rng, floor.kind, n, tiles);
    return { floor, tiles, ends };
  });
  const floors: AbyssFloor[] = built.map((item) => ({
    id: item.floor.id,
    nome: item.floor.nome,
    kind: item.floor.kind,
    palette: item.floor.palette,
    tiles: item.tiles,
    entry: item.ends.entry,
    exit: item.ends.exit,
  }));
  const stairs: AbyssStair[] = [];
  for (let index = 0; index < floors.length - 1; index += 1) {
    const from = floors[index]!;
    const to = floors[index + 1]!;
    stairs.push({
      floor: index,
      x: from.exit.x,
      y: from.exit.y,
      dir: "down",
      toFloor: index + 1,
      toX: to.entry.x,
      toY: to.entry.y,
    });
    stairs.push({
      floor: index + 1,
      x: to.entry.x,
      y: to.entry.y,
      dir: "up",
      toFloor: index,
      toX: from.exit.x,
      toY: from.exit.y,
    });
  }
  const last = floors.length - 1;
  const heart = { floor: last, x: floors[last]!.exit.x, y: floors[last]!.exit.y };
  return {
    tiles: n,
    tileSize: def.tileSize,
    vision: def.vision,
    stairCooldown: def.stairCooldown,
    floors,
    stairs,
    heart,
    start: floors[0]?.entry ?? { x: 2, y: 2 },
  };
}

export function floodFrom(tiles: Uint8Array, n: number, sx: number, sy: number): Int16Array {
  const dist = new Int16Array(n * n);
  dist.fill(-1);
  if (!inside(n, sx, sy) || tiles[sy * n + sx] !== TILE_FLOOR) return dist;
  const qx = new Int16Array(n * n);
  const qy = new Int16Array(n * n);
  let head = 0;
  let tail = 0;
  dist[sy * n + sx] = 0;
  qx[tail] = sx;
  qy[tail] = sy;
  tail += 1;
  while (head < tail) {
    const x = qx[head]!;
    const y = qy[head]!;
    const base = dist[y * n + x]!;
    head += 1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(n, nx, ny)) continue;
      const index = ny * n + nx;
      if (tiles[index] !== TILE_FLOOR || dist[index] !== -1) continue;
      dist[index] = base + 1;
      qx[tail] = nx;
      qy[tail] = ny;
      tail += 1;
    }
  }
  return dist;
}

export function emptyMask(tiles: number) {
  return new Uint8Array(Math.ceil((tiles * tiles) / 8));
}

export function revealDisc(mask: Uint8Array, tiles: number, cx: number, cy: number, radius: number) {
  const reach = radius * radius;
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(tiles - 1, cy + radius);
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(tiles - 1, cx + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > reach) continue;
      const index = y * tiles + x;
      mask[index >> 3] |= 1 << (index & 7);
    }
  }
}

export function maskBit(mask: Uint8Array, index: number) {
  return (mask[index >> 3]! & (1 << (index & 7))) !== 0;
}

export function maskToBase64(mask: Uint8Array) {
  let text = "";
  for (let index = 0; index < mask.length; index += 1) text += String.fromCharCode(mask[index]!);
  return btoa(text);
}

export function base64ToMask(text: string) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let index = 0; index < bin.length; index += 1) out[index] = bin.charCodeAt(index);
  return out;
}

export function tileOf(value: number, tileSize: number, tiles: number) {
  return Math.max(0, Math.min(tiles - 1, Math.floor(value / tileSize)));
}

function carveFloor(rng: Rng, kind: AbyssKind, n: number, tiles: Uint8Array) {
  if (kind === "limiar") return genLimiar(rng, n, tiles);
  if (kind === "galeria") return genGaleria(rng, n, tiles);
  if (kind === "cisterna") return genCisterna(rng, n, tiles);
  if (kind === "ossuario") return genOssuario(rng, n, tiles);
  return genCoracao(rng, n, tiles);
}

function genLimiar(rng: Rng, n: number, tiles: Uint8Array) {
  const cx = n >> 1;
  const cy = n >> 1;
  carveDisc(tiles, n, cx, cy, 9, TILE_FLOOR);
  const count = 8 + rng.int(5);
  const rooms: AbyssPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + (rng.next() - 0.5) * 0.4;
    const rad = Math.floor(n * 0.3) + rng.int(8);
    const w = 8 + rng.int(6);
    const h = 8 + rng.int(6);
    const rcx = Math.round(cx + Math.cos(angle) * rad);
    const rcy = Math.round(cy + Math.sin(angle) * rad);
    const x = clamp(rcx - Math.floor(w / 2), 3, n - w - 3);
    const y = clamp(rcy - Math.floor(h / 2), 3, n - h - 3);
    carveRect(tiles, n, x, y, w, h);
    const door = { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) };
    rooms.push(door);
    carveL(tiles, n, door.x, door.y, cx, cy, 3);
  }
  for (let index = 0; index < rooms.length; index += 1) {
    const left = rooms[index]!;
    const right = rooms[(index + 1) % rooms.length]!;
    if (rng.next() < 0.55) carveL(tiles, n, left.x, left.y, right.x, right.y, 3);
  }
  const entry = rooms.reduce((best, room) => (room.x < best.x ? room : best), rooms[0] ?? { x: 4, y: 4 });
  ensurePath(tiles, n, entry.x, entry.y, cx, cy);
  const exit = farthest(floodFrom(tiles, n, entry.x, entry.y), n, entry);
  ensurePath(tiles, n, entry.x, entry.y, exit.x, exit.y);
  paint(tiles, n, entry, TILE_FLOOR);
  paint(tiles, n, exit, TILE_FLOOR);
  return { entry, exit };
}

function genGaleria(rng: Rng, n: number, tiles: Uint8Array) {
  const x0 = 5;
  const x1 = n - 6;
  let y = 6;
  let forward = true;
  let end = { x: x0, y: 6 };
  const rows: number[] = [];
  while (y < n - 8) {
    const from = forward ? x0 : x1;
    const to = forward ? x1 : x0;
    carveSpan(tiles, n, from, y, to, y, 3);
    if (rows.length > 0) carveSpan(tiles, n, end.x, rows[rows.length - 1]!, end.x, y, 3);
    if (rng.next() < 0.8) {
      const along = 8 + rng.int(Math.max(1, x1 - x0 - 16));
      const roomX = clamp((forward ? x0 : x1 - along) + rng.int(Math.max(1, along)), 4, n - 12);
      const roomY = clamp(rng.next() < 0.5 ? y - 8 : y + 5, 3, n - 12);
      carveRect(tiles, n, roomX, roomY, 6, 5);
      carveL(tiles, n, roomX + 2, y, roomX + 2, roomY + 2, 1);
      const nextY = y + 10;
      if (rng.next() < 0.35 && nextY < n - 8) carveSpan(tiles, n, roomX + 2, roomY + 2, roomX + 2, nextY, 1);
    }
    end = { x: to, y };
    rows.push(y);
    forward = !forward;
    y += 10;
  }
  const entry = { x: x0, y: rows[0] ?? 6 };
  ensurePath(tiles, n, entry.x, entry.y, end.x, end.y);
  paint(tiles, n, entry, TILE_FLOOR);
  paint(tiles, n, end, TILE_FLOOR);
  return { entry, exit: end };
}

function genCisterna(rng: Rng, n: number, tiles: Uint8Array) {
  for (let y = 2; y < n - 2; y += 1) {
    for (let x = 2; x < n - 2; x += 1) tiles[y * n + x] = TILE_PIT;
  }
  const islands: { x: number; y: number; r: number }[] = [];
  for (let attempt = 0; attempt < 80 && islands.length < 8; attempt += 1) {
    const radius = 4 + rng.int(3);
    const x = 10 + radius + rng.int(Math.max(1, n - 20 - radius * 2));
    const y = 10 + radius + rng.int(Math.max(1, n - 20 - radius * 2));
    if (islands.some((spot) => Math.hypot(spot.x - x, spot.y - y) < spot.r + radius + 7)) continue;
    islands.push({ x, y, r: radius });
    carveDisc(tiles, n, x, y, radius, TILE_FLOOR);
  }
  if (islands.length < 4) {
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const x = 18 + col * 40;
        const y = 18 + row * 40;
        islands.push({ x, y, r: 5 });
        carveDisc(tiles, n, x, y, 5, TILE_FLOOR);
      }
    }
  }
  const used = [0];
  while (used.length < islands.length) {
    let best = Infinity;
    let from = 0;
    let to = 0;
    for (const index of used) {
      for (let other = 0; other < islands.length; other += 1) {
        if (used.includes(other)) continue;
        const gap = Math.hypot(islands[index]!.x - islands[other]!.x, islands[index]!.y - islands[other]!.y);
        if (gap < best) {
          best = gap;
          from = index;
          to = other;
        }
      }
    }
    used.push(to);
    carveSpan(tiles, n, islands[from]!.x, islands[from]!.y, islands[to]!.x, islands[to]!.y, 2);
  }
  for (let extra = 0; extra < 2; extra += 1) {
    const left = rng.int(islands.length);
    const right = rng.int(islands.length);
    if (left === right) continue;
    carveSpan(tiles, n, islands[left]!.x, islands[left]!.y, islands[right]!.x, islands[right]!.y, 2);
  }
  const entry = { x: islands[0]!.x, y: islands[0]!.y };
  const exit = farthest(floodFrom(tiles, n, entry.x, entry.y), n, entry);
  ensurePath(tiles, n, entry.x, entry.y, exit.x, exit.y);
  paint(tiles, n, entry, TILE_FLOOR);
  paint(tiles, n, exit, TILE_FLOOR);
  return { entry, exit };
}

function genOssuario(rng: Rng, n: number, tiles: Uint8Array) {
  const stride = 4;
  const cells = Math.floor((n - 4) / stride);
  const seen = new Uint8Array(cells * cells);
  const linked = new Uint8Array(cells * cells * 4);
  const stack = [0];
  seen[0] = 1;
  carveRoom(tiles, n, 0, 0, stride, 2);
  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const cx = current % cells;
    const cy = Math.floor(current / cells);
    const options: { nx: number; ny: number; dir: number }[] = [];
    for (let dir = 0; dir < DIRS.length; dir += 1) {
      const [dx, dy] = DIRS[dir]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
      if (seen[ny * cells + nx]) continue;
      options.push({ nx, ny, dir });
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const pick = options[rng.int(options.length)]!;
    openDoor(tiles, n, cx, cy, pick.dir, stride, 1);
    linked[current * 4 + pick.dir] = 1;
    const next = pick.ny * cells + pick.nx;
    const back = pick.dir ^ 1;
    linked[next * 4 + back] = 1;
    seen[next] = 1;
    carveRoom(tiles, n, pick.nx, pick.ny, stride, 2);
    stack.push(next);
  }
  const parent = mazeParents(cells, linked);
  let exitCell = 0;
  let best = -1;
  const queue = [0];
  const dist = new Int16Array(cells * cells);
  dist.fill(-1);
  dist[0] = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (dist[current]! > best) {
      best = dist[current]!;
      exitCell = current;
    }
    for (let dir = 0; dir < 4; dir += 1) {
      if (!linked[current * 4 + dir]) continue;
      const [dx, dy] = DIRS[dir]!;
      const nx = (current % cells) + dx;
      const ny = Math.floor(current / cells) + dy;
      const next = ny * cells + nx;
      if (dist[next] !== -1) continue;
      dist[next] = dist[current]! + 1;
      parent[next] = current;
      queue.push(next);
    }
  }
  let walk = exitCell;
  const guard = cells * cells;
  for (let step = 0; step < guard && walk !== 0; step += 1) {
    const previous = parent[walk]!;
    const cx = previous % cells;
    const cy = Math.floor(previous / cells);
    const nx = walk % cells;
    const ny = Math.floor(walk / cells);
    const dir = nx > cx ? 0 : nx < cx ? 1 : ny > cy ? 2 : 3;
    openDoor(tiles, n, cx, cy, dir, stride, 2);
    walk = previous;
  }
  for (let index = 0; index < cells * cells; index += 1) {
    let doors = 0;
    for (let dir = 0; dir < 4; dir += 1) if (linked[index * 4 + dir]) doors += 1;
    if (doors !== 1) continue;
    carveRoom(tiles, n, index % cells, Math.floor(index / cells), stride, 3);
  }
  const entry = roomCenter(0, 0, stride);
  const exit = roomCenter(exitCell % cells, Math.floor(exitCell / cells), stride);
  ensurePath(tiles, n, entry.x, entry.y, exit.x, exit.y);
  paint(tiles, n, entry, TILE_FLOOR);
  paint(tiles, n, exit, TILE_FLOOR);
  return { entry, exit };
}

const SPIRAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function genCoracao(rng: Rng, n: number, tiles: Uint8Array) {
  const path: AbyssPoint[] = [];
  let x = 6;
  let y = 6;
  let dir = 0;
  let leg = n - 22;
  stamp(tiles, n, x, y, 1);
  path.push({ x, y });
  let turns = 0;
  while (leg > 12 && turns < 24) {
    for (let side = 0; side < 2; side += 1) {
      const [dx, dy] = SPIRAL[dir]!;
      for (let step = 0; step < leg; step += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 5 || ny < 5 || nx > n - 6 || ny > n - 6) break;
        x = nx;
        y = ny;
        stamp(tiles, n, x, y, 1);
        path.push({ x, y });
      }
      dir = (dir + 1) % 4;
    }
    leg -= 6;
    turns += 1;
  }
  const cx = n >> 1;
  const cy = n >> 1;
  carveDisc(tiles, n, cx, cy, 5, TILE_FLOOR);
  const last = path[path.length - 1] ?? { x: 6, y: 6 };
  carveL(tiles, n, last.x, last.y, cx, cy, 3);
  for (let index = 16; index < path.length; index += 22) {
    const at = path[index]!;
    const sign = rng.int(2) === 0 ? 1 : -1;
    const rx = clamp(index % 2 === 0 ? at.x : at.x + sign * 7, 4, n - 8);
    const ry = clamp(index % 2 === 0 ? at.y + sign * 7 : at.y, 4, n - 8);
    carveRect(tiles, n, rx - 2, ry - 2, 5, 5);
    carveL(tiles, n, at.x, at.y, rx, ry, 1);
  }
  const entry = path[0] ?? { x: 6, y: 6 };
  const exit = { x: cx, y: cy };
  ensurePath(tiles, n, entry.x, entry.y, exit.x, exit.y);
  paint(tiles, n, entry, TILE_FLOOR);
  paint(tiles, n, exit, TILE_FLOOR);
  return { entry, exit };
}

function mazeParents(cells: number, linked: Uint8Array) {
  const parent = new Int32Array(cells * cells);
  parent.fill(-1);
  parent[0] = 0;
  const queue = [0];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    for (let dir = 0; dir < 4; dir += 1) {
      if (!linked[current * 4 + dir]) continue;
      const [dx, dy] = DIRS[dir]!;
      const nx = (current % cells) + dx;
      const ny = Math.floor(current / cells) + dy;
      const next = ny * cells + nx;
      if (parent[next] !== -1) continue;
      parent[next] = current;
      queue.push(next);
    }
  }
  return parent;
}

function roomCenter(cx: number, cy: number, stride: number): AbyssPoint {
  return { x: 2 + cx * stride, y: 2 + cy * stride };
}

function carveRoom(tiles: Uint8Array, n: number, cx: number, cy: number, stride: number, size: number) {
  const origin = roomCenter(cx, cy, stride);
  carveRect(tiles, n, origin.x, origin.y, size, size);
}

function openDoor(tiles: Uint8Array, n: number, cx: number, cy: number, dir: number, stride: number, wide: number) {
  const origin = roomCenter(cx, cy, stride);
  const [dx, dy] = DIRS[dir]!;
  if (dx !== 0) {
    const x = dx > 0 ? origin.x + 2 : origin.x - 2;
    carveRect(tiles, n, x, origin.y, 2, wide);
    return;
  }
  const y = dy > 0 ? origin.y + 2 : origin.y - 2;
  carveRect(tiles, n, origin.x, y, wide, 2);
}

function ensurePath(tiles: Uint8Array, n: number, ax: number, ay: number, bx: number, by: number) {
  paint(tiles, n, { x: ax, y: ay }, TILE_FLOOR);
  paint(tiles, n, { x: bx, y: by }, TILE_FLOOR);
  const dist = floodFrom(tiles, n, ax, ay);
  if (dist[by * n + bx]! >= 0) return;
  carveL(tiles, n, ax, ay, bx, by, 3);
}

function farthest(dist: Int16Array, n: number, fallback: AbyssPoint) {
  let best = -1;
  let point = fallback;
  for (let index = 0; index < dist.length; index += 1) {
    const value = dist[index]!;
    if (value > best) {
      best = value;
      point = { x: index % n, y: Math.floor(index / n) };
    }
  }
  return point;
}

function carveL(tiles: Uint8Array, n: number, x0: number, y0: number, x1: number, y1: number, span: 1 | 2 | 3) {
  carveSpan(tiles, n, x0, y0, x1, y0, span);
  carveSpan(tiles, n, x1, y0, x1, y1, span);
}

function carveSpan(tiles: Uint8Array, n: number, x0: number, y0: number, x1: number, y1: number, span: 1 | 2 | 3) {
  if (span === 3) {
    carveLine(tiles, n, x0, y0, x1, y1, 1);
    return;
  }
  carveLine(tiles, n, x0, y0, x1, y1, 0);
  if (span === 1) return;
  const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  if (horizontal) carveLine(tiles, n, x0, y0 + 1, x1, y1 + 1, 0);
  else carveLine(tiles, n, x0 + 1, y0, x1 + 1, y1, 0);
}

function carveLine(tiles: Uint8Array, n: number, x0: number, y0: number, x1: number, y1: number, radius: number) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < n * 4; guard += 1) {
    stamp(tiles, n, x, y, radius);
    if (x === x1 && y === y1) break;
    const doubled = err * 2;
    if (doubled > -dy) {
      err -= dy;
      x += sx;
    }
    if (doubled < dx) {
      err += dx;
      y += sy;
    }
  }
}

function carveDisc(tiles: Uint8Array, n: number, cx: number, cy: number, radius: number, kind: number) {
  const reach = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > reach) continue;
      setTile(tiles, n, x, y, kind);
    }
  }
}

function carveRect(tiles: Uint8Array, n: number, x: number, y: number, w: number, h: number) {
  for (let iy = y; iy < y + h; iy += 1) {
    for (let ix = x; ix < x + w; ix += 1) setTile(tiles, n, ix, iy, TILE_FLOOR);
  }
}

function stamp(tiles: Uint8Array, n: number, x: number, y: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      setTile(tiles, n, x + dx, y + dy, TILE_FLOOR);
    }
  }
}

function paint(tiles: Uint8Array, n: number, point: AbyssPoint, kind: number) {
  setTile(tiles, n, point.x, point.y, kind);
}

function setTile(tiles: Uint8Array, n: number, x: number, y: number, kind: number) {
  if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) return;
  tiles[y * n + x] = kind;
}

function inside(n: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < n && y < n;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
