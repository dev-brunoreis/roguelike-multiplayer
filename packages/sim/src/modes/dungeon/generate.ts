import type { DungeonDef, Rng } from "@game/shared";

export interface GeneratedRoom {
  id: string;
  col: number;
  row: number;
  size: number;
  depth: number;
  role: "entrance" | "fight" | "rest" | "elite" | "boss";
}

export interface GeneratedLink {
  a: string;
  b: string;
}

interface Cell {
  col: number;
  row: number;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function keyOf(cell: Cell) {
  return `${cell.col},${cell.row}`;
}

function roomId(cell: Cell) {
  return `room_${cell.col}_${cell.row}`;
}

function shuffle<T>(rng: Rng, items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const swap = items[i]!;
    items[i] = items[j]!;
    items[j] = swap;
  }
  return items;
}

export function generateDungeon(rng: Rng, def: DungeonDef): { rooms: GeneratedRoom[]; links: GeneratedLink[] } {
  const span = Math.max(0, def.roomsMax - def.roomsMin);
  const count = def.roomsMin + (span > 0 ? rng.int(span + 1) : 0);
  const cells: Cell[] = [{ col: 0, row: 0 }];
  const seen = new Set(["0,0"]);
  let guard = 0;
  while (cells.length < count && guard < 800) {
    guard += 1;
    const from = cells[rng.int(cells.length)]!;
    const dir = DIRS[rng.int(DIRS.length)]!;
    const next = { col: from.col + dir[0], row: from.row + dir[1] };
    const key = keyOf(next);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(next);
  }

  const edges: [number, number][] = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const a = cells[i]!;
      const b = cells[j]!;
      if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1) edges.push([i, j]);
    }
  }
  shuffle(rng, edges);
  const parent = cells.map((_, index) => index);
  const find = (index: number): number => {
    const at = parent[index]!;
    if (at === index) return index;
    const root = find(at);
    parent[index] = root;
    return root;
  };
  const tree: [number, number][] = [];
  const spare: [number, number][] = [];
  for (const edge of edges) {
    const left = find(edge[0]);
    const right = find(edge[1]);
    if (left === right) {
      spare.push(edge);
      continue;
    }
    parent[left] = right;
    tree.push(edge);
  }
  const chosen = [...tree];
  for (let i = 0; i < def.extraLinks && i < spare.length; i += 1) chosen.push(spare[i]!);

  const next = cells.map(() => [] as number[]);
  for (const [a, b] of chosen) {
    next[a]!.push(b);
    next[b]!.push(a);
  }
  const depth = cells.map(() => -1);
  depth[0] = 0;
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const at = queue[cursor]!;
    for (const neighbor of next[at]!) {
      if (depth[neighbor] !== -1) continue;
      depth[neighbor] = depth[at]! + 1;
      queue.push(neighbor);
    }
  }
  let deepest = 0;
  for (let i = 1; i < cells.length; i += 1) {
    if ((depth[i] ?? 0) > (depth[deepest] ?? 0)) deepest = i;
  }
  const ties = cells.map((_, index) => index).filter((index) => depth[index] === depth[deepest] && index !== 0);
  const boss = ties.length > 0 ? ties[rng.int(ties.length)]! : deepest;
  const middle = shuffle(rng, cells.map((_, index) => index).filter((index) => index !== 0 && index !== boss));
  const rest = new Set(middle.slice(0, Math.min(def.restRooms, middle.length)));
  const elite = new Set(middle.slice(rest.size, rest.size + Math.min(def.eliteRooms, Math.max(0, middle.length - rest.size))));

  const rooms: GeneratedRoom[] = cells.map((cell, index) => {
    let role: GeneratedRoom["role"] = "fight";
    if (index === 0) role = "entrance";
    else if (index === boss) role = "boss";
    else if (rest.has(index)) role = "rest";
    else if (elite.has(index)) role = "elite";
    return {
      id: roomId(cell),
      col: cell.col,
      row: cell.row,
      size: def.roomSizes[rng.int(def.roomSizes.length)]!,
      depth: Math.max(0, depth[index] ?? 0),
      role,
    };
  });
  const links = chosen.map(([a, b]) => ({ a: rooms[a]!.id, b: rooms[b]!.id }));
  return { rooms, links };
}
