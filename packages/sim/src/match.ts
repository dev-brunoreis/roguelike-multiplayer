import { getGameData, type GameData } from "@game/game-data";
import { makeRng, type MatchConfig } from "@game/shared";
import { pickCard, syncPause } from "./actions.js";
import { runBots } from "./bots.js";
import "./content.js";
import { isPersist, type PersistEvent } from "./events.js";
import { respawnHero } from "./modes/arena/phases/move.js";
import { getMode, hasCreepBehavior, hasEffect } from "./registry.js";
import { assertSpells } from "./spells/validate.js";
import type { Match, PlayerState } from "./types.js";
import { emptyStats } from "./types.js";
import { addLog, clearHazards, dtOf, emit, heroEntity, syncWorld, updateBanner } from "./world.js";

export interface CreatePlayer {
  id: string;
  name: string;
  isBot: boolean;
  heroId?: string;
  shadowColor?: string;
}

export function createMatch(options: {
  players: CreatePlayer[];
  seed?: number;
  config?: Partial<MatchConfig>;
  data?: GameData;
  mode?: string;
}): Match {
  const data = options.data ?? getGameData();
  assertContent(data);
  const config = { ...data.match, ...options.config };
  const seed = options.seed ?? 1;
  const mode = options.mode ?? "arena";
  const rng = makeRng(seed);
  const heroes = [...data.heroes];
  for (let i = heroes.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const swap = heroes[i]!;
    heroes[i] = heroes[j]!;
    heroes[j] = swap;
  }
  const match: Match = {
    data,
    config,
    rng,
    seed,
    mode,
    tick: 0,
    time: 0,
    round: 1,
    phase: "pve",
    phaseTime: config.pveSeconds,
    nextId: 1,
    rosterCount: options.players.length,
    players: [],
    entities: [],
    projectiles: [],
    zones: [],
    warnings: [],
    volleys: [],
    telegraphs: [],
    statuses: new Map(),
    stunReady: new Map(),
    bossArenas: new Set(),
    arenas: [],
    spawns: [],
    duel: [],
    waveDone: false,
    duelsEnabled: true,
    botsGodmode: false,
    duelPending: false,
    duelAnnounce: 0,
    banner: null,
    winnerId: null,
    log: [],
    events: [],
    floats: [],
    fx: [],
    bossAnnounced: false,
    paused: false,
    dungeon: null,
    obstacles: new Map(),
    navs: new Map(),
    paths: new Map(),
    skillState: new Map(),
    entitiesById: new Map(),
    playersById: new Map(),
    arenasById: new Map(),
  };

  options.players.forEach((input, index) => {
    const hero = (input.heroId && data.heroes.find((item) => item.id === input.heroId))
      || heroes[index % heroes.length]
      || data.heroes[0]!;
    const entityId = match.nextId++;
    const player: PlayerState = {
      id: input.id,
      name: input.name,
      isBot: input.isBot,
      heroId: hero.id,
      color: hero.color,
      shadowColor: listedColor(data.match.shadowColors, input.shadowColor) ?? hero.color,
      entityId,
      arenaId: "",
      lives: config.lives,
      level: 1,
      xp: 0,
      gold: 0,
      eliminated: false,
      surrendered: false,
      paused: false,
      pauseWant: false,
      cardTimer: 0,
      pendingCards: [],
      unspentPicks: 0,
      waveClear: false,
      inputX: 0,
      inputY: 0,
      aimX: null,
      aimY: null,
      abilities: [{ abilityId: hero.startingAbility, level: 1, cooldown: config.startCooldown, cooldownMax: config.startCooldown }],
      cards: [],
      tags: {},
      synergies: [],
      stats: emptyStats(),
      hooks: { onHit: [], onKill: [] },
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      phaseDamage: {},
      respawnIn: 0,
      bet: null,
      shopOffers: [],
      ready: false,
      godmode: false,
      wander: rng.next() * Math.PI * 2,
      botActed: false,
      eliminatedAt: null,
      downed: false,
      reviveProgress: 0,
      portalCd: 0,
    };
    match.players.push(player);
    match.entities.push({
      id: entityId,
      kind: "hero",
      defId: hero.id,
      playerId: player.id,
      arenaId: "",
      x: 0,
      y: 0,
      radius: hero.radius,
      hp: hero.hp,
      maxHp: hero.hp,
      speed: hero.speed,
      damage: 0,
      attackCooldown: 1,
      attackTimer: 0,
      attackRange: 1,
      armor: 0,
      xp: 0,
      gold: 0,
      color: hero.color,
      team: "player",
      alive: true,
      invuln: 0,
      flash: 0,
      swing: 0,
      facing: 0,
      behavior: "hero",
    });
  });

  syncWorld(match);
  emit(match, {
    type: "match_start",
    round: 1,
    seed,
    players: match.players.map((player) => ({
      id: player.id,
      name: player.name,
      heroId: player.heroId,
      isBot: player.isBot,
    })),
  });
  addLog(match, "A partida começou");
  getMode(match.mode).setup(match);
  return match;
}

function assertContent(data: GameData) {
  assertSpells(data);
  for (const creep of data.creeps) {
    if (!hasCreepBehavior(creep.behavior)) throw new Error(`IA desconhecida em ${creep.id}: ${creep.behavior}`);
  }
  for (const card of data.cards) {
    for (const effect of card.effects) {
      if (!hasEffect(effect.type)) throw new Error(`Efeito desconhecido na carta ${card.id}: ${effect.type}`);
    }
  }
  for (const synergy of data.synergies) {
    for (const effect of synergy.effects) {
      if (!hasEffect(effect.type)) throw new Error(`Efeito desconhecido na sinergia ${synergy.id}: ${effect.type}`);
    }
  }
}

export function tick(match: Match): PersistEvent[] {
  match.events = [];
  syncWorld(match);
  syncPause(match);
  if (match.phase === "ended" || match.paused) return [];
  const dt = dtOf(match);
  match.tick += 1;
  match.time += dt;
  runBots(match);
  for (const entity of match.entities) {
    if (entity.invuln > 0) entity.invuln -= dt;
  }
  for (const player of match.players) {
    if (player.eliminated) continue;
    for (const slot of player.abilities) {
      if (slot.cooldown > 0) slot.cooldown -= dt;
    }
    if (player.respawnIn > 0) {
      player.respawnIn -= dt;
      if (player.respawnIn <= 0) respawnHero(match, player);
    }
    if (player.pendingCards.length > 0) {
      player.cardTimer -= dt;
      if (player.cardTimer <= 0) {
        const cardId = match.rng.pick(player.pendingCards);
        pickCard(match, player.id, cardId, true);
      }
    }
  }
  const mode = getMode(match.mode);
  mode.update(match, dt);
  mode.checkEnd(match);
  updateBanner(match, dt);
  if (match.floats.length > 80) match.floats.splice(0, match.floats.length - 80);
  match.fx = match.fx.filter((fx) => match.time - fx.born < fx.life);
  return match.events.filter(isPersist);
}

export function runTicks(match: Match, count: number) {
  const events = [];
  for (let i = 0; i < count; i += 1) events.push(...tick(match));
  return events;
}

function listedColor(colors: string[], raw?: string) {
  const wanted = raw?.toLowerCase();
  return colors.find((color) => color.toLowerCase() === wanted);
}

export function quietMatch(match: Match) {
  match.spawns = [];
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  clearHazards(match);
  match.fx = [];
  syncWorld(match);
  for (const player of match.players) {
    for (const slot of player.abilities) slot.cooldown = 999;
    const entity = heroEntity(match, player);
    if (entity) entity.invuln = 0;
  }
}
