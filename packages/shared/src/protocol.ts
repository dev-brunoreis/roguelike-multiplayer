export type Phase = "hub" | "pve" | "betting" | "duel" | "shop" | "dungeon" | "ended";
export type GameModeId = "arena" | "masmorra";

export interface FloatEvent {
  id: number;
  x: number;
  y: number;
  text: string;
  crit: boolean;
  arenaId: string;
  sourcePlayerId?: string;
  targetPlayerId?: string;
}

export interface CardView {
  id: string;
  nome: string;
  descricao: string;
  rarity: string;
}

export interface AbilityView {
  id: string;
  nome: string;
  descricao: string;
  level: number;
  max: number;
  cooldown: number;
  cooldownMax: number;
  color: string;
}

export interface ShopView {
  offers: (CardView & { price: number })[];
  rerollCost: number;
  upgrades: { abilityId: string; nome: string; level: number; max: number; cost: number }[];
}

export interface PlayerSnap {
  id: string;
  name: string;
  isBot: boolean;
  heroId: string;
  color: string;
  lives: number;
  level: number;
  xp: number;
  xpNext: number;
  hp: number;
  maxHp: number;
  respawnIn: number;
  eliminated: boolean;
  choosing: boolean;
  cardTimer: number;
  pending: CardView[];
  cards: { id: string; nome: string; rarity: string }[];
  abilities: AbilityView[];
  shop: ShopView | null;
  kills: number;
  deaths: number;
  damageDealt: number;
  ready: boolean;
  pauseWant: boolean;
  godmode: boolean;
  bet: { targetId: string; amount: number } | null;
  inDuel: boolean;
  arenaId: string;
  waveClear: boolean;
  placement: number | null;
  downed: boolean;
  revive: number;
}

export interface EntitySnap {
  id: number;
  kind: "hero" | "creep" | "boss";
  defId: string;
  view: string;
  x: number;
  y: number;
  radius: number;
  attackRange: number;
  hp: number;
  maxHp: number;
  color: string;
  shadowColor?: string;
  arenaId: string;
  flash: number;
  swing: number;
  strike: number;
  label?: string;
  playerId?: string;
  facing: number;
  statuses: string[];
}

export interface ProjectileSnap {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  arenaId: string;
  abilityId: string;
  color: string;
  vfx: string;
}

export interface FxSnap {
  id: number;
  kind: "ring" | "slash" | "cone" | "flash" | "bolt";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  color: string;
  arenaId: string;
  t: number;
  vfx: string;
}

export interface ArenaSnap {
  id: string;
  x: number;
  y: number;
  size: number;
  ownerId: string | null;
  kind: "pve" | "duel" | "hub" | "room";
  role?: "entrance" | "fight" | "rest" | "elite" | "boss";
  label: string;
}

export interface PortalSnap {
  id: string;
  arenaId: string;
  x: number;
  y: number;
  to: string;
}

export interface DungeonSnap {
  sealed: string[];
  revealed: string[];
  objective: string;
  result: "win" | "lose" | null;
}

export interface DuelPairSnap {
  a: string;
  b: string;
  arenaId: string;
  resolved: boolean;
}

export interface ZoneSnap {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  arenaId: string;
  vfx: string;
  t: number;
}

export interface WarningSnap {
  id: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
  shape: "circle" | "line" | "cone";
  radius: number;
  angle: number;
  color: string;
  arenaId: string;
  t: number;
}

export interface BossSnap {
  nome: string;
  hp: number;
  maxHp: number;
  phase: number;
  marks: number[];
}

export type AnnounceKind = "duel" | "duel_result" | "death" | "surrender" | "eliminate" | "info" | "boss";

export interface AnnounceSnap {
  id: number;
  kind: AnnounceKind;
  title: string;
  detail: string;
  left: number;
}

export interface Snapshot {
  tick: number;
  round: number;
  phase: Phase;
  phaseTime: number;
  winnerId: string | null;
  paused: boolean;
  youId: string;
  dataVersion: string;
  log: string[];
  arenas: ArenaSnap[];
  players: PlayerSnap[];
  entities: EntitySnap[];
  projectiles: ProjectileSnap[];
  zones: ZoneSnap[];
  warnings: WarningSnap[];
  fx: FxSnap[];
  boss: BossSnap | null;
  floats: FloatEvent[];
  duel: DuelPairSnap[];
  duelAnnounce: number;
  announce: AnnounceSnap | null;
  mode: GameModeId;
  portals: PortalSnap[];
  dungeon: DungeonSnap | null;
}

