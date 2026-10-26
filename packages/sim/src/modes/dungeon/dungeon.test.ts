import { loadGameData } from "@game/game-data";
import { makeRng } from "@game/shared";
import { describe, expect, it } from "vitest";
import { dealDamage } from "../../damage.js";
import { createMatch, runTicks, setInput, tick } from "../../index.js";
import { buildNav, canSee, navReady } from "../../nav.js";
import { blocked, insideAny, materializeLayout } from "../../obstacles.js";
import { pushShot } from "../../spells/shots.js";
import { spawnCreep } from "../../spawn.js";
import type { Arena, DungeonPortal, Obstacle } from "../../types.js";
import { arenaById, arenaCenter, dist, heroEntity, skillOf } from "../../world.js";
import { generateDungeon } from "./generate.js";

const data = loadGameData();

function party(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    isBot: false,
    heroId: data.heroes[index % data.heroes.length]!.id,
  }));
}

describe("gerador", () => {
  it("repete o mapa na mesma semente e alcança toda sala, com o chefe na mais funda", () => {
    const left = generateDungeon(makeRng(21), data.dungeon);
    const right = generateDungeon(makeRng(21), data.dungeon);
    expect(left).toEqual(right);
    expect(generateDungeon(makeRng(22), data.dungeon).rooms.map((room) => room.id)).not.toEqual(left.rooms.map((room) => room.id));
    const boss = left.rooms.find((room) => room.role === "boss");
    expect(boss).toBeTruthy();
    expect(boss!.depth).toBe(Math.max(...left.rooms.map((room) => room.depth)));
    const next = new Map<string, string[]>();
    for (const link of left.links) {
      next.set(link.a, [...(next.get(link.a) ?? []), link.b]);
      next.set(link.b, [...(next.get(link.b) ?? []), link.a]);
    }
    const start = left.rooms.find((room) => room.role === "entrance")!.id;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const at = queue.shift()!;
      for (const step of next.get(at) ?? []) {
        if (seen.has(step)) continue;
        seen.add(step);
        queue.push(step);
      }
    }
    expect(seen.size).toBe(left.rooms.length);
  });
});

