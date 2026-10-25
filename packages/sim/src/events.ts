import type { AnnounceKind } from "@game/shared";

export interface MatchStartEvent {
  type: "match_start";
  round: number;
  seed: number;
  players: { id: string; name: string; heroId: string; isBot: boolean }[];
}

export type SimEvent =
  | MatchStartEvent
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
  | { type: "synergy"; round: number; playerId: string; synergyId: string }
  | { type: "log"; text: string }
  | { type: "banner"; kind: AnnounceKind; title: string; detail?: string; life?: number }
  | {
    type: "float";
    x: number;
    y: number;
    text: string;
    crit: boolean;
    arenaId: string;
    sourcePlayerId?: string;
    targetPlayerId?: string;
  }
  | {
    type: "fx";
    kind: "ring" | "slash" | "cone" | "flash" | "bolt";
    x: number;
    y: number;
    x2?: number;
    y2?: number;
    radius: number;
    color: string;
    arenaId: string;
    life?: number;
    vfx?: string;
  };

const PERSIST = new Set<SimEvent["type"]>([
  "match_start",
  "card_offer",
  "card_pick",
  "level",
  "death",
  "eliminate",
  "wave_cleared",
  "wave_failed",
  "duel_result",
  "bet",
  "shop",
  "damage_summary",
  "win",
  "synergy",
]);

export type PersistEvent = Extract<SimEvent, { type: "match_start" | "card_offer" | "card_pick" | "level" | "death" | "eliminate" | "wave_cleared" | "wave_failed" | "duel_result" | "bet" | "shop" | "damage_summary" | "win" | "synergy" }>;

export function isPersist(event: SimEvent): event is PersistEvent {
  return PERSIST.has(event.type);
}
