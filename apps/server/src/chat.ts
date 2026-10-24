import type { ChatLine } from "@game/shared";

const MAX_LINES = 40;
const MAX_CHARS = 160;
const GAP_MS = 400;

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

  push(playerId: string, name: string, color: string, raw: unknown, now = Date.now()): ChatLine | null {
    const text = chatText(raw);
    if (!text) return null;
    const last = this.sentAt.get(playerId) ?? 0;
    if (now - last < GAP_MS) return null;
    this.sentAt.set(playerId, now);
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
}
