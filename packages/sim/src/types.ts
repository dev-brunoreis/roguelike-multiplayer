import type {
  AbilityDef,
  AbilityLevel,
  ActionDef,
  AnnounceKind,
  EffectDef,
  FloatEvent,
  MatchConfig,
  Phase,
  StatName,
} from "@game/shared";
import type { Rng } from "@game/shared";
import type { GameData } from "@game/game-data";
import type { SimEvent } from "./events.js";

export interface Stats {
  damagePct: number;
  attackSpeedPct: number;
  moveSpeedPct: number;
  maxHpFlat: number;
  armor: number;
  critChance: number;
  critMultiplier: number;
  lifesteal: number;
  areaPct: number;
  xpPct: number;
  cooldownPct: number;
}

export interface Hook {
  hook: string;
  value: number;
}

export interface AbilitySlot {
  abilityId: string;
  level: number;
  cooldown: number;
  cooldownMax: number;
}

export interface Entity {
  id: number;
  kind: "hero" | "creep" | "boss";
  defId: string;
  playerId?: string;
  arenaId: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldown: number;
  attackTimer: number;
  attackRange: number;
  attackWindup?: number;
  winding?: number;
  armor: number;
  xp: number;
  gold: number;
  color: string;
  team: string;
  alive: boolean;
  invuln: number;
  flash: number;
  swing?: number;
  facing: number;
  behavior: string;
  summonedBy?: number;
}

export interface SkillState {
  timer: number;
  step: "" | "dash" | "burst";
  left: number;
  vx: number;
  vy: number;
  hit: boolean;
  homeX: number | null;
  homeY: number | null;
  returning: boolean;
  phase: number;
  rot: number;
  pace: number;
  payload: number;
  payloadRadius: number;
  crit: boolean;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  crit: boolean;
  arenaId: string;
  team: string;
  ownerId: string;
  sourceId?: number;
  abilityId: string;
  color: string;
  ttl: number;
  vfx: string;
  pierce: number;
  hit: number[];
  curve: number;
  returns: boolean;
  returning: boolean;
  originX: number;
  originY: number;
  travel: number;
  range: number;
  status: string;
  statusTime: number;
  statusValue: number;
  orbit: boolean;
  angle: number;
  orbitRadius: number;
  spin: number;
}

export interface Zone {
  id: number;
  x: number;
  y: number;
  radius: number;
  arenaId: string;
  team: string;
  ownerId: string;
  sourceId: number;
  spellId: string;
  color: string;
  vfx: string;
  damage: number;
  crit: boolean;
  every: number;
  acc: number;
  ttl: number;
  born: number;
  follow: "point" | "caster" | "trail";
  drops: number;
  dropRadius: number;
  status: string;
  statusTime: number;
  statusValue: number;
  childLife: number;
}

export interface Warning {
  id: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
  shape: "circle" | "line" | "cone";
  radius: number;
  angle: number;
  arenaId: string;
  color: string;
  team: string;
  born: number;
  life: number;
}

export interface StatusInst {
  kind: string;
  left: number;
  value: number;
  acc: number;
  sourceId: number;
  ownerId: string;
  spellId: string;
}

export interface Volley {
  id: number;
  casterId: number;
  left: number;
  interval: number;
  bursts: number;
  angle: number;
  spin: number;
  count: number;
  shape: string;
  speed: number;
  damage: number;
  crit: boolean;
  width: number;
  pierce: number;
  curve: number;
  returns: boolean;
  range: number;
  status: string;
  statusTime: number;
  statusValue: number;
  team: string;
  arenaId: string;
  ownerId: string;
  spellId: string;
  color: string;
  vfx: string;
}

export interface Telegraph {
  id: number;
  left: number;
  casterId: number;
  playerId: string;
  spellId: string;
  color: string;
  vfx: string;
  targeting: string;
  numbers: SpellNumbers;
  aimX: number | null;
  aimY: number | null;
  action: ActionDef;
}

export interface SpellNumbers {
  damage: number;
  range: number;
  radius: number;
  angle: number;
  speed: number;
  targets: number;
  falloff: number[];
  duration: number;
  every: number;
  dropRadius: number;
  count: number;
  interval: number;
  time: number;
  bursts: number;
  spin: number;
  pierce: number;
  amount: number;
  statusTime: number;
  statusValue: number;
  curve: number;
  drops: number;
}

export interface Arena {
  id: string;
  x: number;
  y: number;
  size: number;
  ownerId: string | null;
  kind: "pve" | "duel" | "hub" | "room";
  role?: "entrance" | "fight" | "rest" | "elite" | "boss";
  label: string;
}

export interface SpawnJob {
  arenaId: string;
  creepId: string;
  left: number;
  interval: number;
  acc: number;
}

