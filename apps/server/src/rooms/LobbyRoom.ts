import { getGameData } from "@game/game-data";
import type { LobbyConfig, LobbyState } from "@game/shared";
import { matchOptionsSchema } from "@game/shared";
import { Client, matchMaker, Room } from "colyseus";
import { verifyToken } from "../auth.js";
import { chatCommand, chatText, RoomChat } from "../chat.js";

const BOT_NAMES = ["Bram", "Lira", "Kas", "Nox", "Vesper", "Ivo", "Sena"];

interface Seat {
  id: string;
  name: string;
  heroId: string;
  shadowColor?: string;
}

export class LobbyRoom extends Room {
  private seats: Seat[] = [];
  private sessions = new Map<string, Seat>();
  private config: LobbyConfig;
  private error: string | null = null;
  private heroIds: string[] = [];
  private shadowColors: string[] = [];
  private chat = new RoomChat();

  constructor() {
    super();
    const data = getGameData();
    this.heroIds = data.heroes.map((hero) => hero.id);
    this.shadowColors = data.match.shadowColors;
    this.config = {
      slots: 4,
      fillWithBots: true,
      lives: data.match.lives,
      cardsPerLevelUp: data.match.cardsPerLevelUp,
    };
  }

  onCreate() {
    this.maxClients = this.config.slots;
    this.onMessage("config", (client, raw: unknown) => {
      if (!this.isHost(client)) return;
      const parsed = matchOptionsSchema.safeParse(raw);
      if (!parsed.success) return;
      this.config = { ...this.config, ...strip(parsed.data) };
      this.maxClients = Math.max(this.config.slots, this.seats.length);
      this.error = null;
      this.push();
    });

    this.onMessage("hero", (client, raw: unknown) => {
      const heroId = typeof raw === "object" && raw && "heroId" in raw ? String((raw as { heroId?: string }).heroId ?? "") : "";
      if (!this.heroIds.includes(heroId)) return;
      const auth = this.sessions.get(client.sessionId);
      const seat = this.seats.find((item) => item.id === auth?.id);
      if (!seat) return;
      seat.heroId = heroId;
      this.push();
    });

    this.onMessage("shadow", (client, raw: unknown) => {
      const color = this.shadowOf(typeof raw === "object" && raw && "color" in raw ? (raw as { color?: unknown }).color : "");
      if (!color) return;
      const auth = this.sessions.get(client.sessionId);
      const seat = this.seats.find((item) => item.id === auth?.id);
      if (!seat) return;
      seat.shadowColor = color;
      this.push();
    });

    this.onMessage("start", (client) => {
      if (!this.isHost(client)) return;
      void this.start();
    });

    this.onMessage("chat", (client, raw: unknown) => {
      const seat = this.sessions.get(client.sessionId);
      if (!seat) return;
      const text = chatText(raw);
      if (text && chatCommand(text)) {
        if (!this.chat.admit(seat.id)) return;
        this.broadcast("chat", this.chat.post(seat.id, seat.name, seat.shadowColor ?? "#f3ecdf", "esse comando só vale na partida"));
        return;
      }
      const line = this.chat.push(seat.id, seat.name, seat.shadowColor ?? "#f3ecdf", raw);
      if (line) this.broadcast("chat", line);
    });
  }

  async onAuth(_client: Client, options: { token?: string }) {
    const user = verifyToken(options?.token ?? "");
    if (!user) throw new Error("Não autorizado");
    return user;
  }

  onJoin(client: Client, options: { shadowColor?: unknown }, auth?: { id: string; username: string }) {
    if (!auth) return;
    const shadowColor = this.shadowOf(options?.shadowColor);
    const seat = { id: auth.id, name: auth.username, heroId: this.heroIds[0] ?? "guerreiro", shadowColor };
    this.sessions.set(client.sessionId, seat);
    this.seats = this.seats.filter((item) => item.id !== auth.id);
    this.seats.push({ ...seat });
    this.maxClients = Math.max(this.config.slots, this.seats.length);
    this.push();
    client.send("chat", this.chat.lines());
  }

