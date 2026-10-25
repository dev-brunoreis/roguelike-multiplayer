export { buildGameData } from "./build.js";
export type { GameData, RawGameFiles } from "./build.js";

export function loadGameData(): never {
  throw new Error("loadGameData lê o disco. No navegador use buildGameData.");
}

export function getGameData(): never {
  throw new Error("getGameData lê o disco. No navegador passe data para createMatch.");
}
