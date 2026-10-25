import type { LabVisual } from "@game/shared";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actorLook, applyActors } from "../game/actors.js";
import { drawnBoxes, watchDrawn } from "../game/drawn.js";
import { Scene } from "../game/Scene.js";
import { isTypingTarget } from "../game/input.js";
import { setPoseLock } from "../game/pose.js";
import type { ClipName } from "../game/sprites.js";
import { applyVfx, vfxIds } from "../game/vfx.js";
import { Catalog } from "./Catalog.js";
import { Editor } from "./Editor.js";
import { composeStrip, waitFrames } from "./filmstrip.js";
import { entryPath, setIn } from "./files.js";
import { LabOverlay, type LabMark } from "./LabOverlay.js";
import { formatSel, parseSel, selectionFile, type LabSel } from "./select.js";
import { useLabData } from "./useLabData.js";
import { useLabSim } from "./useLabSim.js";

const CLIPS = ["idle", "run", "attack", "hit", "death"] as const;

function query() {
  const params = new URLSearchParams(window.location.search);
  return {
    sel: parseSel(params.get("sel")),
    level: Math.max(1, Number(params.get("level") ?? 1) || 1),
    speed: Math.min(2, Math.max(0.1, Number(params.get("speed") ?? 1) || 1)),
    paused: params.get("paused") === "1",
    overlay: params.get("overlay") !== "0",
    t: params.get("t"),
    strip: Math.max(0, Number(params.get("strip") ?? 0) || 0),
    zoom: Math.max(8, Number(params.get("zoom") ?? 26) || 26),
    phase: Math.max(0, Number(params.get("phase") ?? 0) || 0),
  };
}

function writeQuery(patch: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) params.set(key, value);
  window.history.replaceState(null, "", `/lab?${params.toString()}`);
}

function LabTicker({ onFrame }: { onFrame: (dt: number) => void }) {
  const ref = useRef(onFrame);
  ref.current = onFrame;
  useFrame((_, dt) => ref.current(dt), -2);
  return null;
}

async function postShot(name: string, png: string) {
  const res = await fetch("/__lab/shot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, png }),
  });
  if (!res.ok) throw new Error(await res.text());
  return name;
}

