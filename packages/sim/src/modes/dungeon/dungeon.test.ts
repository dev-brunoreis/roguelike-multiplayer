import { loadGameData } from "@game/game-data";
import { makeRng } from "@game/shared";
import { describe, expect, it } from "vitest";
import { dealDamage } from "../../damage.js";
import { createMatch, runTicks, tick } from "../../index.js";
import { spawnCreep } from "../../spawn.js";
import type { DungeonPortal } from "../../types.js";
import { arenaCenter, heroEntity } from "../../world.js";
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
