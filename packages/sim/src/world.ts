import type { AnnounceKind } from "@game/shared";
import type { SimEvent } from "./events.js";
import { present } from "./present.js";
import type { Arena, Entity, Match, PlayerState, SkillState } from "./types.js";

export function emit(match: Match, event: SimEvent) {
  match.events.push(event);
  present(match, event);
}

export function addLog(match: Match, text: string) {
  emit(match, { type: "log", text });
}

export function pushBanner(
  match: Match,
  banner: { kind: AnnounceKind; title: string; detail?: string; life?: number },
) {
  emit(match, { type: "banner", kind: banner.kind, title: banner.title, detail: banner.detail, life: banner.life });
}

export function updateBanner(match: Match, dt: number) {
  if (!match.banner) return;
  match.banner.left = Math.max(0, match.banner.left - dt);
  if (match.banner.left <= 0) match.banner = null;
}

export function emitFx(
  match: Match,
  fx: { kind: "ring" | "slash" | "cone" | "flash" | "bolt"; x: number; y: number; x2?: number; y2?: number; radius: number; color: string; arenaId: string; life?: number },
) {
  emit(match, { type: "fx", ...fx });
}

export function floatText(
  match: Match,
  entity: { x: number; y: number; arenaId: string },
  text: string,
  crit = false,
  who?: { sourcePlayerId?: string; targetPlayerId?: string },
) {
  emit(match, {
    type: "float",
    x: entity.x,
    y: entity.y,
    text,
    crit,
    arenaId: entity.arenaId,
    sourcePlayerId: who?.sourcePlayerId,
    targetPlayerId: who?.targetPlayerId,
  });
}

export function emptySkill(): SkillState {
  return { timer: 0, step: "", left: 0, vx: 0, vy: 0, hit: false, homeX: null, homeY: null, returning: false };
}

export function skillOf(match: Match, id: number) {
  const found = match.skillState.get(id);
  if (found) return found;
  const created = emptySkill();
  match.skillState.set(id, created);
  return created;
}

export function syncWorld(match: Match) {
  match.playersById = new Map(match.players.map((player) => [player.id, player]));
  match.arenasById = new Map(match.arenas.map((arena) => [arena.id, arena]));
  match.entitiesById = new Map(match.entities.map((entity) => [entity.id, entity]));
  for (const id of match.skillState.keys()) {
    if (!match.entitiesById.has(id)) match.skillState.delete(id);
  }
}

export function playerById(match: Match, id: string | undefined) {
  if (!id) return undefined;
  return match.playersById.get(id) ?? match.players.find((player) => player.id === id);
}

export function entityById(match: Match, id: number) {
  return match.entitiesById.get(id) ?? match.entities.find((entity) => entity.id === id);
}

export function heroEntity(match: Match, player: PlayerState) {
  return entityById(match, player.entityId);
}

export function arenaById(match: Match, id: string) {
  return match.arenasById.get(id) ?? match.arenas.find((arena) => arena.id === id);
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
  return match.data.byId.cards.get(id);
}

export function abilityById(match: Match, id: string) {
  return match.data.byId.abilities.get(id);
}

export function creepById(match: Match, id: string) {
  return match.data.byId.creeps.get(id);
}

export function roundScale(match: Match) {
  return {
    hp: 1 + (match.round - 1) * 0.28,
    damage: 1 + (match.round - 1) * 0.16,
  };
}
