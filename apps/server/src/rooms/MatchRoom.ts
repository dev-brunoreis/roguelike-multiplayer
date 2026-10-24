import type { ClientInput, ShopAction } from "@game/shared";
import {
  buildSnapshot,
  createMatch,
  pickCard,
  placeBet,
  setInput,
  shopAct,
  surrender,
  tick,
  type Match,
} from "@game/sim";
import { Client, Room } from "colyseus";
import { randomUUID } from "node:crypto";
import { verifyToken } from "../auth.js";
import { StatsWriter } from "../stats.js";

interface Seat {
  id: string;
  name: string;
  heroId?: string;
}

interface JoinOptions {
  token?: string;
}

export class MatchRoom extends Room {
  private match!: Match;
  private stats!: StatsWriter;
  private roster = new Set<string>();
  private users = new Map<string, string>();
  private leaveTimers = new Map<string, NodeJS.Timeout>();
  private finished = false;

  onCreate(options: {
    humans: Seat[];
    bots: Seat[];
    config?: { lives?: number; cardsPerLevelUp?: number };
    seed?: number;
  }) {
    this.autoDispose = false;
    const humans = options.humans ?? [];
    const bots = options.bots ?? [];
    for (const human of humans) this.roster.add(human.id);
    this.match = createMatch({
      seed: options.seed,
      config: options.config,
      players: [
        ...humans.map((seat) => ({ id: seat.id, name: seat.name, isBot: false, heroId: seat.heroId })),
        ...bots.map((seat) => ({ id: seat.id, name: seat.name, isBot: true })),
      ],
    });
    this.stats = new StatsWriter(randomUUID());
    this.safe(() => {
      this.stats.start(this.match);
      this.stats.write(this.match.events);
    });
    const stepMs = 1000 / this.match.config.tickRate;
    this.clock.setInterval(() => {
      const events = this.tickSafe();
      this.safe(() => this.stats.write(events));
      if (this.match.phase === "ended" && !this.finished) {
        this.finished = true;
        this.safe(() => this.stats.finish(this.match));
      }
    }, stepMs);
    this.clock.setInterval(() => this.broadcastSnap(), 100);
    this.onMessage("input", (client, message: ClientInput) => {
      const id = this.users.get(client.sessionId);
      if (!id || !Number.isFinite(message?.x) || !Number.isFinite(message?.y)) return;
      setInput(this.match, id, message.x, message.y);
    });
    this.onMessage("pick", (client, message: { cardId?: string }) => {
      const id = this.users.get(client.sessionId);
      if (!id || !message?.cardId) return;
      pickCard(this.match, id, message.cardId);
    });
    this.onMessage("shop", (client, message: ShopAction) => {
      const id = this.users.get(client.sessionId);
      if (!id || !message?.kind) return;
      shopAct(this.match, id, message);
    });
    this.onMessage("bet", (client, message: { targetId?: string; amount?: number }) => {
      const id = this.users.get(client.sessionId);
      if (!id || !message?.targetId || !Number.isFinite(message.amount)) return;
      placeBet(this.match, id, message.targetId, message.amount ?? 0);
    });
    this.onMessage("ping", (client, sent: number) => {
      if (typeof sent !== "number" || !Number.isFinite(sent)) return;
      client.send("pong", sent);
    });
    this.onMessage("surrender", (client) => {
      const id = this.users.get(client.sessionId);
      if (!id) return;
      surrender(this.match, id);
    });
  }

  async onAuth(_client: Client, options: JoinOptions) {
    const user = verifyToken(options?.token ?? "");
    if (!user) throw new Error("Não autorizado");
    if (!this.roster.has(user.id)) throw new Error("Você não está nesta partida");
    return user;
  }

  onJoin(client: Client, _options: unknown, auth?: { id: string; username: string }) {
    if (!auth) return;
    const pending = this.leaveTimers.get(auth.id);
    if (pending) {
      clearTimeout(pending);
      this.leaveTimers.delete(auth.id);
    }
    this.users.set(client.sessionId, auth.id);
    client.send("snapshot", buildSnapshot(this.match, auth.id));
  }

  onLeave(client: Client) {
    const userId = this.users.get(client.sessionId);
    this.users.delete(client.sessionId);
    if (!userId || this.match.phase === "ended") {
      this.maybeClose();
      return;
    }
    const stillHere = [...this.users.values()].includes(userId);
    if (stillHere) return;
    const timer = setTimeout(() => {
      this.leaveTimers.delete(userId);
      surrender(this.match, userId);
      this.maybeClose();
    }, 8000);
    this.leaveTimers.set(userId, timer);
  }

  private broadcastSnap() {
    for (const client of this.clients) {
      const id = this.users.get(client.sessionId);
      if (!id) continue;
      client.send("snapshot", buildSnapshot(this.match, id));
    }
    this.match.floats = [];
    this.maybeClose();
  }

  private maybeClose() {
    if (this.clients.length === 0 && this.match.phase === "ended") this.disconnect();
  }

  private tickSafe() {
    try {
      return tick(this.match);
    } catch (error) {
      console.error("tick", error);
      return [];
    }
  }

  private safe(fn: () => void) {
    try {
      fn();
    } catch (error) {
      console.error("stats", error);
    }
  }
}

