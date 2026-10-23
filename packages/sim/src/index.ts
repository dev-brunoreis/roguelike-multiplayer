import "./content.js";

export { pickCard, placeBet, setInput, shopAct, surrender } from "./actions.js";
export { runBots } from "./bots.js";
export { dealDamage } from "./damage.js";
export { createMatch, grantXp, quietMatch, runTicks, tick } from "./match.js";
export type { CreatePlayer } from "./match.js";
export {
  registerAbilityBehavior,
  registerBeforeDamage,
  registerBot,
  registerCreepBehavior,
  registerEffect,
  registerOnKill,
  registerTargeting,
} from "./registry.js";
export { buildSnapshot } from "./snapshot.js";
export { spawnCreep } from "./spawn.js";
export type { Entity, Match, PlayerState } from "./types.js";
