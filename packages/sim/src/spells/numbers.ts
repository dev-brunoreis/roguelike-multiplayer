import type { AbilityLevel, ActionDef } from "@game/shared";
import type { SpellNumbers } from "../types.js";

function pick<T>(actionValue: T | undefined, levelValue: T | undefined, fallback: T): T {
  if (actionValue !== undefined) return actionValue;
  if (levelValue !== undefined) return levelValue;
  return fallback;
}

export function mergeNumbers(level: AbilityLevel | null, action: ActionDef): SpellNumbers {
  return {
    damage: pick(action.damage, level?.damage, 0),
    range: pick(action.range, level?.range, 0),
    radius: pick(action.radius, level?.radius, 0),
    angle: pick(action.angle, level?.angle, 60),
    speed: pick(action.speed, level?.speed ?? level?.projectileSpeed, 0),
    targets: pick(action.targets, level?.targets, 1),
    falloff: pick(action.falloff, level?.falloff, [1]),
    duration: pick(action.duration, level?.duration, 0),
    every: pick(action.every, level?.every, 0.4),
    dropRadius: pick(action.dropRadius, level?.dropRadius, 0),
    count: pick(action.count, level?.count, 1),
    interval: pick(action.interval, level?.interval, 0),
    time: pick(action.time, level?.time, 0),
    bursts: pick(action.bursts, level?.bursts, 1),
    spin: pick(action.spin, level?.spin, 0),
    pierce: pick(action.pierce, level?.pierce, 0),
    amount: pick(action.amount, level?.amount, 0),
    statusTime: pick(action.statusTime, level?.statusTime, 0),
    statusValue: pick(action.statusValue, level?.statusValue, 0),
    curve: pick(action.curve, level?.curve, 0),
    drops: action.drops ?? 0,
  };
}

export function given(level: AbilityLevel | null, action: ActionDef, key: keyof SpellNumbers): boolean {
  if (key === "drops") return action.drops !== undefined;
  const fromAction = action[key as keyof ActionDef];
  if (fromAction !== undefined) return true;
  if (!level) return false;
  if (key === "speed") return level.speed !== undefined || level.projectileSpeed !== undefined;
  const fromLevel = level[key as keyof AbilityLevel];
  return fromLevel !== undefined;
}
