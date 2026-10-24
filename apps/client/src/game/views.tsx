import type { EntitySnap, FloatEvent, Snapshot } from "@game/shared/protocol";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type ComponentType, type MutableRefObject } from "react";
import { RingGeometry, Sprite, SpriteMaterial, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { worldAim } from "./input.js";
import { motionAt } from "./motion.js";
import { loadActor, setSpriteFrame, type ActorSheet, type ClipName } from "./sprites.js";

export type ViewProps = { entity: EntitySnap };

const views = new Map<string, ComponentType<ViewProps>>();

export function registerEntityView(id: string, view: ComponentType<ViewProps>) {
  views.set(id, view);
}

export function resolveView(entity: EntitySnap) {
  return views.get(entity.view) ?? views.get(entity.kind) ?? views.get("default")!;
}

export function bodyHeight(entity: { radius: number; kind: string }) {
  return entity.radius * (entity.kind === "hero" ? 5.8 : entity.kind === "boss" ? 4.8 : 5.1);
}

interface Pose {
  view: string;
  x: number;
  y: number;
  flip: number;
  tall: number;
}

interface Death {
  key: string;
  pose: Pose;
  born: number;
}

const poses = new Map<number, Pose>();

export function resetPoses() {
  poses.clear();
}

export function takeDeaths(alive: Set<number>, now: number): Death[] {
  const born: Death[] = [];
  for (const [id, pose] of poses) {
    if (alive.has(id)) continue;
    poses.delete(id);
    born.push({ key: `${id}:${now.toFixed(3)}`, pose, born: now });
  }
  return born;
}

export function EntityPuppet({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const group = useRef<Group>(null);
  const sprite = useRef<Sprite>(null);
  const shadow = useRef<Mesh>(null);
  const reachFill = useRef<Mesh>(null);
  const reachBand = useRef<Mesh>(null);
  const aimMark = useRef<Mesh>(null);
  const reachSpan = useRef(-1);
  const material = useRef<SpriteMaterial>(null);
  const actor = useRef<ActorSheet | null>(null);
  const tell = useRef<Mesh>(null);
  const anim = useRef({ clip: "idle" as ClipName, frame: 0, acc: 0, flip: 1, swing: -1, attack: 0, hit: 0, tell: 0, ready: false });
  const flash = useRef(0);
  const glow = useRef(0);
  const view = useRef(snapRef.current?.entities.find((item) => item.id === id)?.view ?? "slime");

  useEffect(() => {
    let live = true;
    void loadActor(view.current).then((sheet) => {
      if (!live) {
        sheet.texture.dispose();
        return;
      }
      actor.current = sheet;
      if (material.current) material.current.map = sheet.texture;
    });
    return () => {
      live = false;
      actor.current?.texture.dispose();
      actor.current = null;
    };
  }, [id]);

  useFrame((state, delta) => {
    const snap = snapRef.current;
    const entity = snap?.entities.find((item) => item.id === id);
    const root = group.current;
    const sheet = actor.current;
    if (!snap || !entity || !root || !sheet) {
      if (root) root.visible = false;
      return;
    }
    const placed = motionAt(id, state.clock.elapsedTime);
    if (!placed) return;
    root.visible = true;
    const prevX = root.position.x;
    const prevZ = root.position.z;
    root.position.set(placed.x, 0, placed.y);
    root.renderOrder = 500 + Math.round(placed.x + placed.y);

    const vx = placed.x - prevX;
    const vz = placed.y - prevZ;
    const speed = Math.hypot(vx, vz) / Math.max(delta, 0.0001);
    const moving = speed > 0.55 && speed < 24;
    const mine = entity.playerId != null && entity.playerId === snap.youId;
    const aim = mine ? worldAim() : null;
    const right = aim
      ? aim.x - placed.x - (aim.y - placed.y)
      : Math.cos(entity.facing) - Math.sin(entity.facing);
    if (Math.abs(right) > 0.0008) anim.current.flip = right > 0 ? 1 : -1;

    if (!anim.current.ready) {
      anim.current.swing = entity.swing;
      anim.current.ready = true;
    } else if (anim.current.swing !== entity.swing) {
      anim.current.swing = entity.swing;
      anim.current.attack = 0.36;
      anim.current.acc = 0;
      anim.current.frame = 0;
      anim.current.clip = "attack";
    }
    anim.current.attack = Math.max(0, anim.current.attack - delta);
    anim.current.hit = Math.max(0, anim.current.hit - delta);
    if (flash.current !== entity.flash) {
      flash.current = entity.flash;
      glow.current = 1;
      if (anim.current.attack <= 0) {
        anim.current.hit = 0.14;
        anim.current.acc = 0;
        anim.current.frame = 0;
        anim.current.clip = "hit";
      }
    }

    let clip: ClipName = "idle";
    if (anim.current.attack > 0) clip = "attack";
    else if (anim.current.hit > 0) clip = "hit";
    else if (moving) clip = "run";
    if (clip !== anim.current.clip) {
      anim.current.clip = clip;
      anim.current.frame = 0;
      anim.current.acc = 0;
    }
    const [start, count] = sheet.clips[clip];
    const fps = clip === "attack" ? 14 : clip === "run" ? 10 : clip === "hit" ? 12 : 6;
    const once = clip === "attack" || clip === "hit";
    anim.current.acc += delta * fps;
    anim.current.frame = once ? Math.min(count - 1, Math.floor(anim.current.acc)) : Math.floor(anim.current.acc) % count;
    setSpriteFrame(sheet.texture, start + anim.current.frame, sheet.frames, anim.current.flip);

    const tall = bodyHeight(entity);
    const wide = tall * sheet.aspect;
    const lunge = clip === "attack" ? anim.current.frame * 0.045 * anim.current.flip : 0;
    if (sprite.current) {
      sprite.current.visible = true;
      sprite.current.position.set(lunge, 0, 0);
      sprite.current.scale.set(wide, tall, 1);
      sprite.current.renderOrder = root.renderOrder;
    }
    if (shadow.current) {
      const show = entity.kind === "hero";
      shadow.current.visible = show;
      if (show) {
        shadow.current.scale.set(wide * 0.42, wide * 0.24, 1);
        (shadow.current.material as MeshBasicMaterial).color.set(entity.shadowColor || entity.color);
      }
    }
    const span = entity.attackRange;
    const arena = snap.arenas.find((item) => item.id === entity.arenaId);
    const fighting = arena != null && arena.kind !== "hub";
    const mark = mine && fighting && span > 0.05;
    const tint = entity.color;
    if (reachFill.current) {
      reachFill.current.visible = mark && mine;
      if (mark && mine) {
        reachFill.current.scale.set(span, span, 1);
        const fill = reachFill.current.material as MeshBasicMaterial;
        fill.color.set(tint);
        fill.opacity = 0.06;
      }
    }
    if (reachBand.current) {
      reachBand.current.visible = mark;
      if (mark) {
        if (Math.abs(reachSpan.current - span) > 0.04) {
          reachSpan.current = span;
          const thick = 0.07;
          reachBand.current.geometry.dispose();
          reachBand.current.geometry = new RingGeometry(Math.max(0.04, span - thick), span, 64);
        }
        const band = reachBand.current.material as MeshBasicMaterial;
        band.color.set(tint);
        band.opacity = 0.16;
      }
    }
    if (aimMark.current) {
      const show = mark && aim != null;
      aimMark.current.visible = show;
      if (show && aim) {
        let dx = aim.x - placed.x;
        let dz = aim.y - placed.y;
        const len = Math.hypot(dx, dz);
        if (len > span && len > 0.0001) {
          dx *= span / len;
          dz *= span / len;
        }
        aimMark.current.position.set(dx, 0.06, dz);
        const dot = aimMark.current.material as MeshBasicMaterial;
        dot.color.set(tint);
        dot.opacity = 0.9;
      }
    }
    const goal = entity.kind === "hero" ? 0 : entity.strike;
    if (goal <= 0) anim.current.tell = 0;
    else anim.current.tell += (goal - anim.current.tell) * Math.min(1, delta * 12);
    if (tell.current) {
      const shown = anim.current.tell;
      tell.current.visible = shown > 0.02;
      if (shown > 0.02) {
        const span = wide * (0.32 + shown * 0.3);
        tell.current.scale.set(span, span * 0.5, 1);
        const mat = tell.current.material as MeshBasicMaterial;
        mat.color.set("#ffc4bc");
        mat.opacity = 0.38 + shown * 0.42;
      }
    }
    poses.set(id, { view: entity.view, x: placed.x, y: placed.y, flip: anim.current.flip, tall });
    glow.current *= 0.78;
    if (material.current) {
      const lit = 1 + glow.current * 1.8;
      material.current.color.setRGB(lit, lit, lit);
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={shadow} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={1}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial color="#120e0c" transparent opacity={0.45} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh ref={reachFill} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} renderOrder={2}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial transparent opacity={0.09} depthWrite={false} />
      </mesh>
      <mesh ref={reachBand} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} renderOrder={3}>
        <meshBasicMaterial transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={aimMark} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} renderOrder={4}>
        <ringGeometry args={[0.1, 0.22, 16]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={tell} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={2}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial color="#ffc4bc" transparent opacity={0.55} depthWrite={false} depthTest={false} />
      </mesh>
      <sprite ref={sprite} center={[0.5, 0]} visible={false}>
        <spriteMaterial ref={material} transparent alphaTest={0.4} depthWrite={false} depthTest />
      </sprite>
    </group>
  );
}

export function DeathLayer({ snapRef }: { snapRef: MutableRefObject<Snapshot | null> }) {
  const [items, setItems] = useState<Death[]>([]);
  useFrame((state) => {
    const snap = snapRef.current;
    if (!snap) return;
    const born = takeDeaths(new Set(snap.entities.map((entity) => entity.id)), state.clock.elapsedTime);
    if (born.length === 0) return;
    setItems((prev) => [...prev, ...born].slice(-24));
  });
  return (
    <>
      {items.map((item) => (
        <DeathSprite key={item.key} item={item} onDone={(key) => setItems((prev) => prev.filter((entry) => entry.key !== key))} />
      ))}
    </>
  );
}

function DeathSprite({ item, onDone }: { item: Death; onDone: (key: string) => void }) {
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const actor = useRef<ActorSheet | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let live = true;
    void loadActor(item.pose.view).then((sheet) => {
      if (!live) {
        sheet.texture.dispose();
        return;
      }
      actor.current = sheet;
      if (material.current) material.current.map = sheet.texture;
      const [start] = sheet.clips.hit;
      setSpriteFrame(sheet.texture, start, sheet.frames, item.pose.flip);
    });
    return () => {
      live = false;
      actor.current?.texture.dispose();
    };
  }, [item.pose.view, item.pose.flip]);

  useFrame((state) => {
    const root = sprite.current;
    const sheet = actor.current;
    if (!root || !sheet) return;
    const t = (state.clock.elapsedTime - item.born) / 0.42;
    if (t >= 1) {
      root.visible = false;
      if (!done.current) {
        done.current = true;
        onDone(item.key);
      }
      return;
    }
    root.visible = true;
    root.position.set(item.pose.x, -t * 0.18, item.pose.y);
    const tall = item.pose.tall * (1 - t * 0.25);
    root.scale.set(tall * sheet.aspect, tall, 1);
    if (material.current) material.current.opacity = 1 - t;
  });

  return (
    <sprite ref={sprite} center={[0.5, 0]} visible={false} renderOrder={6}>
      <spriteMaterial ref={material} transparent opacity={1} depthWrite={false} />
    </sprite>
  );
}

