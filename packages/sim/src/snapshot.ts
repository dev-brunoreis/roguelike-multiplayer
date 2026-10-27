import type { AbilityView, CardView, GameModeId, MatchMeta, PlayerSnap, Snapshot, WirePlayer, WireSnapshot } from "@game/shared";
import { abyssMeta, abyssSnap, abyssWire } from "./modes/abyss/wire.js";
import { isFighter } from "./queries.js";
import { getMode } from "./registry.js";
import type { Entity, Match, PlayerState } from "./types.js";
import { statusKinds } from "./spells/status.js";
import { abilityById, cardById, creepById, heroEntity, playerById, skillOf, xpToNext } from "./world.js";

function cardView(match: Match, id: string): CardView | null {
  const card = cardById(match, id);
  if (!card) return null;
  return { id: card.id, nome: card.nome, descricao: card.descricao, rarity: card.rarity };
}

function abilitiesOf(match: Match, player: PlayerState): AbilityView[] {
  return player.abilities.flatMap((slot) => {
    const def = abilityById(match, slot.abilityId);
    if (!def) return [];
    return [{
      id: def.id,
      nome: def.nome,
      descricao: def.descricao,
      level: slot.level,
      max: def.levels.length,
      cooldown: Math.max(0, slot.cooldown),
      cooldownMax: slot.cooldownMax,
      color: def.color,
    }];
  });
}

function attackReach(match: Match, entity: Entity) {
  if (entity.kind !== "hero" || !entity.playerId) return entity.attackRange;
  const player = match.players.find((item) => item.id === entity.playerId);
  if (!player) return 0;
  const area = 1 + player.stats.areaPct;
  let best = 0;
  for (const slot of player.abilities) {
    const def = abilityById(match, slot.abilityId);
    const level = def?.levels[Math.min(slot.level, def.levels.length) - 1];
    if (level) best = Math.max(best, level.range * area);
  }
  return best;
}

