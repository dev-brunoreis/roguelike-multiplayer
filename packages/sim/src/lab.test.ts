import { loadGameData } from "@game/game-data";
import { createMatch, runTicks } from "@game/sim";
import { labCast, labClear, labForcePhase, labSetLevel, labSpawn } from "@game/sim/lab";
import { describe, expect, it } from "vitest";

describe("modo lab", () => {
  it("lança cada habilidade e cada skill de creep sem erro", () => {
    const data = loadGameData();
    const match = createMatch({
      players: [{ id: "p", name: "Lab", isBot: false, heroId: "guerreiro" }],
      data,
      seed: 3,
      mode: "lab",
    });
    const hero = match.entities.find((entity) => entity.kind === "hero");
    expect(hero).toBeTruthy();
    const dummy = labSpawn(match, "slime", { x: 3, y: 0 }, { dummy: true });
    expect(dummy).not.toBeNull();
    for (const ability of data.abilities) {
      labSetLevel(match, "p", ability.id, ability.levels.length);
      expect(() => labCast(match, hero!.id, ability.id, { level: ability.levels.length, aim: { x: 3, y: 0 } })).not.toThrow();
      runTicks(match, 2);
    }
    labClear(match);
    expect(match.entities.every((entity) => entity.kind === "hero")).toBe(true);
    for (const creep of data.creeps) {
      const spells = [...(creep.skills ?? []), ...(creep.skill ? [creep.skill] : [])];
      if (spells.length === 0) continue;
      const id = labSpawn(match, creep.id, { x: 2, y: 0.4 });
      expect(id).not.toBeNull();
      if (creep.phases?.length) labForcePhase(match, id!, creep.phases.length - 1);
      spells.forEach((spell, index) => {
        expect(() => labCast(match, id!, spell.id ?? creep.id, { skillIndex: index, aim: { x: 0, y: 0 } })).not.toThrow();
        runTicks(match, 2);
      });
      labClear(match);
    }
  });
});
