import { resolveCombat } from "../../combat.js";
import { dealDamage } from "../../damage.js";
import { loseLife } from "../../elimination.js";
import { getCreepBehavior, registerBot, registerCreepBehavior, registerMode } from "../../registry.js";
import { spawnCreep } from "../../spawn.js";
import { moveScale } from "../../spells/status.js";
import type { Entity, GameMode, Match, PlayerState } from "../../types.js";
import { addLog, emit, heroEntity, pushBanner } from "../../world.js";
import { emptyMask, floodFrom, generateAbyss, revealDisc, TILE_FLOOR, tileOf, type AbyssMap } from "./generate.js";
import { abyssOf, bindAbyss } from "./state.js";

const REPATH = 0.35;
const STEP: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const LAND: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [2, 0], [-2, 0], [0, 2], [0, -2],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

registerBot("abismo", (_match, player) => {
  player.inputX = 0;
  player.inputY = 0;
});

function fits(map: AbyssMap, floor: number, x: number, y: number, radius: number) {
  const grid = map.floors[floor]?.tiles;
  if (!grid) return false;
  const size = map.tileSize;
  const n = map.tiles;
  const minX = Math.floor((x - radius) / size);
  const maxX = Math.floor((x + radius - 1e-4) / size);
  const minY = Math.floor((y - radius) / size);
  const maxY = Math.floor((y + radius - 1e-4) / size);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) return false;
      if (grid[ty * n + tx] === TILE_FLOOR) continue;
      if (circleHits(x, y, radius, tx * size, ty * size, size)) return false;
    }
  }
  return true;
}

