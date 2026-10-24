import { loadGameData } from "@game/game-data";
import { describe, expect, it } from "vitest";
import { setBotsGodmode, jumpWave } from "./debug.js";
import { present } from "./present.js";
import { buildSnapshot, buildWire, createMatch, interestArenaIds, runTicks, setInput, tick } from "./index.js";

const data = loadGameData();

function players(count: number, human = 0) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    isBot: index >= human,
    heroId: data.heroes[index % data.heroes.length]!.id,
  }));
}

describe("present", () => {
  it("golpe vira float e fx, e evento de persistência não vira visual", () => {
    const match = createMatch({ players: players(2, 2), seed: 1, data });
    const before = match.floats.length + match.fx.length;
    present(match, {
      type: "float",
      x: 1,
      y: 2,
      text: "12",
      crit: false,
      arenaId: match.arenas[0]!.id,
    });
    present(match, {
      type: "fx",
      kind: "flash",
      x: 1,
      y: 2,
      radius: 1,
      color: "#fff",
      arenaId: match.arenas[0]!.id,
    });
    expect(match.floats.at(-1)?.text).toBe("12");
    expect(match.fx.at(-1)?.kind).toBe("flash");
    expect(match.floats.length + match.fx.length).toBe(before + 2);
    present(match, { type: "level", round: 1, playerId: "p0", level: 2 });
    expect(match.floats.length + match.fx.length).toBe(before + 2);
  });
});

describe("interesse", () => {
  it("manda a arena de quem é observado, o salão e o duelo, e deixa as outras ondas de fora", () => {
    const roster = players(8, 0);
    const match = createMatch({ players: roster, seed: 4, data });
    setBotsGodmode(match, true);
    jumpWave(match, 9);
    const watch = roster[0]!.id;
    const ids = interestArenaIds(match, watch);
    const mine = match.players.find((player) => player.id === watch)!.arenaId;
    const other = match.players.find((player) => player.id !== watch)!.arenaId;
    expect(ids.has(mine)).toBe(true);
    expect(ids.has(other)).toBe(false);
    expect(match.arenas.some((arena) => arena.kind === "hub" && ids.has(arena.id))).toBe(true);
    const wire = buildWire(match, watch);
    const rich = buildSnapshot(match, watch);
    expect(wire.entities.length).toBeLessThan(rich.entities.length);
    expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(rich).length * 0.7);
  });
});

describe("determinismo", () => {
  it("mesma semente e os mesmos inputs geram o mesmo snapshot", () => {
    const hash = (seed: number) => {
      const roster = players(4, 1);
      const match = createMatch({ players: roster, seed, data });
      for (let i = 0; i < 30; i += 1) {
        setInput(match, roster[0]!.id, i % 2 === 0 ? 1 : -1, 0, 3, 1);
        tick(match);
      }
      runTicks(match, 10);
      return JSON.stringify(buildSnapshot(match, roster[0]!.id));
    };
    expect(hash(11)).toBe(hash(11));
    expect(hash(11)).not.toBe(hash(12));
  });
});