function placementOf(match: Match, player: PlayerState) {
  if (match.phase !== "ended") return null;
  const ordered = [...match.players].sort((a, b) => {
    if (a.id === match.winnerId) return -1;
    if (b.id === match.winnerId) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    if (a.eliminated && !b.eliminated) return 1;
    return (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
  });
  return ordered.findIndex((item) => item.id === player.id) + 1;
}

function playerSnap(match: Match, player: PlayerState, youId: string): PlayerSnap {
  const entity = heroEntity(match, player);
  const mine = player.id === youId;
  const cards = player.cards.flatMap((id) => {
    const card = cardById(match, id);
    return card ? [{ id: card.id, nome: card.nome, rarity: card.rarity }] : [];
  });
  return {
    id: player.id,
    name: player.name,
    isBot: player.isBot,
    heroId: player.heroId,
    color: player.shadowColor,
    lives: player.lives,
    level: player.level,
    xp: player.xp,
    xpNext: xpToNext(match, player.level),
    hp: entity?.alive ? entity.hp : 0,
    maxHp: entity?.maxHp ?? 1,
    respawnIn: Math.max(0, player.respawnIn),
    eliminated: player.eliminated,
    choosing: player.pendingCards.length > 0,
    cardTimer: mine ? Math.max(0, player.cardTimer) : 0,
    pending: mine ? player.pendingCards.flatMap((id) => {
      const card = cardView(match, id);
      return card ? [card] : [];
    }) : [],
    cards,
    abilities: abilitiesOf(match, player),
    shop: null,
    kills: player.kills,
    deaths: player.deaths,
    damageDealt: Math.round(player.damageDealt),
    ready: player.ready,
    pauseWant: player.pauseWant,
    godmode: player.godmode,
    bet: null,
    inDuel: isFighter(match, player.id),
    arenaId: entity?.arenaId ?? player.arenaId,
    waveClear: player.waveClear,
    placement: placementOf(match, player),
    downed: player.downed,
    revive: player.reviveProgress,
  };
}

export function buildSnapshot(match: Match, youId: string): Snapshot {
  return {
    tick: match.tick,
    round: match.round,
    phase: match.phase,
    phaseTime: Math.max(0, match.phaseTime),
    winnerId: match.winnerId,
    paused: match.paused,
    youId,
    dataVersion: match.data.version,
    log: match.log.slice(-8),
    arenas: match.arenas.map((arena) => ({
      id: arena.id,
      x: arena.x,
      y: arena.y,
      size: arena.size,
      ownerId: arena.ownerId,
      kind: arena.kind,
      role: arena.role,
      label: arena.label,
    })),
    players: match.players.map((player) => playerSnap(match, player, youId)),
    entities: match.entities.filter((entity) => visibleBody(match, entity)).map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      defId: entity.defId,
      view: entity.defId,
      x: entity.x,
      y: entity.y,
      radius: entity.radius,
      attackRange: attackReach(match, entity),
      hp: entity.hp,
      maxHp: entity.maxHp,
      color: entity.color,
      shadowColor: entity.kind === "hero"
        ? match.players.find((player) => player.id === entity.playerId)?.shadowColor
        : undefined,
      arenaId: entity.arenaId,
      flash: entity.flash,
      swing: entity.swing ?? 0,
      label: entity.kind === "hero"
        ? playerByName(match, entity.playerId)
        : match.data.creeps.find((creep) => creep.id === entity.defId)?.nome,
      playerId: entity.playerId,
      facing: entity.facing,
      statuses: statusKinds(match, entity.id),
    })),
    projectiles: match.projectiles.map((shot) => ({
      id: shot.id,
      x: shot.x,
      y: shot.y,
      vx: shot.vx,
      vy: shot.vy,
      arenaId: shot.arenaId,
      abilityId: shot.abilityId,
      color: shot.color,
      vfx: shot.vfx,
    })),
    zones: match.zones.map((zone) => ({
      id: zone.id,
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      color: zone.color,
      arenaId: zone.arenaId,
      vfx: zone.vfx,
      t: Math.min(1, (match.time - zone.born) / Math.max(0.05, zone.ttl + (match.time - zone.born))),
    })),
    warnings: match.warnings.map((warning) => ({
      id: warning.id,
      x: warning.x,
      y: warning.y,
      x2: warning.x2,
      y2: warning.y2,
      shape: warning.shape,
      radius: warning.radius,
      angle: warning.angle,
      color: warning.color,
      arenaId: warning.arenaId,
      t: Math.min(1, (match.time - warning.born) / Math.max(0.05, warning.life)),
    })),
    fx: match.fx.map((item) => ({
      id: item.id,
      kind: item.kind,
      x: item.x,
      y: item.y,
      x2: item.x2,
      y2: item.y2,
      radius: item.radius,
      color: item.color,
      arenaId: item.arenaId,
      t: Math.min(1, (match.time - item.born) / Math.max(0.05, item.life)),
      vfx: item.vfx,
    })),
    floats: match.floats.slice(-40),
    duel: match.duel.map((pair) => ({ ...pair })),
    duelAnnounce: Math.max(0, match.duelAnnounce),
    announce: match.banner && match.banner.left > 0 ? { ...match.banner } : null,
    mode: modeId(match),
    portals: (match.dungeon?.portals ?? []).map((portal) => ({
      id: portal.id,
      arenaId: portal.arenaId,
      x: portal.x,
      y: portal.y,
      to: portal.toArenaId,
    })),
    obstacles: obstacleSnap(match),
    boss: bossSnap(match, youId),
    dungeon: dungeonSnap(match),
    abyss: abyssSnap(match, youId),
  };
}

function visibleBody(match: Match, entity: Entity) {
  if (entity.alive) return true;
  if (entity.kind !== "hero" || !entity.playerId) return false;
  return playerById(match, entity.playerId)?.downed === true;
}

function bossSnap(match: Match, watchId: string) {
  const arenaId = playerById(match, watchId)?.arenaId;
  if (!arenaId) return null;
  const boss = match.entities.find((entity) => entity.alive && entity.kind === "boss" && entity.arenaId === arenaId);
  if (!boss) return null;
  const def = creepById(match, boss.defId);
  const phase = skillOf(match, boss.id).phase;
  return {
    nome: def?.nome ?? boss.defId,
    hp: q(boss.hp),
    maxHp: q(boss.maxHp),
    phase: phase + 1,
    marks: (def?.phases ?? []).map((item) => item.hpBelow).filter((mark) => mark < 1),
  };
}

function obstacleSnap(match: Match) {
  const list: Snapshot["obstacles"] = [];
  for (const items of match.obstacles.values()) {
    for (const item of items) {
      if (item.shape === "circle") {
        list.push({ arenaId: item.arenaId, shape: "circle", x: q(item.x), y: q(item.y), r: q(item.r) });
      } else if (item.shape === "box") {
        list.push({ arenaId: item.arenaId, shape: "box", x: q(item.x), y: q(item.y), w: q(item.w), h: q(item.h) });
      }
    }
  }
  return list;
}