function circleHits(cx: number, cy: number, radius: number, x: number, y: number, size: number) {
  const nearestX = Math.max(x, Math.min(cx, x + size));
  const nearestY = Math.max(y, Math.min(cy, y + size));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function reachOf(match: Match, radius: number) {
  return radius + match.data.abyss.bodySkin;
}

function floorIndex(map: AbyssMap, arenaId: string) {
  const index = map.floors.findIndex((floor) => floor.id === arenaId);
  return index >= 0 ? index : 0;
}

function center(map: AbyssMap, tileX: number, tileY: number) {
  return { x: (tileX + 0.5) * map.tileSize, y: (tileY + 0.5) * map.tileSize };
}

function landNear(map: AbyssMap, floor: number, tileX: number, tileY: number, radius: number) {
  for (const [dx, dy] of LAND) {
    const spot = center(map, tileX + dx, tileY + dy);
    if (fits(map, floor, spot.x, spot.y, radius)) return spot;
  }
  return center(map, tileX, tileY);
}

function revealAt(match: Match, floor: number, x: number, y: number) {
  const state = abyssOf(match);
  if (!state) return;
  const mask = state.revealed[floor];
  if (!mask) return;
  revealDisc(mask, state.map.tiles, tileOf(x, state.map.tileSize, state.map.tiles), tileOf(y, state.map.tileSize, state.map.tiles), state.map.vision);
}

function noteFloor(match: Match, floor: number) {
  const state = abyssOf(match);
  if (!state || state.seen[floor]) return;
  state.seen[floor] = true;
  const nome = state.map.floors[floor]?.nome ?? "";
  if (floor === 0) return;
  addLog(match, `A escada desce para ${nome}`);
  pushBanner(match, { kind: "info", title: nome, detail: "Um andar mais fundo", life: 3.5 });
}

function separate(match: Match, map: AbyssMap) {
  const heroes = match.entities.filter((entity) => entity.alive);
  for (let left = 0; left < heroes.length; left += 1) {
    for (let right = left + 1; right < heroes.length; right += 1) {
      const a = heroes[left]!;
      const b = heroes[right]!;
      if (a.arenaId !== b.arenaId) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const gap = Math.hypot(dx, dy);
      const need = a.radius + b.radius;
      if (gap >= need) continue;
      const nx = gap < 1e-4 ? 1 : dx / gap;
      const ny = gap < 1e-4 ? 0 : dy / gap;
      const push = (need - gap) / 2 + 0.01;
      const floor = floorIndex(map, a.arenaId);
      const ax = a.x - nx * push;
      const ay = a.y - ny * push;
      if (fits(map, floor, ax, ay, reachOf(match, a.radius))) {
        a.x = ax;
        a.y = ay;
      }
      const bx = b.x + nx * push;
      const by = b.y + ny * push;
      if (fits(map, floor, bx, by, reachOf(match, b.radius))) {
        b.x = bx;
        b.y = by;
      }
    }
  }
}

function moveHero(match: Match, player: PlayerState, entity: Entity, map: AbyssMap, dt: number) {
  let x = player.inputX;
  let y = player.inputY;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  const floor = floorIndex(map, entity.arenaId);
  if (len > 0.05) {
    const speed = entity.speed * (1 + player.stats.moveSpeedPct) * moveScale(match, entity.id);
    const stepX = x * speed * dt;
    const stepY = y * speed * dt;
    const reach = reachOf(match, entity.radius);
    if (fits(map, floor, entity.x + stepX, entity.y, reach)) entity.x += stepX;
    if (fits(map, floor, entity.x, entity.y + stepY, reach)) entity.y += stepY;
    entity.facing = Math.atan2(y, x);
  }
  return floorIndex(map, entity.arenaId);
}

function takeStair(match: Match, player: PlayerState, entity: Entity, map: AbyssMap) {
  if (player.portalCd > 0) return floorIndex(map, entity.arenaId);
  const floor = floorIndex(map, entity.arenaId);
  const size = map.tileSize;
  let best: (typeof map.stairs)[number] | null = null;
  let bestDist = size * 0.55;
  for (const stair of map.stairs) {
    if (stair.floor !== floor) continue;
    const spot = center(map, stair.x, stair.y);
    const gap = Math.hypot(entity.x - spot.x, entity.y - spot.y);
    if (gap < bestDist) {
      best = stair;
      bestDist = gap;
    }
  }
  if (!best) return floor;
  const spot = landNear(map, best.toFloor, best.toX, best.toY, reachOf(match, entity.radius));
  entity.x = spot.x;
  entity.y = spot.y;
  entity.arenaId = map.floors[best.toFloor]?.id ?? entity.arenaId;
  player.arenaId = entity.arenaId;
  player.portalCd = map.stairCooldown;
  noteFloor(match, best.toFloor);
  return best.toFloor;
}

function reachedHeart(entity: Entity, map: AbyssMap, floor: number) {
  if (floor !== map.heart.floor) return false;
  const spot = center(map, map.heart.x, map.heart.y);
  return Math.hypot(entity.x - spot.x, entity.y - spot.y) < map.tileSize * 0.75;
}

function finish(match: Match, result: "win" | "lose") {
  const state = abyssOf(match);
  if (!state || match.phase === "ended") return;
  match.phase = "ended";
  match.phaseTime = 0;
  match.winnerId = null;
  state.result = result;
  if (result === "lose") {
    state.objective = "O grupo caiu";
    addLog(match, "O grupo caiu");
    pushBanner(match, { kind: "info", title: "Derrota", detail: "A descida acaba", life: 5 });
    return;
  }
  state.objective = "O coração foi encontrado";
  addLog(match, "O coração foi encontrado");
  emit(match, { type: "win", round: match.round, playerId: null });
  pushBanner(match, { kind: "info", title: "O coração", detail: "A descida termina", life: 5 });
}

function clearLine(map: AbyssMap, floor: number, ax: number, ay: number, bx: number, by: number, radius: number) {
  const span = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(span / (map.tileSize * 0.45)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!fits(map, floor, ax + (bx - ax) * t, ay + (by - ay) * t, radius)) return false;
  }
  return true;
}

function nextCell(tiles: Uint8Array, n: number, sx: number, sy: number, gx: number, gy: number) {
  if (sx === gx && sy === gy) return { x: gx, y: gy };
  const prev = new Int32Array(n * n).fill(-1);
  const qx = new Int16Array(n * n);
  const qy = new Int16Array(n * n);
  const start = sy * n + sx;
  prev[start] = start;
  qx[0] = sx;
  qy[0] = sy;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const x = qx[head]!;
    const y = qy[head]!;
    head += 1;
    if (x === gx && y === gy) break;
    for (const [dx, dy] of STEP) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const index = ny * n + nx;
      if (tiles[index] !== TILE_FLOOR || prev[index] !== -1) continue;
      prev[index] = y * n + x;
      qx[tail] = nx;
      qy[tail] = ny;
      tail += 1;
    }
  }
  const goal = gy * n + gx;
  if (prev[goal] === -1) return null;
  let at = goal;
  while (prev[at] !== start) {
    const parent = prev[at]!;
    if (parent < 0) return null;
    at = parent;
  }
  return { x: at % n, y: Math.floor(at / n) };
}

function slide(map: AbyssMap, floor: number, entity: Entity, goal: { x: number; y: number }, radius: number, speed: number) {
  const dx = goal.x - entity.x;
  const dy = goal.y - entity.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.04) return;
  const step = Math.min(speed, len);
  const stepX = (dx / len) * step;
  const stepY = (dy / len) * step;
  if (fits(map, floor, entity.x + stepX, entity.y, radius)) entity.x += stepX;
  if (fits(map, floor, entity.x, entity.y + stepY, radius)) entity.y += stepY;
}

