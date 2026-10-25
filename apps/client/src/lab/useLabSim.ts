import type { GameData } from "@game/game-data/build";
import type { LabVisual } from "@game/shared";
import { inflate } from "@game/shared";
import { buildMeta, buildWire, createMatch, runTicks, setInput, tick as tickMatch, type Match } from "@game/sim";
import { labCast, labForcePhase } from "@game/sim/lab";
import { useCallback, useEffect, useRef } from "react";
import { emptyIndex, indexSnapshot, type SnapIndex } from "../game/frame.js";
import { cameraMove, worldAim } from "../game/input.js";
import { noteSnapshot, resetMotion, setMotionDelay, trackMotion } from "../game/motion.js";
import type { Snapshot } from "@game/shared/protocol";
import { setVfxPreview } from "../game/vfx.js";
import type { LabSel } from "./select.js";
import { composeStage, type StagePose } from "./stage.js";

export function useLabSim({
  data,
  layout,
  sel,
  level,
  phase,
  speed,
  paused,
  loop,
  seed,
  stamp,
}: {
  data: GameData | null;
  layout: LabVisual | null;
  sel: LabSel;
  level: number;
  phase: number;
  speed: number;
  paused: boolean;
  loop: boolean;
  seed: number;
  stamp: string;
}) {
  const matchRef = useRef<Match | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const indexRef = useRef<SnapIndex>(emptyIndex());
  const shakeRef = useRef(0);
  const poseRef = useRef<StagePose | null>(null);
  const acc = useRef(0);
  const lastCast = useRef(0);
  const opts = useRef({ data, layout, sel, level, phase, speed, paused, loop, seed });
  opts.current = { data, layout, sel, level, phase, speed, paused, loop, seed };

  const publish = useCallback((match: Match) => {
    const wire = buildWire(match, "you");
    const view = inflate(buildMeta(match), wire);
    const current = opts.current;
    if (current.sel.kind === "vfx") {
      setVfxPreview([
        { id: current.sel.id, x: -1.6, y: 0, scale: 0.55 },
        { id: current.sel.id, x: 0.3, y: 0, scale: 1 },
        { id: current.sel.id, x: 2.6, y: 0, scale: 2 },
      ]);
    } else {
      setVfxPreview([]);
    }
    snapRef.current = view;
    indexRef.current = indexSnapshot(view);
    const now = performance.now() / 1000;
    const rate = match.config.tickRate;
    noteSnapshot(view.tick, rate, now);
    for (const entity of view.entities) trackMotion(entity.id, entity.x, entity.y, view.tick, rate);
    for (const shot of view.projectiles) trackMotion(shot.id, shot.x, shot.y, view.tick, rate);
    for (const zone of view.zones) trackMotion(zone.id, zone.x, zone.y, view.tick, rate);
  }, []);

  const fire = useCallback((match: Match) => {
    const pose = poseRef.current;
    const aim = worldAim();
    if (!pose?.casterId || !pose.spellId) return false;
    return labCast(match, pose.casterId, pose.spellId, {
      level: pose.level,
      aim: aim ?? undefined,
      skillIndex: 0,
    });
  }, []);

  const boot = useCallback((at: number) => {
    const current = opts.current;
    if (!current.data || !current.layout) return;
    const heroId = current.sel.kind === "hero" ? current.sel.id : current.data.heroes[0]?.id ?? "guerreiro";
    const match = createMatch({
      players: [{ id: "you", name: "Lab", isBot: false, heroId }],
      data: current.data,
      seed: current.seed,
      mode: "lab",
      config: { arenaSize: current.layout.arenaSize },
    });
    poseRef.current = composeStage(match, current.layout, current.sel, current.level, current.phase);
    if (poseRef.current) poseRef.current.level = current.level;
    const steps = Math.max(0, Math.round(at * match.config.tickRate));
    if (steps > 0) runTicks(match, steps);
    matchRef.current = match;
    acc.current = 0;
    lastCast.current = match.time;
    setMotionDelay(0);
    resetMotion();
    publish(match);
  }, [publish]);

  const key = `${sel.kind}:${"id" in sel ? sel.id : sel.file}:${level}:${phase}:${seed}:${stamp}`;
  useEffect(() => {
    boot(0);
  }, [boot, key]);

  const frame = useCallback((dt: number) => {
    const match = matchRef.current;
    const current = opts.current;
    if (!match) return;
    const aim = worldAim();
    const move = cameraMove();
    setInput(match, "you", move.x, move.y, aim?.x, aim?.y);
    if (!current.paused) {
      acc.current += dt * Math.max(0.1, current.speed);
      const step = 1 / match.config.tickRate;
      let guard = 0;
      while (acc.current >= step && guard < 6) {
        acc.current -= step;
        tickMatch(match);
        guard += 1;
        if (current.loop && match.time - lastCast.current >= 1.15) {
          lastCast.current = match.time;
          fire(match);
        }
      }
    }
    publish(match);
  }, [fire, publish]);

  const seek = useCallback((t: number) => boot(Math.max(0, t)), [boot]);
  const cast = useCallback(() => {
    const match = matchRef.current;
    if (!match) return false;
    const fired = fire(match);
    publish(match);
    return fired;
  }, [fire, publish]);
  const step = useCallback(() => {
    const match = matchRef.current;
    if (!match) return;
    tickMatch(match);
    publish(match);
  }, [publish]);
  const restart = useCallback(() => boot(0), [boot]);
  const forcePhase = useCallback((index: number) => {
    const match = matchRef.current;
    const pose = poseRef.current;
    if (!match || pose?.casterId == null) return;
    labForcePhase(match, pose.casterId, index);
    publish(match);
  }, [publish]);

  return { snapRef, indexRef, shakeRef, frame, seek, cast, step, restart, forcePhase, poseRef, matchRef };
}
