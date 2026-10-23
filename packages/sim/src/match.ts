import { getGameData, type GameData } from "@game/game-data";
import { makeRng, type MatchConfig } from "@game/shared";
import { pickCard } from "./actions.js";
import { runBots } from "./bots.js";
import { simulateCombat } from "./combat.js";
import "./content.js";
import { eliminate, grantXp } from "./damage.js";
import { beginPve, checkWinner, respawnHero, updateBetting, updateDuel, updatePve, updateShop } from "./phases.js";
import { hasBehavior, hasCreepBehavior, hasEffect, hasTargeting } from "./registry.js";
import type { Match, PlayerState } from "./types.js";
import { emptyStats } from "./types.js";
import { addLog, arenaCenter, dtOf, emit, heroEntity } from "./world.js";

export interface CreatePlayer {
  id: string;
  name: string;
  isBot: boolean;
  heroId?: string;
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
  const cols = Math.max(1, Math.ceil(Math.sqrt(options.players.length)));
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
    winnerId: null,
    log: [],
    events: [],
    floats: [],
    bossAnnounced: false,
  };

  options.players.forEach((input, index) => {
    const hero = (input.heroId && data.heroes.find((item) => item.id === input.heroId))
      || heroes[index % heroes.length]
      || data.heroes[0]!;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const arena = {
      id: `arena-${input.id}`,
      x: col * (config.arenaSize + config.arenaGap),
      y: row * (config.arenaSize + config.arenaGap),
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
      entityId,
      arenaId: arena.id,
      lives: config.lives,
      level: 1,
      xp: 0,
      gold: 0,
      eliminated: false,
      surrendered: false,
      paused: false,
      cardTimer: 0,
      pendingCards: [],
      inputX: 0,
      inputY: 0,
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
  if (match.phase === "ended") return [] as typeof match.events;
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
  } else if (match.phase === "betting") {
    updateBetting(match, dt);
  } else if (match.phase === "duel") {
    simulateCombat(match, dt);
    checkWinner(match);
    if (match.phase === "duel") updateDuel(match, dt);
  } else if (match.phase === "shop") {
    updateShop(match, dt);
  }
  checkWinner(match);
  if (match.floats.length > 80) match.floats.splice(0, match.floats.length - 80);
  return match.events.slice();
}

export function runTicks(match: Match, count: number) {
  const events = [];
  for (let i = 0; i < count; i += 1) events.push(...tick(match));
  return events;
}

export function quietMatch(match: Match) {
  match.spawns = [];
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  match.projectiles = [];
  for (const player of match.players) {
    for (const slot of player.abilities) slot.cooldown = 999;
    const entity = heroEntity(match, player);
    if (entity) entity.invuln = 0;
  }
}

export { eliminate, grantXp };
