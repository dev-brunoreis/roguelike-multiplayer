import type { BotFn, CreepBehavior, DamageHook, EffectHandler, GameMode, HitHook, SpellAction, StatusFn, TargetingFn } from "./types.js";

const actions = new Map<string, SpellAction>();
const statuses = new Map<string, StatusFn>();
const targeting = new Map<string, TargetingFn>();
const effects = new Map<string, EffectHandler>();
const creepBehaviors = new Map<string, CreepBehavior>();
const bots = new Map<string, BotFn>();
const beforeDamage: DamageHook[] = [];
const afterDamage: DamageHook[] = [];
const onKill: DamageHook[] = [];
const hitHooks = new Map<string, { phase: "before" | "after"; fn: HitHook }>();
const modes = new Map<string, GameMode>();

export function registerAction(id: string, fn: SpellAction) {
  actions.set(id, fn);
}
export function registerStatus(id: string, fn: StatusFn) {
  statuses.set(id, fn);
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
export function registerHitHook(id: string, phase: "before" | "after", fn: HitHook) {
  hitHooks.set(id, { phase, fn });
}
export function registerMode(id: string, mode: GameMode) {
  modes.set(id, mode);
}

export const getAction = (id: string) => actions.get(id);
export const getStatus = (id: string) => statuses.get(id);
export const getTargeting = (id: string) => targeting.get(id);
export const getEffect = (id: string) => effects.get(id);
export const getCreepBehavior = (id: string) => creepBehaviors.get(id);
export const getBot = (id: string) => bots.get(id);
export function getMode(id: string): GameMode {
  const mode = modes.get(id);
  if (!mode) throw new Error(`Modo desconhecido: ${id}`);
  return mode;
}
export const getHitHook = (id: string) => hitHooks.get(id);
export const damagePipeline = { beforeDamage, afterDamage, onKill };

export function hasAction(id: string) {
  return actions.has(id);
}
export function hasStatus(id: string) {
  return statuses.has(id);
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