export function HpLayer({ ids, snapRef }: { ids: number[]; snapRef: MutableRefObject<Snapshot | null> }) {
  return (
    <>
      {ids.map((id) => <HpBar key={id} id={id} snapRef={snapRef} />)}
    </>
  );
}

function HpBar({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const group = useRef<Group>(null);
  const bar = useRef<Sprite>(null);
  const fill = useRef<Sprite>(null);
  const tag = useRef<Group>(null);
  const labelRef = useRef("");
  const [label, setLabel] = useState("");
  const [yours, setYours] = useState(false);
  const [hero, setHero] = useState(false);
  const [ink, setInk] = useState("#f3ecdf");
  const inkRef = useRef("");

  useFrame((state) => {
    const entity = snapRef.current?.entities.find((item) => item.id === id);
    const root = group.current;
    if (!entity || !root || entity.hp <= 0 || entity.maxHp <= 0) {
      if (root) root.visible = false;
      return;
    }
    const placed = motionAt(id, state.clock.elapsedTime);
    if (!placed) return;
    root.visible = true;
    root.position.set(placed.x, 0, placed.y);
    const barY = bodyHeight(entity) + 0.42;
    const hp = Math.max(0.04, Math.min(1, entity.hp / entity.maxHp));
    if (bar.current) {
      bar.current.position.set(0, barY, 0);
      bar.current.scale.set(1.15, 0.16, 1);
      bar.current.center.set(0.5, 0.5);
    }
    if (fill.current) {
      fill.current.position.set(0, barY, 0);
      fill.current.scale.set(1.05 * hp, 0.1, 1);
      fill.current.center.set(0.5 / hp, 0.5);
      const mat = fill.current.material as SpriteMaterial;
      mat.color.set(entity.kind === "hero" ? "#8fdb67" : "#e23d3d");
    }
    if (tag.current) tag.current.position.set(0, barY + 0.22, 0);
    if (entity.label && entity.label !== labelRef.current) {
      labelRef.current = entity.label;
      setLabel(entity.label);
      setHero(entity.kind === "hero");
      setYours(entity.playerId === snapRef.current?.youId);
    }
    const nextInk = entity.kind === "hero" ? (entity.shadowColor || "#f3ecdf") : "#c9bfb2";
    if (nextInk !== inkRef.current) {
      inkRef.current = nextInk;
      setInk(nextInk);
    }
  });

  return (
    <group ref={group}>
      <sprite ref={bar} renderOrder={800}>
        <spriteMaterial color="#1a1010" depthTest={false} depthWrite={false} transparent opacity={0.95} />
      </sprite>
      <sprite ref={fill} renderOrder={801}>
        <spriteMaterial color="#8fdb67" depthTest={false} depthWrite={false} transparent />
      </sprite>
      <group ref={tag}>
        {label ? (
          <Html center sprite wrapperClass="float-anchor" zIndexRange={[3, 0]}>
            <span className={hero ? (yours ? "nametag mine" : "nametag") : "nametag creep"} style={{ color: ink }}>{label}</span>
          </Html>
        ) : null}
      </group>
    </group>
  );
}

const FLOAT_LIFE = 0.85;

interface LiveFloat extends FloatEvent {
  born: number;
  tone: "dealt" | "taken" | "other";
}

function toneOf(item: FloatEvent, youId: string): LiveFloat["tone"] {
  if (item.targetPlayerId === youId) return "taken";
  if (item.sourcePlayerId === youId) return "dealt";
  return "other";
}

export function FloatLayer({ snapRef }: { snapRef: MutableRefObject<Snapshot | null> }) {
  const seen = useRef(new Set<number>());
  const [items, setItems] = useState<LiveFloat[]>([]);

  useFrame((state) => {
    const snap = snapRef.current;
    if (!snap) return;
    const now = state.clock.elapsedTime;
    const fresh: LiveFloat[] = [];
    for (const item of snap.floats) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      fresh.push({ ...item, born: now, tone: toneOf(item, snap.youId) });
    }
    if (seen.current.size > 400) {
      const keep = new Set(snap.floats.map((item) => item.id));
      for (const id of seen.current) {
        if (!keep.has(id)) seen.current.delete(id);
      }
    }
    setItems((prev) => {
      const alive = prev.filter((item) => now - item.born < FLOAT_LIFE);
      if (fresh.length === 0 && alive.length === prev.length) return prev;
      return [...alive, ...fresh];
    });
  });

  return (
    <>
      {items.map((item) => {
        const jitter = ((item.id % 5) - 2) * 0.22;
        return (
          <Html
            key={item.id}
            position={[item.x + jitter, 2.4, item.y]}
            center
            sprite
            zIndexRange={[4, 0]}
            wrapperClass="float-anchor"
          >
            <span className={`dmg ${item.tone}${item.crit ? " crit" : ""}`}>
              {item.tone === "taken" ? `−${item.text}` : item.text}
              {item.crit ? <small className="tag">crítico</small> : null}
            </span>
          </Html>
        );
      })}
    </>
  );
}

registerEntityView("default", function UnusedDefault() {
  return null;
});
