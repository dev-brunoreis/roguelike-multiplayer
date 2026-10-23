import type { AbilityBehavior, BotFn, CreepBehavior, DamageHook, EffectHandler, TargetingFn } from "./types.js";

const behaviors = new Map<string, AbilityBehavior>();
const targeting = new Map<string, TargetingFn>();
const effects = new Map<string, EffectHandler>();
const creepBehaviors = new Map<string, CreepBehavior>();
const bots = new Map<string, BotFn>();
const beforeDamage: DamageHook[] = [];
const afterDamage: DamageHook[] = [];
const onKill: DamageHook[] = [];

export function registerAbilityBehavior(id: string, fn: AbilityBehavior) {
  behaviors.set(id, fn);
}
export function registerTargeting(id: string, fn: TargetingFn) {
  targeting.set(id, fn);
}
export function registerEffect(id: string, fn: EffectHandler) {
  effects.set(id, fn);
}
export function registerCreepBehavior(id: string, fn: CreepBehavior) {
  creepBehaviors.set(id, fn);
}
export function registerBot(id: string, fn: BotFn) {
  bots.set(id, fn);
}
export function registerBeforeDamage(fn: DamageHook) {
  beforeDamage.push(fn);
}
export function registerAfterDamage(fn: DamageHook) {
  afterDamage.push(fn);
}
export function registerOnKill(fn: DamageHook) {
  onKill.push(fn);
}

export const getBehavior = (id: string) => behaviors.get(id);
export const getTargeting = (id: string) => targeting.get(id);
export const getEffect = (id: string) => effects.get(id);
export const getCreepBehavior = (id: string) => creepBehaviors.get(id);
export const getBot = (id: string) => bots.get(id);
export const damagePipeline = { beforeDamage, afterDamage, onKill };

export function hasBehavior(id: string) {
  return behaviors.has(id);
}
export function hasTargeting(id: string) {
  return targeting.has(id);
}
export function hasEffect(id: string) {
  return effects.has(id);
}
export function hasCreepBehavior(id: string) {
  return creepBehaviors.has(id);
}
