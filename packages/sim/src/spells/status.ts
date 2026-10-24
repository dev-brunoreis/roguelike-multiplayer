import { dealDamage } from "../damage.js";
import { getStatus, registerStatus } from "../registry.js";
import type { Entity, Match, StatusInst } from "../types.js";
import { entityById, playerById } from "../world.js";

registerStatus("stun", () => {});
registerStatus("slow", () => {});
registerStatus("root", () => {});
registerStatus("burn", (match, entity, status, dt) => {
  status.acc += dt;
  const step = 0.5;
  if (status.acc < step) return;
  status.acc -= step;
  const source = entityById(match, status.sourceId);
  const owner = playerById(match, status.ownerId);
  dealDamage(match, {
    source: source ?? undefined,
    sourcePlayer: owner,
    target: entity,
    amount: status.value * step,
    abilityId: status.spellId,
  });
});

export function applyStatus(
  match: Match,
  target: Entity,
  kind: string,
  time: number,
  value: number,
  from: { sourceId: number; ownerId: string; spellId: string },
) {
  if (!kind || time <= 0 || !getStatus(kind)) return;
  if (kind === "stun" && (match.stunReady.get(target.id) ?? 0) > match.time) return;
  const list = match.statuses.get(target.id) ?? [];
  const current = list.find((status) => status.kind === kind);
  if (current) {
    current.left = Math.max(current.left, time);
    current.value = value;
    current.sourceId = from.sourceId;
    current.ownerId = from.ownerId;
    current.spellId = from.spellId;
    match.statuses.set(target.id, list);
    return;
  }
  const created: StatusInst = {
    kind,
    left: time,
    value,
    acc: 0,
    sourceId: from.sourceId,
    ownerId: from.ownerId,
    spellId: from.spellId,
  };
  list.push(created);
  match.statuses.set(target.id, list);
}

export function tickStatuses(match: Match, dt: number) {
  for (const [id, list] of match.statuses) {
    const entity = entityById(match, id);
    if (!entity?.alive) {
      match.statuses.delete(id);
      continue;
    }
    const next: StatusInst[] = [];
    for (const status of list) {
      status.left -= dt;
      getStatus(status.kind)?.(match, entity, status, dt);
      if (status.left > 0) next.push(status);
      else if (status.kind === "stun") match.stunReady.set(id, match.time + match.config.stunImmuneSeconds);
    }
    if (next.length > 0) match.statuses.set(id, next);
    else match.statuses.delete(id);
  }
}

export function isStunned(match: Match, id: number) {
  return (match.statuses.get(id) ?? []).some((status) => status.kind === "stun" && status.left > 0);
}

export function moveScale(match: Match, id: number) {
  const list = match.statuses.get(id) ?? [];
  if (list.some((status) => status.kind === "stun" || status.kind === "root")) return 0;
  let slow = 0;
  for (const status of list) {
    if (status.kind === "slow") slow = Math.max(slow, status.value);
  }
  return 1 - Math.min(0.8, slow);
}

export function statusKinds(match: Match, id: number) {
  const kinds: string[] = [];
  for (const status of match.statuses.get(id) ?? []) {
    if (status.left <= 0 || kinds.includes(status.kind)) continue;
    kinds.push(status.kind);
  }
  return kinds;
}
