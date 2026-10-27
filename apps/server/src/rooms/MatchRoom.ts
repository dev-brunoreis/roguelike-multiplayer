import {
  betSchema,
  clientInputSchema,
  pauseSchema,
  pickSchema,
  shopActionSchema,
  watchSchema,
  type WireSnapshot,
} from "@game/shared";
import {
  buildCommon,
  buildMeta,
  buildWire,
  createMatch,
  interestArenaIds,
  isPersist,
  pickCard,
  placeBet,
  setInput,
  setPauseWant,
  shopAct,
  surrender,
  tick,
  withYou,
  type Match,
  type PersistEvent,
} from "@game/sim";
import { Client, Room } from "colyseus";
import { randomUUID } from "node:crypto";
import { verifyToken } from "../auth.js";
import { chatCommand, chatText, RoomChat } from "../chat.js";
import { runMatchCommand } from "../matchCommands.js";
import { StatsWriter } from "../stats.js";

interface Seat {
  id: string;
  name: string;
  heroId?: string;
  shadowColor?: string;
}

interface JoinOptions {
  token?: string;
}

function p95(samples: number[]) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

export class MatchRoom extends Room {
  private match!: Match;
  private stats!: StatsWriter;
  private hostId = "";
  private roster = new Set<string>();
  private users = new Map<string, string>();
  private watch = new Map<string, string>();
  private leaveTimers = new Map<string, NodeJS.Timeout>();
  private finished = false;
  private chat = new RoomChat();
  private pending: PersistEvent[] = [];
  private flushing = false;
  private acc = 0;
  private snapAcc = 0;
  private last = Date.now();
  private tickSamples: number[] = [];
  private sendSamples: number[] = [];
  private statsMs = 0;
  private perfAt = Date.now();
  private metaKey = "";
  private metaSeq = 0;
  private metaCache: ReturnType<typeof buildMeta> | null = null;

