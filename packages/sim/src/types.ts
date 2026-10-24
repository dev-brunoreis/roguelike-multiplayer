import type {
  AbilityDef,
  AbilityLevel,
  AnnounceKind,
  EffectDef,
  FloatEvent,
  MatchConfig,
  PersistEvent,
  Phase,
  StatName,
} from "@game/shared";
import type { Rng } from "@game/shared";
import type { GameData } from "@game/game-data";

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
  luck: number;
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
}

export interface Arena {
  id: string;
  x: number;
  y: number;
  size: number;
  ownerId: string | null;
  kind: "pve" | "duel" | "hub";
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
  entityId: number;
  arenaId: string;
  lives: number;
  level: number;
  xp: number;
  gold: number;
  eliminated: boolean;
  surrendered: boolean;
  paused: boolean;
  cardTimer: number;
  pendingCards: string[];
  unspentPicks: number;
  waveClear: boolean;
  inputX: number;
  inputY: number;
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
  wander: number;
  botActed: boolean;
  eliminatedAt: number | null;
}

export interface Match {
  data: GameData;
  config: MatchConfig;
  rng: Rng;
  seed: number;
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
  arenas: Arena[];
  spawns: SpawnJob[];
  duel: DuelPair[];
  waveDone: boolean;
  duelPending: boolean;
  duelAnnounce: number;
  banner: { id: number; kind: AnnounceKind; title: string; detail: string; left: number } | null;
  winnerId: string | null;
  log: string[];
  events: PersistEvent[];
  floats: FloatEvent[];
  fx: { id: number; kind: "ring" | "slash" | "cone" | "flash" | "bolt"; x: number; y: number; x2?: number; y2?: number; radius: number; color: string; arenaId: string; born: number; life: number }[];
  bossAnnounced: boolean;
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

export type AbilityBehavior = (ctx: AbilityContext) => boolean;
export type TargetingFn = (match: Match, origin: Entity, range: number, ignore: Set<number>) => Entity | null;
export type EffectHandler = (match: Match, player: PlayerState, effect: EffectDef) => void;
export type CreepBehavior = (match: Match, creep: Entity, dt: number) => void;
export type DamageHook = (ctx: DamageContext) => void;
export type BotFn = (match: Match, player: PlayerState) => void;

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
    luck: 0,
    cooldownPct: 0,
  };
}

export function isStat(name: string): name is StatName {
  return name in emptyStats();
}
