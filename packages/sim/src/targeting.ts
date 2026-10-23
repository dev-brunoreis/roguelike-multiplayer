import { registerTargeting } from "./registry.js";
import type { Entity } from "./types.js";
import { dist, enemiesOf } from "./world.js";

function inRange(origin: Entity, others: Entity[], range: number) {
  return others.filter((enemy) => dist(origin, enemy) <= range + enemy.radius);
}

registerTargeting("nearest", (match, origin, range, ignore) => {
  const list = inRange(origin, enemiesOf(match, origin, ignore), range);
  list.sort((a, b) => dist(origin, a) - dist(origin, b));
  return list[0] ?? null;
});

registerTargeting("lowestHp", (match, origin, range, ignore) => {
  const list = inRange(origin, enemiesOf(match, origin, ignore), range);
  list.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  return list[0] ?? null;
});

registerTargeting("random", (match, origin, range, ignore) => {
  const list = inRange(origin, enemiesOf(match, origin, ignore), range);
  if (list.length === 0) return null;
  return match.rng.pick(list);
});

registerTargeting("densest", (match, origin, range, ignore) => {
  const list = inRange(origin, enemiesOf(match, origin, ignore), range);
  if (list.length === 0) return null;
  let best = list[0]!;
  let bestScore = -1;
  for (const enemy of list) {
    const score = list.filter((other) => dist(enemy, other) <= 2.4).length;
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
});