function chase(match: Match, creep: Entity, map: AbyssMap, floor: number, target: Entity, radius: number, scale: number, dt: number) {
  if (clearLine(map, floor, creep.x, creep.y, target.x, target.y, radius)) {
    slide(map, floor, creep, target, radius, creep.speed * scale * dt);
    return;
  }
  const state = abyssOf(match);
  if (!state) return;
  const n = map.tiles;
  const sx = tileOf(creep.x, map.tileSize, n);
  const sy = tileOf(creep.y, map.tileSize, n);
  const gx = tileOf(target.x, map.tileSize, n);
  const gy = tileOf(target.y, map.tileSize, n);
  let cache = state.paths.get(creep.id);
  const spot = cache ? center(map, cache.nx, cache.ny) : null;
  if (spot && Math.hypot(creep.x - spot.x, creep.y - spot.y) < 0.35) cache = undefined;
  if (!cache || match.time >= cache.until || cache.gx !== gx || cache.gy !== gy) {
    const tiles = map.floors[floor]?.tiles;
    const next = tiles ? nextCell(tiles, n, sx, sy, gx, gy) : null;
    cache = {
      gx,
      gy,
      nx: next?.x ?? sx,
      ny: next?.y ?? sy,
      until: match.time + REPATH,
    };
    state.paths.set(creep.id, cache);
  }
  slide(map, floor, creep, center(map, cache.nx, cache.ny), radius, creep.speed * scale * dt);
}

