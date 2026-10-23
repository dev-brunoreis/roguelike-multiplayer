import { getGameData } from "@game/game-data";
import type { LobbyConfig, LobbyState } from "@game/shared";
import { matchOptionsSchema } from "@game/shared";
import { Client, matchMaker, Room } from "colyseus";
import { verifyToken } from "../auth.js";

const BOT_NAMES = ["Bram", "Lira", "Kas", "Nox", "Vesper", "Ivo", "Sena"];

interface Seat {
  id: string;
  name: string;
}

export class LobbyRoom extends Room {
  private seats: Seat[] = [];
  private sessions = new Map<string, Seat>();
  private config: LobbyConfig;
  private error: string | null = null;

  constructor() {
    super();
    const data = getGameData();
    this.config = {
      slots: 4,
      fillWithBots: true,
      lives: data.match.lives,
      cardsPerLevelUp: data.match.cardsPerLevelUp,
    };
  }

  onCreate() {
    this.onMessage("config", (client, raw: unknown) => {
      if (!this.isHost(client)) return;
      const parsed = matchOptionsSchema.safeParse(raw);
      if (!parsed.success) return;
      this.config = { ...this.config, ...strip(parsed.data) };
      this.error = null;
      this.push();
    });

    this.onMessage("start", (client) => {
      if (!this.isHost(client)) return;
      void this.start();
    });
  }

  async onAuth(_client: Client, options: { token?: string }) {
    const user = verifyToken(options?.token ?? "");
    if (!user) throw new Error("Não autorizado");
    return user;
  }

  onJoin(client: Client, _options: unknown, auth?: { id: string; username: string }) {
    if (!auth) return;
    this.sessions.set(client.sessionId, { id: auth.id, name: auth.username });
    this.seats = this.seats.filter((seat) => seat.id !== auth.id);
    this.seats.push({ id: auth.id, name: auth.username });
    this.push();
  }

  onLeave(client: Client) {
    const auth = this.sessions.get(client.sessionId);
    this.sessions.delete(client.sessionId);
    if (!auth) return;
    this.seats = this.seats.filter((seat) => seat.id !== auth.id);
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
        players: this.seats.map((seat) => ({ id: seat.id, name: seat.name })),
        config: this.config,
        error: this.error,
      };
      client.send("lobby", state);
    }
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
        humans: humans.map((seat) => ({ id: seat.id, name: seat.name })),
        bots,
        config: { lives: this.config.lives, cardsPerLevelUp: this.config.cardsPerLevelUp },
        seed: Math.floor(Math.random() * 1_000_000_000),
      });
      this.error = null;
      this.broadcast("go", { roomId: room.roomId });
    } catch (error) {
      console.error("start", error);
      this.error = error instanceof Error ? error.message : "Não deu pra abrir a partida.";
      this.push();
    }
  }
}

function strip(input: { slots?: number; fillWithBots?: boolean; lives?: number; cardsPerLevelUp?: number }): Partial<LobbyConfig> {
  return {
    ...(input.slots !== undefined ? { slots: input.slots } : {}),
    ...(input.fillWithBots !== undefined ? { fillWithBots: input.fillWithBots } : {}),
    ...(input.lives !== undefined ? { lives: input.lives } : {}),
    ...(input.cardsPerLevelUp !== undefined ? { cardsPerLevelUp: input.cardsPerLevelUp } : {}),
  };
}
