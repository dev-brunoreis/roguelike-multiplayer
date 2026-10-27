import { loadGameData } from "@game/game-data";
import { describe, expect, it } from "vitest";
import { buildWire, createMatch, runTicks, setInput, tick } from "../../index.js";
import { heroEntity } from "../../world.js";
import { floodFrom, generateAbyss, maskBit, TILE_FLOOR, TILE_WALL } from "./generate.js";
import { abyssOf } from "./state.js";

const data = loadGameData();

function party(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    isBot: false,
    heroId: data.heroes[index % data.heroes.length]!.id,
  }));
}

function bytes(map: ReturnType<typeof generateAbyss>) {
  return map.floors.map((floor) => Array.from(floor.tiles));
}

describe("gerador do abismo", () => {
  it("repete o mapa na mesma semente e muda com outra", () => {
    const left = generateAbyss(21, data.abyss);
    const right = generateAbyss(21, data.abyss);
    expect(bytes(left)).toEqual(bytes(right));
    expect(bytes(generateAbyss(22, data.abyss))).not.toEqual(bytes(left));
  });

  it("liga a entrada de cada andar à saída", () => {
    const map = generateAbyss(7, data.abyss);
    expect(map.floors).toHaveLength(data.abyss.floors.length);
    for (const floor of map.floors) {
      const dist = floodFrom(floor.tiles, map.tiles, floor.entry.x, floor.entry.y);
      expect(dist[floor.exit.y * map.tiles + floor.exit.x], floor.nome).toBeGreaterThan(8);
      let open = 0;
      for (const tile of floor.tiles) if (tile === TILE_FLOOR) open += 1;
      expect(open, floor.nome).toBeGreaterThan(map.tiles * 4);
      expect(open, floor.nome).toBeLessThan(map.tiles * map.tiles * 0.72);
    }
    expect(map.heart.floor).toBe(map.floors.length - 1);
    expect(map.stairs.filter((stair) => stair.dir === "down")).toHaveLength(map.floors.length - 1);
  });
});

describe("abismo", () => {
  it("segura o herói na parede, desce a escada e revela o raio", () => {
    const match = createMatch({ players: party(1), seed: 4, data, mode: "abismo" });
    const state = abyssOf(match);
    const player = match.players[0]!;
    const entity = heroEntity(match, player)!;
    expect(state).toBeTruthy();
    expect(match.phase).toBe("dungeon");
    expect(entity.arenaId).toBe(state!.map.floors[0]!.id);
    const start = state!.map.floors[0]!.entry;
    const mask = state!.revealed[0]!;
    const n = state!.map.tiles;
    expect(maskBit(mask, start.y * n + start.x)).toBe(true);
    expect(maskBit(mask, (n - 2) * n + (n - 2))).toBe(false);

    const floor = state!.map.floors[0]!;
    let wall: { x: number; y: number } | null = null;
    for (let y = 1; y < n - 2 && !wall; y += 1) {
      for (let x = 1; x < n - 2; x += 1) {
        if (floor.tiles[y * n + x] === TILE_FLOOR && floor.tiles[y * n + x + 1] === TILE_WALL) {
          wall = { x, y };
          break;
        }
      }
    }
    expect(wall).toBeTruthy();
    entity.x = (wall!.x + 0.5) * state!.map.tileSize;
    entity.y = (wall!.y + 0.5) * state!.map.tileSize;
    setInput(match, player.id, 1, 0);
    runTicks(match, 30);
    expect(entity.x + entity.radius).toBeLessThanOrEqual((wall!.x + 1) * state!.map.tileSize + 0.05);

    const stair = state!.map.stairs.find((item) => item.floor === 0 && item.dir === "down");
    expect(stair).toBeTruthy();
    entity.x = (stair!.x + 0.5) * state!.map.tileSize;
    entity.y = (stair!.y + 0.5) * state!.map.tileSize;
    entity.arenaId = state!.map.floors[0]!.id;
    player.arenaId = entity.arenaId;
    player.portalCd = 0;
    setInput(match, player.id, 0, 0);
    tick(match);
    expect(entity.arenaId).toBe(state!.map.floors[1]!.id);
    expect(match.phase).toBe("dungeon");
  });

  it("o coração encerra a descida e o fio só mostra o andar observado", () => {
    const match = createMatch({ players: party(2), seed: 9, data, mode: "abismo" });
    const state = abyssOf(match)!;
    const first = match.players[0]!;
    const second = match.players[1]!;
    const hero = heroEntity(match, first)!;
    const other = heroEntity(match, second)!;
    const below = state.map.floors[1]!.id;
    other.arenaId = below;
    second.arenaId = below;
    const wire = buildWire(match, first.id, first.id);
    expect(wire.entities.some((entity) => entity.id === other.id)).toBe(false);
    expect(wire.abyss?.floor).toBe(0);
    expect(wire.entities.some((entity) => entity.id === hero.id)).toBe(true);

    const heart = state.map.heart;
    hero.arenaId = state.map.floors[heart.floor]!.id;
    first.arenaId = hero.arenaId;
    hero.x = (heart.x + 0.5) * state.map.tileSize;
    hero.y = (heart.y + 0.5) * state.map.tileSize;
    setInput(match, first.id, 0, 0);
    tick(match);
    expect(match.phase).toBe("ended");
    expect(state.result).toBe("win");
    expect(match.log.some((line) => line.includes("coração"))).toBe(true);
  });
});