export interface DuelPair {
  a: string;
  b: string;
  arenaId: string;
  resolved: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  heroId: string;
  color: string;
  shadowColor: string;
  entityId: number;
  arenaId: string;
  lives: number;
  level: number;
  xp: number;
  gold: number;
  eliminated: boolean;
  surrendered: boolean;
  paused: boolean;
  pauseWant: boolean;
  cardTimer: number;
  pendingCards: string[];
  unspentPicks: number;
  waveClear: boolean;
  inputX: number;
  inputY: number;
  aimX: number | null;
  aimY: number | null;
  abilities: AbilitySlot[];
  cards: string[];
  tags: Record<string, number>;
  synergies: string[];
  stats: Stats;
  hooks: { onHit: Hook[]; onKill: Hook[] };
  kills: number;
  deaths: number;
  damageDealt: number;
  phaseDamage: Record<string, number>;
  respawnIn: number;
  bet: { targetId: string; amount: number } | null;
  shopOffers: string[];
  ready: boolean;
  godmode: boolean;
  wander: number;
  botActed: boolean;
  eliminatedAt: number | null;
  downed: boolean;
  reviveProgress: number;
  portalCd: number;
}

export interface DungeonPortal {
  id: string;
  arenaId: string;
  x: number;
  y: number;
  toArenaId: string;
  toX: number;
  toY: number;
}

export interface DungeonRoom {
  id: string;
  col: number;
  row: number;
  depth: number;
  role: "entrance" | "fight" | "rest" | "elite" | "boss";
  armed: boolean;
}

export interface DungeonState {
  rooms: DungeonRoom[];
  portals: DungeonPortal[];
  revealed: Set<string>;
  result: "win" | "lose" | null;
}

export interface Match {
  data: GameData;
  config: MatchConfig;
  rng: Rng;
  seed: number;
  mode: string;
  tick: number;
  time: number;
  round: number;
  phase: Phase;
  phaseTime: number;
  nextId: number;
  rosterCount: number;
  players: PlayerState[];
  entities: Entity[];
  projectiles: Projectile[];
  zones: Zone[];
  warnings: Warning[];
  volleys: Volley[];
  telegraphs: Telegraph[];
  statuses: Map<number, StatusInst[]>;
  stunReady: Map<number, number>;
  bossArenas: Set<string>;
  arenas: Arena[];
  spawns: SpawnJob[];
  duel: DuelPair[];
  waveDone: boolean;
  duelsEnabled: boolean;
  botsGodmode: boolean;
  duelPending: boolean;
  duelAnnounce: number;
  banner: { id: number; kind: AnnounceKind; title: string; detail: string; left: number } | null;
  winnerId: string | null;
  log: string[];
  events: SimEvent[];
  skillState: Map<number, SkillState>;
  entitiesById: Map<number, Entity>;
  playersById: Map<string, PlayerState>;
  arenasById: Map<string, Arena>;
  floats: FloatEvent[];
  fx: { id: number; kind: "ring" | "slash" | "cone" | "flash" | "bolt"; x: number; y: number; x2?: number; y2?: number; radius: number; color: string; arenaId: string; born: number; life: number }[];
  bossAnnounced: boolean;
  paused: boolean;
  dungeon: DungeonState | null;
}

export interface AbilityContext {
  match: Match;
  player: PlayerState;
  caster: Entity;
  ability: AbilityDef;
  level: AbilityLevel;
}

export interface DamageContext {
  match: Match;
  source?: Entity;
  sourcePlayer?: PlayerState;
  target: Entity;
  amount: number;
  abilityId?: string;
  crit: boolean;
  killed: boolean;
}

export interface CastCtx {
  match: Match;
  caster: Entity;
  player: PlayerState | null;
  spellId: string;
  color: string;
  vfx: string;
  targeting: string;
  numbers: SpellNumbers;
  aim: { x: number; y: number } | null;
  action: ActionDef;
}

export type SpellAction = (ctx: CastCtx, force: boolean) => boolean;
export type StatusFn = (match: Match, entity: Entity, status: StatusInst, dt: number) => void;
export type AbilityBehavior = (ctx: AbilityContext) => boolean;
export type TargetingFn = (match: Match, origin: Entity, range: number, ignore: Set<number>) => Entity | null;
export type EffectHandler = (match: Match, player: PlayerState, effect: EffectDef) => void;
export type CreepBehavior = (match: Match, creep: Entity, dt: number) => void;
export type DamageHook = (ctx: DamageContext) => void;
export type HitHook = (ctx: DamageContext, value: number, info: { final: number; nested: boolean }) => void;
export type BotFn = (match: Match, player: PlayerState) => void;

export interface GameMode {
  id: string;
  bot: string;
  setup(match: Match): void;
  update(match: Match, dt: number): void;
  checkEnd(match: Match): void;
  onHeroKilled(match: Match, player: PlayerState): void;
  offerOnLevel(match: Match): boolean;
  interest(match: Match, watchId: string): Set<string>;
}

export function emptyStats(): Stats {
  return {
    damagePct: 0,
    attackSpeedPct: 0,
    moveSpeedPct: 0,
    maxHpFlat: 0,
    armor: 0,
    critChance: 0,
    critMultiplier: 2,
    lifesteal: 0,
    areaPct: 0,
    xpPct: 0,
    cooldownPct: 0,
  };
}

export function isStat(name: string): name is StatName {
  return name in emptyStats();
}
