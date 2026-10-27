import { registerBot, registerMode } from "../../registry.js";
import type { Entity, GameMode, Match, PlayerState } from "../../types.js";
import { addLog, emit, heroEntity, pushBanner } from "../../world.js";
import { emptyMask, generateAbyss, revealDisc, TILE_FLOOR, tileOf, type AbyssMap } from "./generate.js";
import { abyssOf, bindAbyss } from "./state.js";

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
  const heroes = match.entities.filter((entity) => entity.kind === "hero" && entity.alive);
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
      if (fits(map, floor, ax, ay, a.radius)) {
        a.x = ax;
        a.y = ay;
      }
      const bx = b.x + nx * push;
      const by = b.y + ny * push;
      if (fits(map, floor, bx, by, b.radius)) {
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
    const speed = entity.speed * (1 + player.stats.moveSpeedPct);
    const stepX = x * speed * dt;
    const stepY = y * speed * dt;
    if (fits(map, floor, entity.x + stepX, entity.y, entity.radius)) entity.x += stepX;
    if (fits(map, floor, entity.x, entity.y + stepY, entity.radius)) entity.y += stepY;
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
  const spot = landNear(map, best.toFloor, best.toX, best.toY, entity.radius);
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

function finish(match: Match) {
  const state = abyssOf(match);
  if (!state || match.phase === "ended") return;
  match.phase = "ended";
  match.phaseTime = 0;
  match.winnerId = null;
  state.result = "win";
  state.objective = "O coração foi encontrado";
  addLog(match, "O coração foi encontrado");
  emit(match, { type: "win", round: match.round, playerId: null });
  pushBanner(match, { kind: "info", title: "O coração", detail: "A descida termina", life: 5 });
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
      if (fits(map, 0, x, y, entity.radius)) {
        entity.x = x;
        entity.y = y;
      } else {
        entity.x = spot.x;
        entity.y = spot.y;
      }
      revealAt(match, 0, entity.x, entity.y);
    });
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
    separate(match, map);
    if (state.result !== "win") {
      state.objective = deep ? "Encontre o coração" : "Desça até o coração";
    }
  },
  checkEnd(match) {
    if (abyssOf(match)?.result === "win") finish(match);
  },
  onHeroKilled() {},
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

registerMode("abismo", abyssMode);
