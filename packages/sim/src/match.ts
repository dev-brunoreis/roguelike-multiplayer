import { getGameData, type GameData } from "@game/game-data";
import { makeRng, type MatchConfig } from "@game/shared";
import { pickCard, syncPause } from "./actions.js";
import { runBots } from "./bots.js";
import "./content.js";
import { eliminate, grantXp } from "./damage.js";
import { beginPve, checkWinner, respawnHero, updateBetting, updateDuel, updateHub, updatePve, updateShop } from "./phases.js";
import { simulateCombat, simulateMove } from "./combat.js";
import { hasBehavior, hasCreepBehavior, hasEffect, hasTargeting } from "./registry.js";
import type { Match, PlayerState } from "./types.js";
import { emptyStats } from "./types.js";
import { addLog, arenaCenter, dtOf, emit, heroEntity, updateBanner } from "./world.js";

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
}): Match {
  const data = options.data ?? getGameData();
  assertContent(data);
  const config = { ...data.match, ...options.config };
  const seed = options.seed ?? 1;
  const rng = makeRng(seed);
  const heroes = [...data.heroes];
  for (let i = heroes.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const swap = heroes[i]!;
    heroes[i] = heroes[j]!;
    heroes[j] = swap;
  }
  const hubSize = config.hubSize;
  const match: Match = {
    data,
    config,
    rng,
    seed,
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
    arenas: [],
    spawns: [],
    duel: [],
    waveDone: false,
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
  };

  match.arenas.push({
    id: "hub",
    x: -hubSize / 2,
    y: -hubSize / 2,
    size: hubSize,
    ownerId: null,
    kind: "hub",
    label: "Salão",
  });
  const ring = hubSize / 2 + config.arenaGap + config.arenaSize / 2;
  const roster = options.players.length;

  options.players.forEach((input, index) => {
    const hero = (input.heroId && data.heroes.find((item) => item.id === input.heroId))
      || heroes[index % heroes.length]
      || data.heroes[0]!;
    const angle = (index / Math.max(1, roster)) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(angle) * ring;
    const cy = Math.sin(angle) * ring;
    const arena = {
      id: `arena-${input.id}`,
      x: cx - config.arenaSize / 2,
      y: cy - config.arenaSize / 2,
      size: config.arenaSize,
      ownerId: input.id,
      kind: "pve" as const,
      label: input.name,
    };
    match.arenas.push(arena);
    const center = arenaCenter(arena);
    const entityId = match.nextId++;
    const player: PlayerState = {
      id: input.id,
      name: input.name,
      isBot: input.isBot,
      heroId: hero.id,
      color: hero.color,
      shadowColor: listedColor(data.match.shadowColors, input.shadowColor) ?? hero.color,
      entityId,
      arenaId: arena.id,
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
      abilities: [{ abilityId: hero.startingAbility, level: 1, cooldown: 0.35, cooldownMax: 0.35 }],
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
      wander: rng.next() * Math.PI * 2,
      botActed: false,
      eliminatedAt: null,
    };
    match.players.push(player);
    match.entities.push({
      id: entityId,
      kind: "hero",
      defId: hero.id,
      playerId: player.id,
      arenaId: arena.id,
      x: center.x,
      y: center.y,
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
  beginPve(match);
  return match;
}

function assertContent(data: GameData) {
  for (const ability of data.abilities) {
    if (!hasBehavior(ability.behavior)) throw new Error(`Behavior desconhecido em ${ability.id}: ${ability.behavior}`);
    if (!hasTargeting(ability.targeting)) throw new Error(`Targeting desconhecido em ${ability.id}: ${ability.targeting}`);
  }
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

export function tick(match: Match) {
  match.events = [];
  syncPause(match);
  if (match.phase === "ended" || match.paused) return [] as typeof match.events;
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
  if (match.phase === "pve") {
    simulateCombat(match, dt);
    checkWinner(match);
    if (match.phase === "pve") updatePve(match, dt);
  } else if (match.phase === "hub") {
    simulateMove(match, dt);
    updateHub(match, dt);
  } else if (match.phase === "betting") {
    simulateMove(match, dt);
    updateBetting(match, dt);
  } else if (match.phase === "duel") {
    simulateCombat(match, dt);
    checkWinner(match);
    if (match.phase === "duel") updateDuel(match, dt);
  } else if (match.phase === "shop") {
    simulateMove(match, dt);
    updateShop(match, dt);
  }
  checkWinner(match);
  updateBanner(match, dt);
  if (match.floats.length > 80) match.floats.splice(0, match.floats.length - 80);
  match.fx = match.fx.filter((fx) => match.time - fx.born < fx.life);
  return match.events.slice();
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
  match.projectiles = [];
  match.fx = [];
  for (const player of match.players) {
    for (const slot of player.abilities) slot.cooldown = 999;
    const entity = heroEntity(match, player);
    if (entity) entity.invuln = 0;
  }
}

export { eliminate, grantXp };
