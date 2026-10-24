export type Phase = "hub" | "pve" | "betting" | "duel" | "shop" | "ended";

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

export type PersistEvent =
  | { type: "match_start"; round: number; seed: number; players: { id: string; name: string; heroId: string; isBot: boolean }[] }
  | { type: "card_offer"; round: number; playerId: string; cards: string[] }
  | { type: "card_pick"; round: number; playerId: string; cardId: string; auto: boolean }
  | { type: "level"; round: number; playerId: string; level: number }
  | { type: "death"; round: number; playerId: string; livesLeft: number }
  | { type: "eliminate"; round: number; playerId: string; reason: string }
  | { type: "wave_cleared"; round: number }
  | { type: "wave_failed"; round: number }
  | { type: "duel_result"; round: number; winnerId: string; loserId: string; timeout: boolean }
  | { type: "bet"; round: number; playerId: string; targetId: string; amount: number }
  | { type: "shop"; round: number; playerId: string; action: string; cardId?: string; abilityId?: string; cost: number }
  | { type: "damage_summary"; round: number; playerId: string; byAbility: Record<string, number> }
  | { type: "win"; round: number; playerId: string | null }
  | { type: "synergy"; round: number; playerId: string; synergyId: string };

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
  luck: number;
  hp: number;
  maxHp: number;
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
  bet: { targetId: string; amount: number } | null;
  inDuel: boolean;
  arenaId: string;
  waveClear: boolean;
  placement: number | null;
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
  label?: string;
  playerId?: string;
}

export interface ProjectileSnap {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  arenaId: string;
  color: string;
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
}

export interface ArenaSnap {
  id: string;
  x: number;
  y: number;
  size: number;
  ownerId: string | null;
  kind: "pve" | "duel" | "hub";
  label: string;
}

export interface DuelPairSnap {
  a: string;
  b: string;
  arenaId: string;
  resolved: boolean;
}

export type AnnounceKind = "duel" | "duel_result" | "death" | "surrender" | "eliminate" | "info";

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
  youId: string;
  dataVersion: string;
  log: string[];
  arenas: ArenaSnap[];
  players: PlayerSnap[];
  entities: EntitySnap[];
  projectiles: ProjectileSnap[];
  fx: FxSnap[];
  floats: FloatEvent[];
  duel: DuelPairSnap[];
  duelAnnounce: number;
  announce: AnnounceSnap | null;
}

export interface ClientInput {
  x: number;
  y: number;
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
}

export interface LobbyState {
  hostId: string;
  youId: string;
  players: LobbyPlayer[];
  heroes: LobbyHero[];
  config: LobbyConfig;
  error: string | null;
}