function dungeonSnap(match: Match) {
  const state = match.dungeon;
  if (!state) return null;
  const sealed = state.rooms
    .filter((room) => match.entities.some((entity) => entity.alive && entity.kind !== "hero" && entity.arenaId === room.id))
    .map((room) => room.id);
  let objective = "Procure o chefe";
  if (state.result === "win") objective = "Chefe derrotado";
  else if (state.result === "lose") objective = "O grupo caiu";
  else {
    const boss = state.rooms.find((room) => room.role === "boss");
    if (boss && state.revealed.has(boss.id)) objective = "Derrote o chefe";
  }
  return {
    sealed,
    revealed: [...state.revealed],
    objective,
    result: state.result,
    cellSize: match.data.dungeon.cellSize,
  };
}

function playerByName(match: Match, id?: string) {
  return playerById(match, id)?.name;
}

const q = (value: number) => Math.round(value * 100) / 100;

export function interestArenaIds(match: Match, watchId: string) {
  return getMode(match.mode).interest(match, watchId);
}

export function buildMeta(match: Match, seq = 1): MatchMeta {
  return {
    seq,
    dataVersion: match.data.version,
    tickRate: match.config.tickRate,
    mode: modeId(match),
    portals: (match.dungeon?.portals ?? []).map((portal) => ({
      id: portal.id,
      arenaId: portal.arenaId,
      x: q(portal.x),
      y: q(portal.y),
      to: portal.toArenaId,
    })),
    obstacles: obstacleSnap(match),
    cellSize: match.data.dungeon.cellSize,
    arenas: match.arenas.map((arena) => ({
      id: arena.id,
      x: q(arena.x),
      y: q(arena.y),
      size: q(arena.size),
      ownerId: arena.ownerId,
      kind: arena.kind,
      role: arena.role,
      label: arena.label,
    })),
    creeps: match.data.creeps.map((creep) => ({ id: creep.id, nome: creep.nome })),
    abilities: match.data.abilities.map((ability) => ({
      id: ability.id,
      nome: ability.nome,
      descricao: ability.descricao,
      color: ability.color,
      max: ability.levels.length,
    })),
    cards: match.data.cards.map((card) => ({
      id: card.id,
      nome: card.nome,
      descricao: card.descricao,
      rarity: card.rarity,
    })),
    roster: match.players.map((player) => ({
      id: player.id,
      name: player.name,
      heroId: player.heroId,
      isBot: player.isBot,
      color: player.shadowColor,
    })),
    abyss: abyssMeta(match),
  };
}

function modeId(match: Match): GameModeId {
  if (match.mode === "masmorra" || match.mode === "abismo") return match.mode;
  return "arena";
}

function arenaIndex(match: Match) {
  return new Map(match.arenas.map((arena, index) => [arena.id, index]));
}

function wirePlayer(match: Match, player: PlayerState, youId: string, arenas: Map<string, number>): WirePlayer {
  const entity = heroEntity(match, player);
  const mine = player.id === youId;
  return {
    id: player.id,
    lives: player.lives,
    level: player.level,
    xp: q(player.xp),
    xpNext: xpToNext(match, player.level),
    hp: q(entity?.alive ? entity.hp : 0),
    maxHp: q(entity?.maxHp ?? 1),
    respawnIn: q(Math.max(0, player.respawnIn)),
    eliminated: player.eliminated,
    choosing: player.pendingCards.length > 0,
    cardTimer: mine ? q(Math.max(0, player.cardTimer)) : 0,
    pending: mine ? [...player.pendingCards] : [],
    cards: [...player.cards],
    abilities: player.abilities.map((slot) => ({
      id: slot.abilityId,
      level: slot.level,
      cooldown: q(Math.max(0, slot.cooldown)),
      cooldownMax: q(slot.cooldownMax),
    })),
    kills: player.kills,
    deaths: player.deaths,
    damageDealt: Math.round(player.damageDealt),
    ready: player.ready,
    pauseWant: player.pauseWant,
    godmode: player.godmode,
    bet: null,
    inDuel: isFighter(match, player.id),
    arena: arenas.get(entity?.arenaId ?? player.arenaId) ?? 0,
    waveClear: player.waveClear,
    placement: placementOf(match, player),
    downed: player.downed,
    revive: q(player.reviveProgress),
  };
}

