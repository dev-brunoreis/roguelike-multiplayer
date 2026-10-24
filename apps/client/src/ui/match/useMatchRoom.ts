import { inflate, type MatchMeta, type WireSnapshot } from "@game/shared";
import type { ChatLine } from "@game/shared/protocol";
import { Client, type Room } from "colyseus.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyIndex, indexSnapshot, type SnapIndex } from "../../game/frame.js";
import { noteSnapshot, resetMotion, trackMotion } from "../../game/motion.js";
import { resetPoses } from "../../game/views.js";
import type { Snapshot } from "@game/shared/protocol";
import { hearWorld, resetHear, setMood, sfxCrit, sfxHurt, sfxImpact, sfxPick, sfxUi, sfxWarn, type Mood } from "../../audio.js";
import { serverReachable, wsBase } from "../../net.js";
import { matchStore } from "./store.js";

const CONSENTED = 4000;

function moodOf(phase: string, fighting: boolean, boss: boolean): Mood {
  if (phase === "ended") return "end";
  if (boss) return "boss";
  if (phase === "duel" && fighting) return "duel";
  if (phase === "pve" || phase === "dungeon") return "wild";
  return "calm";
}

export function useMatchRoom(token: string, roomId: string, onDown: () => void) {
  const roomRef = useRef<Room | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const indexRef = useRef<SnapIndex>(emptyIndex());
  const netRef = useRef({ ping: -1, arrivals: [] as number[] });
  const metaRef = useRef<MatchMeta | null>(null);
  const wireRef = useRef<WireSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const watchRef = useRef<string | null>(null);
  const hpRef = useRef<number | null>(null);
  const phaseRef = useRef<string | null>(null);
  const pauseRef = useRef(false);
  const pendingRef = useRef(0);
  const mePlace = useRef<{ x: number; y: number } | null>(null);
  const shakeRef = useRef(0);
  const warnRef = useRef(new Set<number>());
  const bossPhaseRef = useRef(0);
  const onChat = useRef<(incoming: ChatLine | ChatLine[]) => void>(() => {});

  const publish = () => {
    const meta = metaRef.current;
    const wire = wireRef.current;
    if (!meta || !wire) return;
    const view = inflate(meta, wire);
    const now = performance.now() / 1000;
    snapRef.current = view;
    indexRef.current = indexSnapshot(view);
    noteSnapshot(view.tick, meta.tickRate, now);
    for (const entity of view.entities) trackMotion(entity.id, entity.x, entity.y, view.tick, meta.tickRate);
    for (const shot of view.projectiles) trackMotion(shot.id, shot.x, shot.y, view.tick, meta.tickRate);
    for (const zone of view.zones) trackMotion(zone.id, zone.x, zone.y, view.tick, meta.tickRate);
    matchStore.set(view);
    const me = view.players.find((player) => player.id === view.youId);
    setMood(moodOf(view.phase, me?.inDuel === true, view.boss != null));
    const seen = warnRef.current;
    const nextWarn = new Set<number>();
    let freshWarn = false;
    for (const warning of view.warnings) {
      nextWarn.add(warning.id);
      if (!seen.has(warning.id)) freshWarn = true;
    }
    warnRef.current = nextWarn;
    if (freshWarn) sfxWarn();
    const bossPhase = view.boss?.phase ?? 0;
    if (bossPhaseRef.current && bossPhase && bossPhase !== bossPhaseRef.current) sfxImpact();
    bossPhaseRef.current = bossPhase;
    if (me) {
      const body = view.entities.find((entity) => entity.playerId === view.youId);
      hearWorld(view.fx, view.projectiles, body ? { x: body.x, y: body.y } : null);
      if (pendingRef.current > 0 && me.pending.length === 0) sfxPick();
      pendingRef.current = me.pending.length;
      if (phaseRef.current !== null && pauseRef.current !== view.paused && view.paused) sfxUi();
      pauseRef.current = view.paused;
      if (hpRef.current !== null && me.hp < hpRef.current) {
        sfxHurt();
        shakeRef.current = 1;
      }
      if (view.floats.some((item) => item.crit && (item.sourcePlayerId === view.youId || item.targetPlayerId === view.youId))) sfxCrit();
      hpRef.current = me.hp;
      const mine = body;
      const phaseChanged = phaseRef.current !== null && phaseRef.current !== view.phase;
      const jumped = mine && mePlace.current ? Math.hypot(mine.x - mePlace.current.x, mine.y - mePlace.current.y) > 14 : false;
      const cameBack = mine !== undefined && mePlace.current === null && phaseRef.current !== null;
      const followId = (!me.eliminated && (phaseChanged || jumped || cameBack) ? null : watchRef.current) ?? view.youId;
      const followAlive = view.entities.some((entity) => entity.playerId === followId);
      if (!me.eliminated && (phaseChanged || jumped || cameBack)) aim(null, view.youId);
      else if (me.lives <= 0 && !followAlive) {
        const next = nextWatch(view, followId);
        if (next !== followId) aim(next === view.youId ? null : next, view.youId);
      } else if (watchRef.current && watchRef.current !== view.youId && !followAlive) aim(null, view.youId);
      phaseRef.current = view.phase;
      mePlace.current = mine ? { x: mine.x, y: mine.y } : null;
    }
    setReady(true);
  };

  const aim = (id: string | null, you: string) => {
    watchRef.current = id;
    setWatchId(id);
    roomRef.current?.send("watch", { playerId: id ?? you });
  };

  useEffect(() => {
    const client = new Client(wsBase());
    let room: Room | null = null;
    let closed = false;
    resetMotion();
    resetPoses();
    client.joinById(roomId, { token }).then((joined) => {
      if (closed) {
        void joined.leave();
        return;
      }
      room = joined;
      roomRef.current = joined;
      joined.onMessage("meta", (meta: MatchMeta) => {
        metaRef.current = meta;
        publish();
      });
      joined.onMessage("snapshot", (wire: WireSnapshot) => {
        netRef.current.arrivals.push(performance.now());
        wireRef.current = wire;
        publish();
      });
      joined.onMessage("chat", (incoming: ChatLine | ChatLine[]) => onChat.current(incoming));
      joined.onMessage("pong", (sent: number) => {
        if (typeof sent !== "number") return;
        netRef.current.ping = performance.now() - sent;
      });
      joined.onLeave((code) => {
        if (closed || code === CONSENTED) return;
        closed = true;
        onDown();
      });
    }).catch(() => {
      if (closed) return;
      closed = true;
      onDown();
    });
    let misses = 0;
    const beat = window.setInterval(() => {
      void serverReachable(token).then((up) => {
        if (closed) return;
        misses = up ? 0 : misses + 1;
        if (misses >= 2) {
          closed = true;
          onDown();
        }
      });
    }, 2000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      closed = true;
      window.clearInterval(beat);
      window.removeEventListener("beforeunload", beforeUnload);
      resetHear();
      setMood("calm");
      resetMotion();
      resetPoses();
      void room?.leave();
    };
  }, [roomId, token, onDown]);

  const setWatch = useCallback((id: string | null) => {
    const you = matchStore.snap?.youId;
    if (you) aim(id, you);
    else {
      watchRef.current = id;
      setWatchId(id);
    }
  }, []);

  return { roomRef, snapRef, indexRef, netRef, shakeRef, ready, watchId, watchRef, setWatch, onChat };
}

function nextWatch(snap: Snapshot, fromId: string) {
  const start = Math.max(0, snap.players.findIndex((player) => player.id === fromId));
  for (let step = 1; step <= snap.players.length; step += 1) {
    const player = snap.players[(start + step) % snap.players.length];
    if (!player || player.eliminated) continue;
    if (snap.entities.some((entity) => entity.playerId === player.id)) return player.id;
  }
  return fromId;
}

export type MatchRoomApi = ReturnType<typeof useMatchRoom>;
