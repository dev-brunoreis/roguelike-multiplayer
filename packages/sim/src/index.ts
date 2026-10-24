import "./content.js";

export { pickCard, placeBet, setBotsGodmode, setGodmode, setInput, setPauseWant, shopAct, surrender } from "./actions.js";
export { runBots } from "./bots.js";
export { dealDamage } from "./damage.js";
export { createMatch, grantXp, quietMatch, runTicks, tick } from "./match.js";
export type { CreatePlayer } from "./match.js";
export {
  registerAbilityBehavior,
  registerBeforeDamage,
  registerBot,
  registerCreepBehavior,
  registerCreepSkill,
  registerEffect,
  registerOnKill,
  registerTargeting,
} from "./registry.js";
export { jumpWave, revivePlayer, setDuels, skipDuel } from "./phases.js";
export { buildSnapshot } from "./snapshot.js";
export { spawnCreep } from "./spawn.js";
export type { Entity, Match, PlayerState } from "./types.js";
