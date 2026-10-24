import type { ChatLine } from "@game/shared";

const MAX_LINES = 40;
const MAX_CHARS = 160;
const GAP_MS = 400;

const SWITCH = "(?:\\s+(on|off|ligar|desligar))?";

export type ChatCommand =
  | { name: "godmode"; on?: boolean }
  | { name: "skipduel" }
  | { name: "duels"; on?: boolean }
  | { name: "wave"; round: number }
  | { name: "bots"; on?: boolean }
  | { name: "revive"; target?: string };

function flag(on: boolean | undefined): { on?: boolean } {
  return on == null ? {} : { on };
}

function switched(word: string | undefined): boolean | undefined {
  const value = word?.toLowerCase();
  if (value === "on" || value === "ligar") return true;
  if (value === "off" || value === "desligar") return false;
  return undefined;
}

export function chatCommand(text: string): ChatCommand | null {
  const trimmed = text.trim();
  const godmode = trimmed.match(new RegExp(`^/?godmode${SWITCH}$`, "i"));
  if (godmode) return { name: "godmode", ...flag(switched(godmode[1])) };
  if (/^\/?(skipduelo|pular\s+duelo)$/i.test(trimmed)) return { name: "skipduel" };
  const duels = trimmed.match(new RegExp(`^/?duelos${SWITCH}$`, "i"));
  if (duels) return { name: "duels", ...flag(switched(duels[1])) };
  const wave = trimmed.match(/^\/?onda\s+(\d+)$/i);
  if (wave) return { name: "wave", round: Number(wave[1]) };
  const bots = trimmed.match(new RegExp(`^/?bots${SWITCH}$`, "i"));
  if (bots) return { name: "bots", ...flag(switched(bots[1])) };
  const revive = trimmed.match(/^\/?reviver(?:\s+(.+))?$/i);
  if (revive) return { name: "revive", ...(revive[1] ? { target: revive[1].trim() } : {}) };
  return null;
}

export function chatText(raw: unknown): string | null {
  const source = typeof raw === "string"
    ? raw
    : typeof raw === "object" && raw && "text" in raw && typeof (raw as { text?: unknown }).text === "string"
      ? (raw as { text: string }).text
      : "";
  const text = source.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, MAX_CHARS);
}

export class RoomChat {
  private items: ChatLine[] = [];
  private seq = 1;
  private sentAt = new Map<string, number>();

  lines() {
    return this.items;
  }

  admit(playerId: string, now = Date.now()) {
    const last = this.sentAt.get(playerId) ?? 0;
    if (now - last < GAP_MS) return false;
    this.sentAt.set(playerId, now);
    return true;
  }

  post(playerId: string, name: string, color: string, text: string): ChatLine {
    const line: ChatLine = {
      id: this.seq,
      playerId,
      name,
      text,
      color: color || "#f3ecdf",
    };
    this.seq += 1;
    this.items.push(line);
    if (this.items.length > MAX_LINES) this.items.shift();
    return line;
  }

  push(playerId: string, name: string, color: string, raw: unknown, now = Date.now()): ChatLine | null {
    const text = chatText(raw);
    if (!text || !this.admit(playerId, now)) return null;
    return this.post(playerId, name, color, text);
  }
}
