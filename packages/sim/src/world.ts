import type { PersistEvent } from "@game/shared";
import type { Arena, Entity, Match, PlayerState } from "./types.js";

export function emit(match: Match, event: PersistEvent) {
  match.events.push(event);
}

export function addLog(match: Match, text: string) {
  match.log.push(text);
  if (match.log.length > 14) match.log.shift();
}

export function floatText(match: Match, entity: { x: number; y: number; arenaId: string }, text: string, crit = false) {
  match.floats.push({
    id: match.nextId++,
    x: entity.x,
    y: entity.y,
    text,
    crit,
    arenaId: entity.arenaId,
  });
}

export function playerById(match: Match, id: string | undefined) {
  return match.players.find((player) => player.id === id);
}

export function entityById(match: Match, id: number) {
  return match.entities.find((entity) => entity.id === id);
}

export function heroEntity(match: Match, player: PlayerState) {
  return entityById(match, player.entityId);
}

export function arenaById(match: Match, id: string) {
  return match.arenas.find((arena) => arena.id === id);
}

export function arenaCenter(arena: Arena) {
  return { x: arena.x + arena.size / 2, y: arena.y + arena.size / 2 };
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function alivePlayers(match: Match) {
  return match.players.filter((player) => !player.eliminated);
}

export function dtOf(match: Match) {
  return 1 / match.config.tickRate;
}

export function xpToNext(match: Match, level: number) {
  return Math.max(1, Math.floor(match.config.xpBase * Math.pow(level, match.config.xpPower)));
}

export function hasAbility(player: PlayerState, abilityId: string) {
  return player.abilities.some((slot) => slot.abilityId === abilityId);
}

export function abilitySlot(player: PlayerState, abilityId: string) {
  return player.abilities.find((slot) => slot.abilityId === abilityId);
}

export function clampToArena(entity: Entity, arena: Arena) {
  const pad = entity.radius;
  entity.x = clamp(entity.x, arena.x + pad, arena.x + arena.size - pad);
  entity.y = clamp(entity.y, arena.y + pad, arena.y + arena.size - pad);
}

export function enemiesOf(match: Match, entity: Entity, extraIgnore?: Set<number>) {
  return match.entities.filter(
    (other) =>
      other.alive &&
      other.arenaId === entity.arenaId &&
      other.team !== entity.team &&
      other.id !== entity.id &&
      !extraIgnore?.has(other.id),
  );
}

export function cardById(match: Match, id: string) {
  return match.data.cards.find((card) => card.id === id);
}

export function abilityById(match: Match, id: string) {
  return match.data.abilities.find((ability) => ability.id === id);
}

export function creepById(match: Match, id: string) {
  return match.data.creeps.find((creep) => creep.id === id);
}

export function roundScale(match: Match) {
  return {
    hp: 1 + (match.round - 1) * 0.22,
    damage: 1 + (match.round - 1) * 0.12,
  };
}