export interface ChatLine {
  id: number;
  playerId: string;
  name: string;
  text: string;
  color: string;
}

export interface ClientInput {
  x: number;
  y: number;
  aimX?: number;
  aimY?: number;
}

export interface ShopAction {
  kind: "buy" | "upgrade" | "reroll" | "ready";
  cardId?: string;
  abilityId?: string;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  heroId: string;
  shadowColor?: string;
}

export interface LobbyHero {
  id: string;
  nome: string;
  descricao: string;
  color: string;
  hp: number;
  speed: number;
}

export interface LobbyConfig {
  slots: number;
  fillWithBots: boolean;
  lives: number;
  cardsPerLevelUp: number;
  mode: GameModeId;
}

export interface LobbyState {
  hostId: string;
  youId: string;
  players: LobbyPlayer[];
  heroes: LobbyHero[];
  config: LobbyConfig;
  error: string | null;
}

export interface MetaCreep {
  id: string;
  nome: string;
}

export interface MetaAbility {
  id: string;
  nome: string;
  descricao: string;
  color: string;
  max: number;
}

export interface MetaCard {
  id: string;
  nome: string;
  descricao: string;
  rarity: string;
}

export interface MetaPlayer {
  id: string;
  name: string;
  heroId: string;
  isBot: boolean;
  color: string;
}

export interface MatchMeta {
  seq: number;
  dataVersion: string;
  tickRate: number;
  mode: GameModeId;
  arenas: ArenaSnap[];
  portals: PortalSnap[];
  creeps: MetaCreep[];
  abilities: MetaAbility[];
  cards: MetaCard[];
  roster: MetaPlayer[];
}

export interface WireAbility {
  id: string;
  level: number;
  cooldown: number;
  cooldownMax: number;
}

export interface WirePlayer {
  id: string;
  lives: number;
  level: number;
  xp: number;
  xpNext: number;
  hp: number;
  maxHp: number;
  respawnIn: number;
  eliminated: boolean;
  choosing: boolean;
  cardTimer: number;
  pending: string[];
  cards: string[];
  abilities: WireAbility[];
  kills: number;
  deaths: number;
  damageDealt: number;
  ready: boolean;
  pauseWant: boolean;
  godmode: boolean;
  bet: { targetId: string; amount: number } | null;
  inDuel: boolean;
  arena: number;
  waveClear: boolean;
  placement: number | null;
  downed: boolean;
  revive: number;
}

export interface WireEntity {
  id: number;
  kind: "hero" | "creep" | "boss";
  defId: string;
  x: number;
  y: number;
  radius: number;
  attackRange: number;
  hp: number;
  maxHp: number;
  color: string;
  shadowColor?: string;
  arena: number;
  flash: number;
  swing: number;
  strike: number;
  playerId?: string;
  facing: number;
  statuses: string[];
}

export interface WireProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  arena: number;
  abilityId: string;
  color: string;
  vfx: string;
}

export interface WireZone {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  arena: number;
  vfx: string;
  t: number;
}

export interface WireWarning {
  id: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
  shape: "circle" | "line" | "cone";
  radius: number;
  angle: number;
  color: string;
  arena: number;
  t: number;
}

export interface WireBoss {
  nome: string;
  hp: number;
  maxHp: number;
  phase: number;
  marks: number[];
}

export interface WireFx {
  id: number;
  kind: "ring" | "slash" | "cone" | "flash" | "bolt";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  color: string;
  arena: number;
  t: number;
  vfx: string;
}

export interface WireFloat {
  id: number;
  x: number;
  y: number;
  text: string;
  crit: boolean;
  arena: number;
  sourcePlayerId?: string;
  targetPlayerId?: string;
}

export interface WireDuel {
  a: string;
  b: string;
  arena: number;
  resolved: boolean;
}

export interface WireDungeon {
  sealed: number[];
  revealed: number[];
  objective: string;
  result: "win" | "lose" | null;
}

export interface WireSnapshot {
  tick: number;
  round: number;
  phase: Phase;
  phaseTime: number;
  winnerId: string | null;
  paused: boolean;
  youId: string;
  log: string[];
  players: WirePlayer[];
  entities: WireEntity[];
  projectiles: WireProjectile[];
  zones: WireZone[];
  warnings: WireWarning[];
  fx: WireFx[];
  boss: WireBoss | null;
  floats: WireFloat[];
  duel: WireDuel[];
  duelAnnounce: number;
  announce: AnnounceSnap | null;
  dungeon: WireDungeon | null;
}
