import { describe, expect, it } from "vitest";
import { buildGameData, type GameData } from "./build.js";
import { loadGameData, readGameFiles } from "./load.js";

function plain(data: GameData) {
  return {
    ...data,
    byId: {
      heroes: [...data.byId.heroes.entries()],
      abilities: [...data.byId.abilities.entries()],
      cards: [...data.byId.cards.entries()],
      creeps: [...data.byId.creeps.entries()],
    },
  };
}

describe("buildGameData", () => {
  it("bate com loadGameData", () => {
    expect(plain(buildGameData(readGameFiles()))).toEqual(plain(loadGameData()));
  });

  it("recusa herói com habilidade inexistente", () => {
    const raw = readGameFiles();
    const heroes = raw.heroes as { startingAbility: string }[];
    heroes[0]!.startingAbility = "nao_existe";
    expect(() => buildGameData(raw)).toThrow(/habilidade inexistente/);
  });
});