function stepCreep(match: Match, creep: Entity, dt: number) {
  const state = abyssOf(match);
  if (!state) return;
  const map = state.map;
  const floor = floorIndex(map, creep.arenaId);
  let target: Entity | null = null;
  let gap = Infinity;
  for (const hero of match.entities) {
    if (!hero.alive || hero.kind !== "hero" || hero.arenaId !== creep.arenaId) continue;
    const dist = Math.hypot(hero.x - creep.x, hero.y - creep.y);
    if (dist < gap) {
      gap = dist;
      target = hero;
    }
  }
  if (!target) return;
  const scale = moveScale(match, creep.id);
  if (scale <= 0) return;
  creep.facing = Math.atan2(target.y - creep.y, target.x - creep.x);
  const reach = creep.attackRange + target.radius * 0.4;
  if ((creep.winding ?? 0) > 0) {
    creep.winding = Math.max(0, (creep.winding ?? 0) - dt);
    if (creep.winding > 0) return;
    creep.attackTimer = creep.attackCooldown;
    creep.swing = (creep.swing ?? 0) + 1;
    if (gap <= reach) dealDamage(match, { source: creep, target, amount: creep.damage });
    return;
  }
  if (gap > reach) {
    chase(match, creep, map, floor, target, reachOf(match, creep.radius), scale, dt);
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
}

function pickSpots(map: AbyssMap, floorIndex: number, count: number, taken: Set<string>) {
  const floor = map.floors[floorIndex];
  if (!floor) return [];
  const n = map.tiles;
  const dist = floodFrom(floor.tiles, n, floor.entry.x, floor.entry.y);
  const banned = new Set<string>();
  const ban = (x: number, y: number) => banned.add(`${x},${y}`);
  ban(floor.entry.x, floor.entry.y);
  ban(floor.exit.x, floor.exit.y);
  if (map.heart.floor === floorIndex) ban(map.heart.x, map.heart.y);
  for (const stair of map.stairs) {
    if (stair.floor === floorIndex) ban(stair.x, stair.y);
  }
  const cells: { x: number; y: number; d: number }[] = [];
  for (let y = 1; y < n - 1; y += 1) {
    for (let x = 1; x < n - 1; x += 1) {
      const index = y * n + x;
      const far = dist[index] ?? -1;
      if (far < 8 || floor.tiles[index] !== TILE_FLOOR || banned.has(`${x},${y}`)) continue;
      cells.push({ x, y, d: far });
    }
  }
  cells.sort((a, b) => a.d - b.d);
  const chosen: { x: number; y: number }[] = [];
  for (const cell of cells) {
    if (chosen.length >= count) break;
    const key = `${floorIndex}:${cell.x},${cell.y}`;
    if (taken.has(key)) continue;
    const crowded = chosen.some((other) => Math.max(Math.abs(other.x - cell.x), Math.abs(other.y - cell.y)) < 5);
    if (crowded) continue;
    chosen.push(cell);
    taken.add(key);
  }
  return chosen;
}

function plantCreeps(match: Match, map: AbyssMap) {
  const taken = new Set<string>();
  for (const group of match.data.abyss.spawns) {
    const index = map.floors.findIndex((floor) => floor.id === group.floor);
    if (index < 0) continue;
    for (const spot of pickSpots(map, index, group.count, taken)) {
      const at = center(map, spot.x, spot.y);
      const before = match.entities.length;
      spawnCreep(match, group.floor, group.creepId, { x: at.x, y: at.y, scale: { hp: 1, damage: 1 } });
      const creep = match.entities[match.entities.length - 1];
      if (creep && match.entities.length > before) creep.behavior = "abyss";
    }
  }
}

export const abyssMode: GameMode = {
  id: "abismo",
  bot: "abismo",
  setup(match) {
    const map = generateAbyss(match.seed, match.data.abyss);
    const state = {
      map,
      revealed: map.floors.map(() => emptyMask(map.tiles)),
      seen: map.floors.map(() => false),
      result: null,
      objective: "Desça até o coração",
      paths: new Map(),
    };
    bindAbyss(match, state);
    const span = map.tiles * map.tileSize;
    map.floors.forEach((floor, index) => {
      match.arenas.push({
        id: floor.id,
        x: 0,
        y: 0,
        size: span,
        ownerId: null,
        kind: "room",
        label: floor.nome,
        role: index === map.floors.length - 1 ? "boss" : index === 0 ? "entrance" : "fight",
      });
      match.obstacles.set(floor.id, [{
        id: `${floor.id}:grid`,
        arenaId: floor.id,
        shape: "grid",
        tileSize: map.tileSize,
        tiles: floor.tiles,
        n: map.tiles,
        skin: match.data.abyss.bodySkin,
        open: TILE_FLOOR,
      }]);
    });
    const home = map.floors[0]?.id ?? "limiar";
    match.players.forEach((player, index) => {
      const entity = heroEntity(match, player);
      player.arenaId = home;
      player.lives = 1;
      if (!entity) return;
      entity.arenaId = home;
      const ox = (index % 3) - 1;
      const oy = Math.floor(index / 3);
      const spot = center(map, map.start.x, map.start.y);
      const x = spot.x + ox * 0.85;
      const y = spot.y + oy * 0.85;
      if (fits(map, 0, x, y, reachOf(match, entity.radius))) {
        entity.x = x;
        entity.y = y;
      } else {
        entity.x = spot.x;
        entity.y = spot.y;
      }
      revealAt(match, 0, entity.x, entity.y);
    });
    plantCreeps(match, map);
    state.seen[0] = true;
    match.phase = "dungeon";
    match.phaseTime = 0;
    addLog(match, "O abismo abre");
  },
  update(match, dt) {
    const state = abyssOf(match);
    if (!state || match.phase === "ended") return;
    const map = state.map;
    let deep = false;
    for (const player of match.players) {
      if (player.portalCd > 0) player.portalCd = Math.max(0, player.portalCd - dt);
      if (player.eliminated) continue;
      const entity = heroEntity(match, player);
      if (!entity?.alive) continue;
      moveHero(match, player, entity, map, dt);
      const floor = takeStair(match, player, entity, map);
      revealAt(match, floor, entity.x, entity.y);
      if (floor === map.floors.length - 1) deep = true;
      if (reachedHeart(entity, map, floor)) state.result = "win";
    }
    for (const creep of match.entities) {
      if (!creep.alive || creep.kind === "hero" || creep.behavior !== "abyss") continue;
      getCreepBehavior("abyss")?.(match, creep, dt);
    }
    separate(match, map);
    resolveCombat(match, dt);
    if (state.result !== "win" && state.result !== "lose") {
      state.objective = deep ? "Encontre o coração" : "Desça até o coração";
    }
  },
  checkEnd(match) {
    const state = abyssOf(match);
    if (!state || match.phase === "ended") return;
    if (state.result === "win") finish(match, "win");
    else if (match.players.length > 0 && match.players.every((player) => player.eliminated)) finish(match, "lose");
  },
  onHeroKilled(match, player) {
    loseLife(match, player);
  },
  offerOnLevel() {
    return false;
  },
  interest(match, watchId) {
    const ids = new Set<string>();
    const arenaId = match.playersById.get(watchId)?.arenaId;
    if (arenaId) ids.add(arenaId);
    return ids;
  },
};

registerCreepBehavior("abyss", (match, creep, dt) => {
  stepCreep(match, creep, dt);
});

registerMode("abismo", abyssMode);