  onLeave(client: Client) {
    const next = forgetSession(this.sessions, this.seats, client.sessionId);
    if (next === this.seats) return;
    this.seats = next;
    this.push();
  }

  private isHost(client: Client) {
    return this.sessions.get(client.sessionId)?.id === this.seats[0]?.id;
  }

  private push() {
    for (const client of this.clients) {
      const youId = this.sessions.get(client.sessionId)?.id ?? "";
      const state: LobbyState = {
        hostId: this.seats[0]?.id ?? "",
        youId,
        players: this.seats.map((seat) => ({
          id: seat.id,
          name: seat.name,
          heroId: seat.heroId,
          shadowColor: seat.shadowColor,
        })),
        heroes: getGameData().heroes.map((hero) => ({
          id: hero.id,
          nome: hero.nome,
          descricao: hero.descricao,
          color: hero.color,
          hp: hero.hp,
          speed: hero.speed,
        })),
        config: this.config,
        error: this.error,
      };
      client.send("lobby", state);
    }
    this.setMetadata({
      host: this.seats[0]?.name ?? "",
      names: this.seats.map((seat) => seat.name),
      slots: this.config.slots,
    });
  }

  private async start() {
    const humans = this.seats;
    let slots = this.config.slots;
    if (!this.config.fillWithBots) slots = humans.length;
    slots = Math.max(slots, humans.length);
    slots = Math.min(8, slots);
    if (slots < 2) {
      this.error = "Precisa de 2 lutadores. Chama alguém ou liga os bots.";
      this.push();
      return;
    }
    const bots = [];
    for (let i = humans.length; i < slots; i += 1) {
      bots.push({ id: `bot-${i}-${Math.floor(Math.random() * 9999)}`, name: BOT_NAMES[i % BOT_NAMES.length] ?? `Bot ${i}` });
    }
    try {
      const room = await matchMaker.createRoom("match", {
        humans: humans.map((seat) => ({ id: seat.id, name: seat.name, heroId: seat.heroId, shadowColor: seat.shadowColor })),
        bots,
        hostId: humans[0]?.id ?? "",
        config: { lives: this.config.lives, cardsPerLevelUp: this.config.cardsPerLevelUp },
        seed: Math.floor(Math.random() * 1_000_000_000),
      });
      this.error = null;
      this.broadcast("go", { roomId: room.roomId });
      await this.lock();
    } catch (error) {
      console.error("start", error);
      this.error = error instanceof Error ? error.message : "Não deu pra abrir a partida.";
      this.push();
    }
  }

  private shadowOf(raw: unknown) {
    const wanted = typeof raw === "string" ? raw.toLowerCase() : "";
    return this.shadowColors.find((color) => color.toLowerCase() === wanted);
  }
}

export function forgetSession<T extends { id: string }>(sessions: Map<string, T>, seats: T[], sessionId: string): T[] {
  const auth = sessions.get(sessionId);
  sessions.delete(sessionId);
  if (!auth) return seats;
  for (const seat of sessions.values()) {
    if (seat.id === auth.id) return seats;
  }
  return seats.filter((seat) => seat.id !== auth.id);
}

function strip(input: { slots?: number; fillWithBots?: boolean; lives?: number; cardsPerLevelUp?: number }): Partial<LobbyConfig> {
  return {
    ...(input.slots !== undefined ? { slots: input.slots } : {}),
    ...(input.fillWithBots !== undefined ? { fillWithBots: input.fillWithBots } : {}),
    ...(input.lives !== undefined ? { lives: input.lives } : {}),
    ...(input.cardsPerLevelUp !== undefined ? { cardsPerLevelUp: input.cardsPerLevelUp } : {}),
  };
}