describe("masmorra", () => {
  it("não atravessa o portal de uma sala com bicho", () => {
    const match = createMatch({ players: party(), seed: 9, data, mode: "masmorra" });
    const rooms = new Map(match.dungeon!.rooms.map((room) => [room.id, room]));
    const entrance = match.dungeon!.rooms.find((room) => room.role === "entrance")!;
    const queue = [entrance.id];
    const seen = new Set(queue);
    let door: DungeonPortal | undefined;
    while (queue.length > 0 && !door) {
      const at = queue.shift()!;
      for (const portal of match.dungeon!.portals) {
        if (portal.arenaId !== at) continue;
        const role = rooms.get(portal.toArenaId)?.role;
        if (role === "fight" || role === "elite" || role === "boss") {
          door = portal;
          break;
        }
        if (!seen.has(portal.toArenaId)) {
          seen.add(portal.toArenaId);
          queue.push(portal.toArenaId);
        }
      }
    }
    expect(door).toBeTruthy();
    const player = match.players[0]!;
    const entity = heroEntity(match, player)!;
    entity.arenaId = door!.arenaId;
    entity.x = door!.x;
    entity.y = door!.y;
    player.arenaId = door!.arenaId;
    player.portalCd = 0;
    tick(match);
    expect(entity.arenaId).toBe(door!.toArenaId);
    expect(match.entities.some((item) => item.alive && item.kind !== "hero" && item.arenaId === entity.arenaId)).toBe(true);
    const back = match.dungeon!.portals.find((portal) => portal.arenaId === entity.arenaId && portal.toArenaId === door!.arenaId)!;
    entity.x = back.x;
    entity.y = back.y;
    player.portalCd = 0;
    const stayed = entity.arenaId;
    tick(match);
    expect(entity.arenaId).toBe(stayed);
  });

  it("pousa fora do portal de volta e não fica quicando", () => {
    const match = createMatch({ players: party(), seed: 11, data, mode: "masmorra" });
    const rooms = new Map(match.dungeon!.rooms.map((room) => [room.id, room]));
    const door = match.dungeon!.portals.find((portal) => {
      const from = rooms.get(portal.arenaId)?.role;
      const to = rooms.get(portal.toArenaId)?.role;
      return from === "entrance" && to !== "boss";
    });
    expect(door).toBeTruthy();
    const player = match.players[0]!;
    const entity = heroEntity(match, player)!;
    entity.arenaId = door!.arenaId;
    entity.x = door!.x;
    entity.y = door!.y;
    player.arenaId = door!.arenaId;
    player.portalCd = 0;
    tick(match);
    expect(entity.arenaId).toBe(door!.toArenaId);
    for (const creep of match.entities) {
      if (creep.kind === "hero" || creep.arenaId !== entity.arenaId) continue;
      creep.alive = false;
      creep.hp = 0;
    }
    tick(match);
    const arena = arenaById(match, entity.arenaId)!;
    const back = match.dungeon!.portals.find((portal) => portal.arenaId === entity.arenaId && portal.toArenaId === door!.arenaId)!;
    expect(entity.x).toBeGreaterThan(arena.x + entity.radius);
    expect(entity.x).toBeLessThan(arena.x + arena.size - entity.radius);
    expect(entity.y).toBeGreaterThan(arena.y + entity.radius);
    expect(entity.y).toBeLessThan(arena.y + arena.size - entity.radius);
    expect(dist(entity, back)).toBeGreaterThan(data.dungeon.portalRadius);
    const arrived = entity.arenaId;
    entity.x = back.x;
    entity.y = back.y;
    runTicks(match, Math.ceil(data.dungeon.portalCooldown * data.match.tickRate) + 8);
    expect(entity.arenaId).toBe(arrived);
    const center = arenaCenter(arena);
    const vx = center.x - back.x;
    const vy = center.y - back.y;
    const len = Math.hypot(vx, vy) || 1;
    const clear = data.dungeon.portalRadius + 0.35;
    entity.x = back.x + (vx / len) * clear;
    entity.y = back.y + (vy / len) * clear;
    runTicks(match, Math.ceil(data.dungeon.portalCooldown * data.match.tickRate) + 2);
    entity.x = back.x;
    entity.y = back.y;
    tick(match);
    expect(entity.arenaId).toBe(door!.arenaId);
  });

  it("o bicho larga o herói e volta para casa", () => {
    const match = createMatch({ players: party(), seed: 4, data, mode: "masmorra" });
    const room = match.dungeon!.rooms.find((item) => item.role === "entrance")!;
    const arena = match.arenas.find((item) => item.id === room.id)!;
    arena.size = 40;
    const center = arenaCenter(arena);
    spawnCreep(match, room.id, "slime", { x: center.x, y: center.y, home: true, scale: { hp: 1, damage: 0 } });
    const creep = match.entities.find((entity) => entity.kind === "creep")!;
    creep.x = center.x + 12;
    creep.y = center.y;
    creep.hp = 4;
    for (const player of match.players) {
      player.eliminated = true;
      const hero = heroEntity(match, player);
      if (hero) hero.alive = false;
    }
    runTicks(match, 260);
    expect(Math.hypot(creep.x - center.x, creep.y - center.y)).toBeLessThan(0.05);
    expect(creep.hp).toBe(creep.maxHp);
  });

  it("um aliado perto levanta quem caiu", () => {
    const match = createMatch({ players: party(), seed: 2, data, mode: "masmorra" });
    const fallen = match.players[0]!;
    const ally = match.players[1]!;
    const body = heroEntity(match, fallen)!;
    const help = heroEntity(match, ally)!;
    help.x = body.x + 0.4;
    help.y = body.y;
    dealDamage(match, { target: body, amount: 5000 });
    expect(fallen.downed).toBe(true);
    const ticks = Math.ceil(data.dungeon.reviveSeconds * data.match.tickRate) + 2;
    runTicks(match, ticks);
    expect(fallen.downed).toBe(false);
    expect(body.alive).toBe(true);
    expect(body.hp).toBeGreaterThan(1);
  });

  it("vitória quando o chefe morre e derrota quando todos caem", () => {
    const won = createMatch({ players: party(), seed: 6, data, mode: "masmorra" });
    const bossRoom = won.dungeon!.rooms.find((room) => room.role === "boss")!;
    bossRoom.armed = true;
    const bossDef = data.dungeon.bosses[0]!.creepId;
    spawnCreep(won, bossRoom.id, bossDef, { x: 0, y: 0, home: true, scale: { hp: 1, damage: 1 } });
    const boss = won.entities.find((entity) => entity.kind === "boss")!;
    boss.alive = false;
    boss.hp = 0;
    tick(won);
    expect(won.phase).toBe("ended");
    expect(won.dungeon!.result).toBe("win");

    const lost = createMatch({ players: party(), seed: 6, data, mode: "masmorra" });
    for (const player of lost.players) {
      const entity = heroEntity(lost, player)!;
      dealDamage(lost, { target: entity, amount: 5000 });
    }
    tick(lost);
    expect(lost.phase).toBe("ended");
    expect(lost.dungeon!.result).toBe("lose");
  });
});