export function LabScreen() {
  const start = useRef(query());
  const data = useLabData();
  const [sel, setSel] = useState<LabSel>(start.current.sel);
  const [level, setLevel] = useState(start.current.level);
  const [speed, setSpeed] = useState(start.current.speed);
  const [paused, setPaused] = useState(start.current.paused || start.current.strip > 0);
  const [overlay, setOverlay] = useState(start.current.overlay);
  const [zoom, setZoom] = useState(start.current.zoom);
  const [phase, setPhase] = useState(start.current.phase);
  const [loop, setLoop] = useState(false);
  const [clip, setClip] = useState<ClipName | "death" | "">("");
  const [frame, setFrame] = useState(0);
  const [scrub, setScrub] = useState(start.current.t != null);
  const [time, setTime] = useState(Number(start.current.t ?? 0) || 0);
  const [notice, setNotice] = useState("");
  const [stripUrl, setStripUrl] = useState("");
  const seed = 1;
  const layout = data.visual.lab;
  const stamp = useMemo(() => JSON.stringify({
    heroes: data.drafts["heroes.json"],
    abilities: data.drafts["abilities.json"],
    creeps: data.drafts["creeps.json"],
    match: data.drafts["match.json"],
    lab: data.drafts["visual/lab.json"],
  }), [data.drafts, data.game]);
  const sim = useLabSim({
    data: data.game,
    layout,
    sel,
    level,
    phase,
    speed,
    paused: paused || scrub,
    loop,
    seed,
    stamp,
  });
  const seekRef = useRef(sim.seek);
  const castRef = useRef(sim.cast);
  const snapRef = sim.snapRef;
  seekRef.current = sim.seek;
  castRef.current = sim.cast;

  useEffect(() => {
    watchDrawn(true);
    return () => watchDrawn(false);
  }, []);

  useEffect(() => {
    if (data.visual.vfx) applyVfx(data.visual.vfx);
    if (data.visual.actors) applyActors(data.visual.actors);
  }, [data.visual.vfx, data.visual.actors]);

  useEffect(() => {
    writeQuery({
      sel: formatSel(sel),
      level: String(level),
      speed: String(speed),
      paused: paused ? "1" : "0",
      overlay: overlay ? "1" : "0",
      zoom: String(zoom),
      phase: String(phase),
    });
  }, [sel, level, speed, paused, overlay, zoom, phase]);

  const pick = useCallback((next: LabSel) => {
    setSel(next);
    setLevel(1);
    setPhase(0);
    setClip("");
    setPoseLock(null);
  }, []);

  const viewId = sel.kind === "hero" || sel.kind === "creep" || sel.kind === "boss"
    ? sel.id
    : data.game?.heroes[0]?.id ?? "";
  const kind = sel.kind === "boss" ? "boss" : sel.kind === "hero" ? "hero" : "creep";

  useEffect(() => {
    if (!clip) {
      setPoseLock(null);
      return;
    }
    setPoseLock({ entityId: null, clip, frame: scrub ? frame : null, fps: null });
  }, [clip, frame, scrub]);

  const ability = data.game?.byId.abilities.get(
    sel.kind === "ability" ? sel.id : sel.kind === "hero" ? data.game.byId.heroes.get(sel.id)?.startingAbility ?? "" : "",
  );
  const maxLevel = ability?.levels.length ?? 1;
  const creep = sel.kind === "creep" || sel.kind === "boss" ? data.game?.byId.creeps.get(sel.id) : undefined;
  const phases = creep?.phases ?? [];
  const preview = layout?.previewSeconds ?? 2.4;

  const marks = useMemo<LabMark[]>(() => {
    if (!layout) return [];
    const list: LabMark[] = [];
    const levelDef = ability?.levels[Math.min(maxLevel, level) - 1];
    if (levelDef) {
      list.push({ x: layout.caster.x, y: layout.caster.y, radius: levelDef.range, color: "#f4efe4" });
      if (levelDef.radius) {
        const at = layout.dummies[1] ?? layout.creep;
        list.push({ x: at.x, y: at.y, radius: levelDef.radius, color: "#e07a3d" });
      }
    }
    return list;
  }, [ability, layout, level, maxLevel]);

  const file = selectionFile(sel);
  const issues = useMemo(() => {
    const all = data.fileIssues(file);
    const path = entryPath(sel, data.drafts[file]);
    const prefix = path && path.length > 0 ? path.join(".") : "";
    if (!prefix) return all;
    return all
      .filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`))
      .map((issue) => ({ ...issue, path: issue.path.slice(prefix.length + 1) }));
  }, [data, file, sel]);

  const lists = useMemo(() => ({
    vfx: data.visual.vfx?.defs.map((item) => item.id) ?? vfxIds(),
    creepId: data.game?.creeps.map((item) => item.id) ?? [],
    abilityId: data.game?.abilities.map((item) => item.id) ?? [],
    startingAbility: data.game?.abilities.map((item) => item.id) ?? [],
    id: [],
  }), [data.game, data.visual.vfx]);

  const shot = useCallback(async (name: string) => {
    const source = stripUrl || document.querySelector("canvas")?.toDataURL("image/png") || "";
    if (!source) throw new Error("sem imagem");
    await postShot(name, source);
    return name;
  }, [stripUrl]);

  const api = useRef({
    select: pick,
    set: (path: string, value: unknown) => {
      const jsonAt = path.indexOf(".json");
      if (jsonAt >= 0) {
        const target = path.slice(0, jsonAt + 5);
        const rest = path.slice(jsonAt + 5).split("/").filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
        const current = data.drafts[target];
        data.update(target, rest.length === 0 ? value : setIn(current, rest, value));
        return;
      }
      const base = entryPath(sel, data.drafts[file]) ?? [];
      const rest = path.split(".").filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
      data.update(file, setIn(data.drafts[file], [...base, ...rest], value));
    },
    cast: () => castRef.current(),
    seek: (t: number) => {
      setScrub(true);
      setTime(t);
      seekRef.current(t);
    },
    shot,
    measure: () => {
      const snap = snapRef.current;
      const drawn = drawnBoxes();
      return {
        tick: snap?.tick ?? 0,
        time: snap ? snap.tick / 20 : 0,
        entities: (snap?.entities ?? []).map((entity) => {
          const look = actorLook(entity.view, entity.kind);
          const box = drawn.find((item) => item.kind === "entity" && item.id === entity.id) ?? null;
          return {
            id: entity.id,
            view: entity.view,
            kind: entity.kind,
            x: entity.x,
            y: entity.y,
            radius: entity.radius,
            attackRange: entity.attackRange,
            bodyMul: look.bodyMul,
            drawnWide: box?.wide ?? null,
            drawnTall: box?.tall ?? null,
          };
        }),
        zones: (snap?.zones ?? []).map((zone) => ({ id: zone.id, x: zone.x, y: zone.y, radius: zone.radius, vfx: zone.vfx })),
        projectiles: (snap?.projectiles ?? []).map((shotItem) => ({ id: shotItem.id, x: shotItem.x, y: shotItem.y, vfx: shotItem.vfx, abilityId: shotItem.abilityId })),
        vfx: drawn.filter((item) => item.kind === "vfx"),
      };
    },
  });
  api.current.select = pick;
  api.current.shot = shot;
  api.current.set = (path: string, value: unknown) => {
    const jsonAt = path.indexOf(".json");
    if (jsonAt >= 0) {
      const target = path.slice(0, jsonAt + 5);
      const rest = path.slice(jsonAt + 5).split("/").filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
      const current = data.drafts[target];
      data.update(target, rest.length === 0 ? value : setIn(current, rest, value));
      return;
    }
    const base = entryPath(sel, data.drafts[file]) ?? [];
    const rest = path.split(".").filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
    data.update(file, setIn(data.drafts[file], [...base, ...rest], value));
  };

  useEffect(() => {
    window.__lab = {
      select: (next) => api.current.select(parseSel(next)),
      set: (path, value) => api.current.set(path, value),
      cast: () => api.current.cast(),
      seek: (t) => api.current.seek(t),
      shot: (name) => api.current.shot(name),
      measure: () => api.current.measure(),
    };
    return () => {
      delete window.__lab;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void data.save().then((errors) => setNotice(errors.length ? errors.join(" ") : "Salvo"));
      }
      if (event.code === "Space") {
        event.preventDefault();
        castRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data]);

  useEffect(() => {
    const count = start.current.strip;
    if (!count || !layout || !data.game) return;
    let cancel = false;
    void (async () => {
      const frames: string[] = [];
      const end = Number(start.current.t ?? layout.previewSeconds);
      for (let i = 0; i < count; i += 1) {
        if (cancel) return;
        const at = count === 1 ? end : (end * i) / (count - 1);
        seekRef.current(at);
        await waitFrames(3);
        const canvas = document.querySelector("canvas");
        if (canvas) frames.push(canvas.toDataURL("image/png"));
      }
      if (cancel) return;
      const grid = await composeStrip(frames);
      setStripUrl(grid);
      await postShot(`strip-${formatSel(sel).replace(/[:/]/g, "-")}`, grid);
    })();
    return () => {
      cancel = true;
    };
  }, [layout, data.game, sel, level]);

  const view = { x: 0, z: 0, zoom };
  const fallbackLayout: LabVisual = layout ?? {
    arenaSize: 22,
    caster: { x: 0, y: 0 },
    dummies: [{ x: 2, y: 0 }],
    creep: { x: 2, y: 0 },
    previewSeconds: 2.4,
    dummyCreep: "slime",
    presets: [],
  };

  return (
    <main className="lab">
      <Catalog game={data.game} vfxIds={lists.vfx} sel={sel} dirty={data.dirty} onPick={pick} />
      <section className="lab-stage">
        <Scene snapRef={sim.snapRef} indexRef={sim.indexRef} watchId="you" shakeRef={sim.shakeRef} view={view} preserve>
          <LabTicker onFrame={sim.frame} />
          <LabOverlay snapRef={sim.snapRef} size={fallbackLayout.arenaSize} show={overlay} marks={marks} />
        </Scene>
        <div className="lab-bar">
          <button className="btn" onClick={() => setPaused((value) => !value)}>{paused ? "Seguir" : "Pausar"}</button>
          <button className="btn" onClick={() => { setPaused(true); sim.step(); }}>Passo</button>
          <button className="btn" onClick={() => { setScrub(false); setPaused(false); sim.restart(); }}>Reiniciar</button>
          <button className="btn primary" onClick={() => sim.cast()}>Lançar</button>
          <label className="lab-check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> loop</label>
          <label>vel <input type="range" min={0.1} max={2} step={0.1} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
          <label>zoom <input type="range" min={12} max={48} step={1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <label className="lab-check"><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} /> grade</label>
          {maxLevel > 1 ? (
            <label>nível
              <input type="range" min={1} max={maxLevel} step={1} value={Math.min(level, maxLevel)} onChange={(event) => setLevel(Number(event.target.value))} />
            </label>
          ) : null}
          <label>t
            <input
              type="range"
              min={0}
              max={preview}
              step={0.05}
              value={Math.min(time, preview)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setTime(next);
                setScrub(true);
                setPaused(true);
                sim.seek(next);
              }}
            />
          </label>
        </div>
        <div className="lab-bar">
          {CLIPS.map((name) => (
            <button key={name} className={clip === name ? "btn primary" : "btn"} onClick={() => setClip(name)}>{name}</button>
          ))}
          <button className="btn ghost" onClick={() => setClip("")}>soltar</button>
          <label>frame <input type="range" min={0} max={12} step={1} value={frame} onChange={(event) => { setFrame(Number(event.target.value)); setScrub(true); }} /></label>
          {clip && viewId ? (
            <label>fps
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={clip === "death" ? actorLook(viewId, kind).fps.hit : actorLook(viewId, kind).fps[clip]}
                onChange={(event) => {
                  const fps = Number(event.target.value);
                  const actors = data.drafts["visual/actors.json"] as { views?: Record<string, { fps?: Record<string, number> }> };
                  const views = actors.views ?? {};
                  const current = views[viewId] ?? {};
                  const nextFps = { ...(current.fps ?? {}), [clip === "death" ? "hit" : clip]: fps };
                  data.update("visual/actors.json", { ...actors, views: { ...views, [viewId]: { ...current, fps: nextFps } } });
                }}
              />
            </label>
          ) : null}
          {phases.map((item, index) => (
            <button key={item.hpBelow} className={phase === index ? "btn primary" : "btn"} onClick={() => { setPhase(index); sim.forcePhase(index); }}>
              fase {index + 1}
            </button>
          ))}
        </div>
        {notice || data.error || data.visual.vfxError || data.visual.labError ? (
          <p className="lab-toast">{notice || data.error || data.visual.vfxError || data.visual.labError}</p>
        ) : null}
        {data.conflicts.length > 0 ? (
          <p className="lab-toast">
            Disco mudou: {data.conflicts.join(", ")}
            <button className="btn ghost" onClick={() => data.conflicts.forEach((item) => data.revert(item))}>pegar do disco</button>
          </p>
        ) : null}
        {stripUrl ? <img className="lab-strip" src={stripUrl} alt="Filmstrip da cena" /> : null}
      </section>
      <Editor
        sel={sel}
        files={data.drafts}
        issues={issues}
        lists={lists}
        dirty={data.dirty.includes(file)}
        onChange={data.update}
        onRevert={data.revert}
      />
    </main>
  );
}

declare global {
  interface Window {
    __lab?: {
      select: (sel: string) => void;
      set: (path: string, value: unknown) => void;
      cast: () => boolean;
      seek: (t: number) => void;
      shot: (name: string) => Promise<string>;
      measure: () => unknown;
    };
  }
}