export function buildCommon(match: Match, watchId: string): WireSnapshot {
  const seen = interestArenaIds(match, watchId);
  const arenas = arenaIndex(match);
  return {
    tick: match.tick,
    round: match.round,
    phase: match.phase,
    phaseTime: q(Math.max(0, match.phaseTime)),
    winnerId: match.winnerId,
    paused: match.paused,
    youId: "",
    log: match.log.slice(-8),
    players: match.players.map((player) => wirePlayer(match, player, "", arenas)),
    entities: match.entities.filter((entity) => visibleBody(match, entity) && seen.has(entity.arenaId)).map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      defId: entity.defId,
      x: q(entity.x),
      y: q(entity.y),
      radius: q(entity.radius),
      attackRange: q(attackReach(match, entity)),
      hp: q(entity.hp),
      maxHp: q(entity.maxHp),
      color: entity.color,
      shadowColor: entity.kind === "hero" ? playerById(match, entity.playerId)?.shadowColor : undefined,
      arena: arenas.get(entity.arenaId) ?? 0,
      flash: entity.flash,
      swing: entity.swing ?? 0,
      playerId: entity.playerId,
      facing: q(entity.facing),
      statuses: statusKinds(match, entity.id),
    })),
    projectiles: match.projectiles.filter((shot) => seen.has(shot.arenaId)).map((shot) => ({
      id: shot.id,
      x: q(shot.x),
      y: q(shot.y),
      vx: q(shot.vx),
      vy: q(shot.vy),
      arena: arenas.get(shot.arenaId) ?? 0,
      abilityId: shot.abilityId,
      color: shot.color,
      vfx: shot.vfx,
    })),
    zones: match.zones.filter((zone) => seen.has(zone.arenaId)).map((zone) => ({
      id: zone.id,
      x: q(zone.x),
      y: q(zone.y),
      radius: q(zone.radius),
      color: zone.color,
      arena: arenas.get(zone.arenaId) ?? 0,
      vfx: zone.vfx,
      t: q(Math.min(1, (match.time - zone.born) / Math.max(0.05, zone.ttl + (match.time - zone.born)))),
    })),
    warnings: match.warnings.filter((warning) => seen.has(warning.arenaId)).map((warning) => ({
      id: warning.id,
      x: q(warning.x),
      y: q(warning.y),
      x2: q(warning.x2),
      y2: q(warning.y2),
      shape: warning.shape,
      radius: q(warning.radius),
      angle: q(warning.angle),
      color: warning.color,
      arena: arenas.get(warning.arenaId) ?? 0,
      t: q(Math.min(1, (match.time - warning.born) / Math.max(0.05, warning.life))),
    })),
    fx: match.fx.filter((item) => seen.has(item.arenaId)).map((item) => ({
      id: item.id,
      kind: item.kind,
      x: q(item.x),
      y: q(item.y),
      x2: item.x2 == null ? undefined : q(item.x2),
      y2: item.y2 == null ? undefined : q(item.y2),
      radius: q(item.radius),
      color: item.color,
      arena: arenas.get(item.arenaId) ?? 0,
      t: q(Math.min(1, (match.time - item.born) / Math.max(0.05, item.life))),
      vfx: item.vfx,
    })),
    floats: match.floats.filter((item) => seen.has(item.arenaId)).slice(-40).map((item) => ({
      id: item.id,
      x: q(item.x),
      y: q(item.y),
      text: item.text,
      crit: item.crit,
      arena: arenas.get(item.arenaId) ?? 0,
      sourcePlayerId: item.sourcePlayerId,
      targetPlayerId: item.targetPlayerId,
    })),
    duel: match.duel.map((pair) => ({
      a: pair.a,
      b: pair.b,
      arena: arenas.get(pair.arenaId) ?? 0,
      resolved: pair.resolved,
    })),
    duelAnnounce: q(Math.max(0, match.duelAnnounce)),
    announce: match.banner && match.banner.left > 0 ? { ...match.banner, left: q(match.banner.left) } : null,
    boss: bossSnap(match, watchId),
    dungeon: wireDungeon(match, arenas),
    abyss: abyssWire(match, watchId),
  };
}

function wireDungeon(match: Match, arenas: Map<string, number>) {
  const snap = dungeonSnap(match);
  if (!snap) return null;
  const index = (id: string) => arenas.get(id) ?? 0;
  return {
    sealed: snap.sealed.map(index),
    revealed: snap.revealed.map(index),
    objective: snap.objective,
    result: snap.result,
  };
}

export function withYou(common: WireSnapshot, match: Match, youId: string): WireSnapshot {
  const arenas = arenaIndex(match);
  const you = playerById(match, youId);
  return {
    ...common,
    youId,
    players: common.players.map((player) => {
      if (player.id !== youId || !you) return player;
      return wirePlayer(match, you, youId, arenas);
    }),
  };
}

export function buildWire(match: Match, youId: string, watchId = youId): WireSnapshot {
  return withYou(buildCommon(match, watchId), match, youId);
}