function dress(match: ReturnType<typeof createMatch>, arena: Arena, list: Obstacle[]) {
  match.obstacles.set(arena.id, list);
  navReady(match, arena, list);
}

describe("colisão e ia", () => {
  it("herói não entra no pilar", () => {
    const match = createMatch({ players: party(1), seed: 3, data, mode: "masmorra" });
    const arena = match.arenas.find((item) => item.id === match.players[0]!.arenaId)!;
    const center = arenaCenter(arena);
    dress(match, arena, [{ id: "pilar", arenaId: arena.id, shape: "circle", x: center.x, y: center.y, r: 1.2 }]);
    const entity = heroEntity(match, match.players[0]!)!;
    entity.x = center.x - 2.4;
    entity.y = center.y;
    setInput(match, match.players[0]!.id, 1, 0);
    runTicks(match, 24);
    expect(dist(entity, center)).toBeGreaterThanOrEqual(1.2 + entity.radius - 0.08);
  });

  it("tiro some ao bater no muro", () => {
    const match = createMatch({ players: party(1), seed: 5, data, mode: "masmorra" });
    const arena = match.arenas.find((item) => item.id === match.players[0]!.arenaId)!;
    const center = arenaCenter(arena);
    dress(match, arena, [{ id: "muro", arenaId: arena.id, shape: "box", x: center.x, y: center.y, w: 0.8, h: 6 }]);
    pushShot(match, {
      x: center.x - 3,
      y: center.y,
      vx: 12,
      vy: 0,
      radius: 0.16,
      damage: 1,
      crit: false,
      arenaId: arena.id,
      team: "player",
      ownerId: match.players[0]!.id,
      abilityId: "flecha",
      color: "#fff",
      ttl: 2,
      vfx: "orb",
      pierce: 2,
      curve: 0,
      returns: false,
      originX: center.x - 3,
      originY: center.y,
      range: 0,
      status: "",
      statusTime: 0,
      statusValue: 0,
      orbit: false,
      angle: 0,
      orbitRadius: 0,
      spin: 0,
    });
    runTicks(match, 8);
    expect(match.projectiles.some((shot) => shot.abilityId === "flecha")).toBe(false);
  });

  it("bicho contorna o muro em L", () => {
    const match = createMatch({ players: party(1), seed: 8, data, mode: "masmorra" });
    const arena = match.arenas.find((item) => item.id === match.players[0]!.arenaId)!;
    const center = arenaCenter(arena);
    dress(match, arena, [
      { id: "v", arenaId: arena.id, shape: "box", x: center.x + 0.8, y: center.y, w: 0.7, h: 5 },
      { id: "h", arenaId: arena.id, shape: "box", x: center.x - 0.4, y: center.y + 2.2, w: 4.2, h: 0.7 },
    ]);
    const hero = heroEntity(match, match.players[0]!)!;
    hero.x = center.x - 3.2;
    hero.y = center.y - 0.2;
    spawnCreep(match, arena.id, "slime", { x: center.x + 3.2, y: center.y - 0.2, home: true, scale: { hp: 1, damage: 0 } });
    const creep = match.entities.find((entity) => entity.kind === "creep")!;
    const skill = skillOf(match, creep.id);
    skill.mood = "chase";
    skill.focus = hero.id;
    skill.homeX = creep.x;
    skill.homeY = creep.y;
    runTicks(match, 280);
    expect(dist(creep, hero)).toBeLessThan(3.2);
  });

  it("não entra em aggro através da parede e acorda o grupo com linha de visão", () => {
    const match = createMatch({ players: party(1), seed: 7, data, mode: "masmorra" });
    const arena = match.arenas.find((item) => item.id === match.players[0]!.arenaId)!;
    const center = arenaCenter(arena);
    dress(match, arena, [{ id: "muro", arenaId: arena.id, shape: "box", x: center.x, y: center.y, w: 0.8, h: 8 }]);
    const hero = heroEntity(match, match.players[0]!)!;
    hero.x = center.x - 2.2;
    hero.y = center.y;
    spawnCreep(match, arena.id, "slime", { x: center.x + 2.2, y: center.y - 0.4, home: true, scale: { hp: 1, damage: 0 } });
    spawnCreep(match, arena.id, "slime", { x: center.x + 2.2, y: center.y + 0.8, home: true, scale: { hp: 1, damage: 0 } });
    const creeps = match.entities.filter((entity) => entity.kind === "creep");
    tick(match);
    expect(creeps.every((creep) => skillOf(match, creep.id).mood !== "chase")).toBe(true);
    expect(canSee(match, creeps[0]!, hero)).toBe(false);
    hero.x = center.x + 2.2;
    hero.y = center.y + 3.4;
    runTicks(match, 4);
    expect(creeps.some((creep) => skillOf(match, creep.id).mood === "chase")).toBe(true);
    expect(creeps.filter((creep) => skillOf(match, creep.id).mood === "chase").length).toBeGreaterThan(1);
  });

  it("os layouts deixam centro, portal e grade andável", () => {
    for (const layout of data.dungeon.layouts) {
      for (const size of data.dungeon.roomSizes) {
        const arena: Arena = { id: `${layout.id}-${size}`, x: 0, y: 0, size, ownerId: null, kind: "room", role: "fight", label: layout.id };
        const list = materializeLayout(arena, layout);
        const center = arenaCenter(arena);
        expect(insideAny(list, center, 0.7), layout.id).toBe(false);
        const inset = 1.35;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const portal = { x: center.x + dx * (size / 2 - inset), y: center.y + dy * (size / 2 - inset) };
          expect(insideAny(list, portal, 0.45), `${layout.id} portal`).toBe(false);
        }
        const grid = buildNav(arena, list, data.dungeon.navCell);
        const startCol = Math.max(0, Math.min(grid.cols - 1, Math.floor((center.x - grid.originX) / grid.cell)));
        const startRow = Math.max(0, Math.min(grid.rows - 1, Math.floor((center.y - grid.originY) / grid.cell)));
        expect(grid.walk[startRow * grid.cols + startCol], `${layout.id} centro`).toBe(1);
        const seen = new Set<number>();
        const queue = [startRow * grid.cols + startCol];
        seen.add(queue[0]!);
        while (queue.length > 0) {
          const key = queue.shift()!;
          const col = key % grid.cols;
          const row = (key - col) / grid.cols;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = col + dc;
            const nr = row + dr;
            if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
            const next = nr * grid.cols + nc;
            if (!grid.walk[next] || seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
          }
        }
        const walkable = grid.walk.reduce((sum, cell) => sum + cell, 0);
        expect(seen.size, layout.id).toBe(walkable);
        expect(blocked(list, center, { x: center.x, y: arena.y + 1.4 }, 0.2), layout.id).toBe(false);
      }
    }
  });
});
