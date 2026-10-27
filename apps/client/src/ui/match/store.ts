import type { AnnounceSnap, BossSnap, PlayerSnap, Snapshot } from "@game/shared/protocol";

const PHASE: Record<string, string> = {
  hub: "Salão",
  pve: "Onda",
  betting: "Apostas",
  duel: "Duelo",
  shop: "Loja",
  dungeon: "Masmorra",
  ended: "Fim",
};

export interface PhaseSlice {
  phase: string;
  round: number;
  phaseTime: number;
  paused: boolean;
  asking: number;
  humans: number;
  label: string;
  duelAnnounce: number;
  duelCount: number;
}

export interface PendingSlice {
  cards: PlayerSnap["pending"];
  timer: number;
  show: boolean;
}

export interface HubSlice {
  show: boolean;
  phaseTime: number;
  duelCount: number;
  ready: boolean;
}

type Listener = () => void;

function idsOf(cards: { id: string }[]) {
  return cards.map((card) => card.id).join(",");
}

class MatchStore {
  snap: Snapshot | null = null;
  phase: PhaseSlice | null = null;
  board: PlayerSnap[] = [];
  me: PlayerSnap | null = null;
  pending: PendingSlice = { cards: [], timer: 0, show: false };
  log: string[] = [];
  announce: AnnounceSnap | null = null;
  boss: BossSnap | null = null;
  waveWait = false;
  ended = false;
  winnerName = "";
  spectate = false;
  youId = "";
  private listeners = new Set<Listener>();

  set(snap: Snapshot) {
    this.snap = snap;
    const me = snap.players.find((player) => player.id === snap.youId) ?? null;
    const humans = snap.players.filter((player) => !player.isBot && !player.eliminated);
    const asking = humans.filter((player) => player.pauseWant).length;
    const phase: PhaseSlice = {
      phase: snap.phase,
      round: snap.round,
      phaseTime: snap.phaseTime,
      paused: snap.paused,
      asking,
      humans: humans.length,
      label: snap.mode === "abismo" && snap.abyss
        ? snap.abyss.nome
        : snap.phase === "duel" && me && !me.inDuel && !me.eliminated ? "Onda" : (PHASE[snap.phase] ?? snap.phase),
      duelAnnounce: snap.duelAnnounce,
      duelCount: snap.duel.length,
    };
    this.youId = this.youId === snap.youId ? this.youId : snap.youId;
    this.phase = this.phase && this.phase.phase === phase.phase && this.phase.round === phase.round
      && Math.ceil(this.phase.phaseTime) === Math.ceil(phase.phaseTime)
      && this.phase.paused === phase.paused && this.phase.asking === phase.asking && this.phase.humans === phase.humans
      && Math.ceil(this.phase.duelAnnounce) === Math.ceil(phase.duelAnnounce)
      && this.phase.duelCount === phase.duelCount
      && this.phase.label === phase.label
      ? this.phase
      : phase;
    const board = [...snap.players].sort((a, b) => Number(b.eliminated || b.lives <= 0) - Number(a.eliminated || a.lives <= 0));
    this.board = sameBoard(this.board, board) ? this.board : board;
    this.me = samePlayer(this.me, me) ? this.me : me;
    const pending = {
      cards: me?.pending ?? [],
      timer: me?.cardTimer ?? 0,
      show: (me?.pending.length ?? 0) > 0,
    };
    this.pending = this.pending.show === pending.show && idsOf(this.pending.cards) === idsOf(pending.cards)
      && Math.ceil(this.pending.timer) === Math.ceil(pending.timer)
      ? this.pending
      : pending;
    this.log = this.log.join("\n") === snap.log.join("\n") ? this.log : snap.log;
    const announce = snap.announce;
    this.announce = this.announce && announce && this.announce.id === announce.id && this.announce.title === announce.title
      && Math.ceil(this.announce.left) === Math.ceil(announce.left)
      ? this.announce
      : announce;
    const boss = snap.boss;
    this.boss = this.boss && boss && this.boss.nome === boss.nome && this.boss.phase === boss.phase
      && Math.round(this.boss.hp) === Math.round(boss.hp) && this.boss.marks.join(",") === boss.marks.join(",")
      ? this.boss
      : boss;
    const waveWait = (snap.phase === "pve" || (snap.phase === "duel" && !!me && !me.inDuel)) && !!me?.waveClear && !me.eliminated;
    this.waveWait = this.waveWait === waveWait ? this.waveWait : waveWait;
    this.ended = snap.phase === "ended";
    this.winnerName = snap.winnerId ? (snap.players.find((player) => player.id === snap.winnerId)?.name ?? "") : "";
    this.spectate = !!me?.eliminated && snap.phase !== "ended";
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

function samePlayer(prev: PlayerSnap | null, next: PlayerSnap | null) {
  if (!prev || !next) return prev === next;
  if (prev.hp !== next.hp || prev.maxHp !== next.maxHp || prev.lives !== next.lives || prev.xp !== next.xp) return false;
  if (prev.ready !== next.ready || prev.pauseWant !== next.pauseWant || prev.godmode !== next.godmode) return false;
  if (prev.eliminated !== next.eliminated || prev.respawnIn !== next.respawnIn || prev.inDuel !== next.inDuel) return false;
  if (prev.downed !== next.downed || Math.round(prev.revive * 8) !== Math.round(next.revive * 8)) return false;
  if (prev.abilities.length !== next.abilities.length) return false;
  for (let i = 0; i < prev.abilities.length; i += 1) {
    if (prev.abilities[i]!.cooldown !== next.abilities[i]!.cooldown || prev.abilities[i]!.level !== next.abilities[i]!.level) return false;
  }
  return true;
}

function sameBoard(prev: PlayerSnap[], next: PlayerSnap[]) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (!samePlayer(prev[i] ?? null, next[i] ?? null) || prev[i]!.id !== next[i]!.id || prev[i]!.waveClear !== next[i]!.waveClear) return false;
  }
  return true;
}

export const matchStore = new MatchStore();

export function hubOf(snap: Snapshot | null, me: PlayerSnap | null): HubSlice {
  return {
    show: snap?.phase === "hub" && (snap.duelAnnounce ?? 0) <= 0 && !!me && !me.eliminated && me.pending.length === 0,
    phaseTime: snap?.phaseTime ?? 0,
    duelCount: snap?.duel.length ?? 0,
    ready: me?.ready ?? false,
  };
}