  onCreate(options: {
    humans: Seat[];
    bots: Seat[];
    hostId?: string;
    config?: { lives?: number; cardsPerLevelUp?: number; mode?: "arena" | "masmorra" | "abismo" };
    seed?: number;
  }) {
    this.autoDispose = false;
    const humans = options.humans ?? [];
    const bots = options.bots ?? [];
    this.hostId = options.hostId || humans[0]?.id || "";
    for (const human of humans) this.roster.add(human.id);
    this.match = createMatch({
      seed: options.seed,
      mode: options.config?.mode ?? "arena",
      config: {
        ...(options.config?.lives != null ? { lives: options.config.lives } : {}),
        ...(options.config?.cardsPerLevelUp != null ? { cardsPerLevelUp: options.config.cardsPerLevelUp } : {}),
      },
      players: [
        ...humans.map((seat) => ({ id: seat.id, name: seat.name, isBot: false, heroId: seat.heroId, shadowColor: seat.shadowColor })),
        ...bots.map((seat) => ({ id: seat.id, name: seat.name, isBot: true })),
      ],
    });
    this.stats = new StatsWriter(randomUUID());
    this.safe(() => this.stats.start(this.match));
    this.noteEvents(this.match.events.filter(isPersist));
    const step = 1000 / this.match.config.tickRate;
    this.clock.setInterval(() => this.loop(step), 50);
    this.onMessage("input", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const message = clientInputSchema.safeParse(raw);
      if (!id || !message.success) return;
      setInput(this.match, id, message.data.x, message.data.y, message.data.aimX, message.data.aimY);
    });
    this.onMessage("pick", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const message = pickSchema.safeParse(raw);
      if (!id || !message.success) return;
      pickCard(this.match, id, message.data.cardId);
    });
    this.onMessage("shop", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const message = shopActionSchema.safeParse(raw);
      if (!id || !message.success) return;
      shopAct(this.match, id, message.data);
    });
    this.onMessage("bet", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const message = betSchema.safeParse(raw);
      if (!id || !message.success) return;
      placeBet(this.match, id, message.data.targetId, message.data.amount);
    });
    this.onMessage("ping", (client, sent: unknown) => {
      if (typeof sent !== "number" || !Number.isFinite(sent)) return;
      client.send("pong", sent);
    });
    this.onMessage("pause", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const message = pauseSchema.safeParse(raw);
      if (!id || !message.success) return;
      setPauseWant(this.match, id, message.data.want);
    });
    this.onMessage("watch", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const message = watchSchema.safeParse(raw);
      if (!id || !message.success) return;
      if (!this.match.players.some((player) => player.id === message.data.playerId)) return;
      this.watch.set(id, message.data.playerId);
    });
    this.onMessage("surrender", (client) => {
      const id = this.users.get(client.sessionId);
      if (!id) return;
      surrender(this.match, id);
    });
    this.onMessage("chat", (client, raw: unknown) => {
      const id = this.users.get(client.sessionId);
      const player = id ? this.match.players.find((item) => item.id === id) : undefined;
      if (!player || player.isBot) return;
      const text = chatText(raw);
      const command = text ? chatCommand(text) : null;
      if (command) {
        if (!this.chat.admit(player.id)) return;
        const allowed = process.env.CAOS_DEV === "1" || player.id === this.hostId;
        const reply = allowed ? runMatchCommand(this.match, player.id, command) : "só o host pode";
        if (this.finished && this.match.phase !== "ended") this.finished = false;
        this.broadcast("chat", this.chat.post(player.id, player.name, player.color, reply));
        return;
      }
      const line = this.chat.push(player.id, player.name, player.color, raw);
      if (line) this.broadcast("chat", line);
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
    client.send("chat", this.chat.lines());
    client.send("meta", this.currentMeta());
    client.send("snapshot", buildWire(this.match, auth.id, this.watch.get(auth.id) ?? auth.id));
  }

  onLeave(client: Client) {
    const userId = this.users.get(client.sessionId);
    this.users.delete(client.sessionId);
    if (userId) this.watch.delete(userId);
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

  private loop(step: number) {
    const now = Date.now();
    const elapsed = now - this.last;
    this.last = now;
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= step && steps < 4) {
      const started = performance.now();
      const events = this.tickSafe();
      this.tickSamples.push(performance.now() - started);
      this.acc -= step;
      steps += 1;
      this.noteEvents(events);
      if (this.match.phase === "ended") break;
    }
    if (this.acc > step * 4) this.acc = step;
    this.snapAcc += elapsed;
    if (this.snapAcc >= 100) {
      this.snapAcc = 0;
      const started = performance.now();
      this.broadcastSnap();
      this.sendSamples.push(performance.now() - started);
    }
    if (process.env.CAOS_PERF === "1" && now - this.perfAt >= 10_000) {
      console.log(`[perf] tick p95 ${p95(this.tickSamples).toFixed(2)}ms · send p95 ${p95(this.sendSamples).toFixed(2)}ms · sqlite ${this.statsMs.toFixed(1)}ms`);
      this.tickSamples = [];
      this.sendSamples = [];
      this.statsMs = 0;
      this.perfAt = now;
    }
  }

  private currentMeta() {
    const key = `${this.match.arenas.map((arena) => arena.id).join("|")}#${this.match.players.map((player) => player.id).join("|")}`;
    if (key !== this.metaKey || !this.metaCache) {
      this.metaKey = key;
      this.metaSeq += 1;
      this.metaCache = buildMeta(this.match, this.metaSeq);
    }
    return this.metaCache;
  }

  private broadcastSnap() {
    const key = `${this.match.arenas.map((arena) => arena.id).join("|")}#${this.match.players.map((player) => player.id).join("|")}`;
    const changed = key !== this.metaKey;
    const meta = this.currentMeta();
    if (changed) this.broadcast("meta", meta);
    const commons = new Map<string, WireSnapshot>();
    for (const client of this.clients) {
      const id = this.users.get(client.sessionId);
      if (!id) continue;
      const watch = this.watch.get(id) ?? id;
      const arenas = [...interestArenaIds(this.match, watch)].sort().join(",");
      let common = commons.get(arenas);
      if (!common) {
        common = buildCommon(this.match, watch);
        commons.set(arenas, common);
      }
      client.send("snapshot", withYou(common, this.match, id));
    }
    this.match.floats = [];
    this.maybeClose();
  }

  private noteEvents(events: PersistEvent[]) {
    if (events.length === 0 && !(this.match.phase === "ended" && !this.finished)) return;
    this.pending.push(...events);
    if (this.flushing) return;
    this.flushing = true;
    setImmediate(() => {
      this.flushing = false;
      const batch = this.pending.splice(0);
      const started = performance.now();
      if (batch.length > 0) this.safe(() => this.stats.write(batch));
      if (this.match.phase === "ended" && !this.finished) {
        this.finished = true;
        this.safe(() => this.stats.finish(this.match));
      }
      this.statsMs += performance.now() - started;
      if (this.pending.length > 0) this.noteEvents([]);
    });
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
