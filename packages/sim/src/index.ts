import "./content.js";

export { pickCard, placeBet, setInput, setPauseWant, shopAct, surrender } from "./actions.js";
export { runBots } from "./bots.js";
export { dealDamage } from "./damage.js";
export { isPersist, type PersistEvent } from "./events.js";
export { createMatch, quietMatch, runTicks, tick } from "./match.js";
export type { CreatePlayer } from "./match.js";
export { grantXp } from "./progression.js";
export { eliminate } from "./elimination.js";
export {
  registerAbilityBehavior,
  registerBeforeDamage,
  registerBot,
  registerCreepBehavior,
  registerCreepSkill,
  registerEffect,
  registerHitHook,
  registerOnKill,
  registerTargeting,
} from "./registry.js";
export { buildCommon, buildMeta, buildSnapshot, buildWire, interestArenaIds, withYou } from "./snapshot.js";
export { spawnCreep } from "./spawn.js";
export type { Entity, Match, PlayerState } from "./types.js";
