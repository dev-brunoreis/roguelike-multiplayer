import type { Snapshot } from "@game/shared/protocol";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef, useState, type MutableRefObject } from "react";
import { forgetMotion, motionAt, trackMotion } from "./motion.js";
import { shotTexture } from "./sprites.js";
import { DeathLayer, EntityPuppet, FloatLayer, HpLayer } from "./views.js";

const VIEW_RANGE = 92;

export const Scene = memo(function Scene({
  snapRef,
  watchId,
  shakeRef,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  watchId: string | null;
  shakeRef: MutableRefObject<number>;
}) {
  return (
    <Canvas className="scene" flat dpr={1} gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}>
      <color attach="background" args={["#12100d"]} />
      <OrthographicCamera makeDefault position={[18, 22, 18]} zoom={22} near={-120} far={420} />
      <World snapRef={snapRef} watchId={watchId} shakeRef={shakeRef} />
    </Canvas>
  );
});

function World({
  snapRef,
  watchId,
  shakeRef,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  watchId: string | null;
  shakeRef: MutableRefObject<number>;
}) {
  const camera = useThree((state) => state.camera);
  const follow = useRef({ x: 0, z: 0, ready: false });
  const focusMem = useRef({ x: 0, z: 0, ready: false });
  const [visible, setVisible] = useState<{ arenas: string[]; entities: number[] }>({ arenas: [], entities: [] });
  const idsKey = useRef("");

  useFrame((state, delta) => {
    const snap = snapRef.current;
    if (!snap) return;
    const now = state.clock.elapsedTime;
    const alive = new Set<number>();
    for (const entity of snap.entities) {
      alive.add(entity.id);
      trackMotion(entity.id, entity.x, entity.y, now);
    }
    for (const shot of snap.projectiles) {
      alive.add(shot.id);
      trackMotion(shot.id, shot.x, shot.y, now);
    }
    forgetMotion(alive);
    const focus = smoothFocus(snap, watchId, now);
    const lookX = focus[0];
    const lookZ = focus[1];
    if (!focusMem.current.ready) {
      focusMem.current = { x: focus[0], z: focus[1], ready: true };
    } else if (Math.hypot(focus[0] - focusMem.current.x, focus[1] - focusMem.current.z) > 18) {
      follow.current.x = focus[0];
      follow.current.z = focus[1];
      focusMem.current = { x: focus[0], z: focus[1], ready: true };
    } else {
      focusMem.current.x = focus[0];
      focusMem.current.z = focus[1];
    }
    if (!follow.current.ready) {
      follow.current = { x: lookX, z: lookZ, ready: true };
    }
    const smear = Math.min(1, delta * 18);
    follow.current.x += (lookX - follow.current.x) * smear;
    follow.current.z += (lookZ - follow.current.z) * smear;
    shakeRef.current *= 0.86;
    const j = shakeRef.current;
    const jx = (Math.random() - 0.5) * j * 0.28;
    const jz = (Math.random() - 0.5) * j * 0.28;
    camera.position.set(follow.current.x + 16 + jx, 20, follow.current.z + 16 + jz);
    camera.lookAt(follow.current.x, 0, follow.current.z);

    const arenas = snap.arenas.filter((arena) => arenaOnScreen(arena, follow.current));
    const shown = new Set(arenas.map((arena) => arena.id));
    const entities = snap.entities.filter((entity) => shown.has(entity.arenaId) || nearLook(entity.x, entity.y, follow.current));
    const key = `${arenas.map((arena) => arena.id).join(",")}|${entities.map((entity) => entity.id).join(",")}`;
    if (key !== idsKey.current) {
      idsKey.current = key;
      setVisible({
        arenas: arenas.map((arena) => arena.id),
        entities: entities.map((entity) => entity.id),
      });
    }
  }, -1);

  const snap = snapRef.current;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[420, 420]} />
        <meshBasicMaterial color="#0d0c0a" />
      </mesh>
      {visible.arenas.map((id) => {
        const arena = snap?.arenas.find((item) => item.id === id);
        return arena ? <ArenaPad key={id} arena={arena} /> : null;
      })}
      {visible.entities.map((id) => <EntityPuppet key={id} id={id} snapRef={snapRef} />)}
      <DeathLayer snapRef={snapRef} />
      <FloatLayer snapRef={snapRef} />
      <HpLayer ids={visible.entities} snapRef={snapRef} />
      <Shots snapRef={snapRef} follow={follow} />
      <FxLayer snapRef={snapRef} follow={follow} />
    </>
  );
}

function ArenaPad({ arena }: { arena: { id: string; x: number; y: number; size: number; kind: string } }) {
  const cx = arena.x + arena.size / 2;
  const cz = arena.y + arena.size / 2;
  const s = arena.size / 2;
  const inner = s - 0.45;
  const fill = arena.kind === "hub" ? "#3f4d3c" : arena.kind === "duel" ? "#6e3f28" : "#4d4336";
  const rim = arena.kind === "hub" ? "#6f8a62" : arena.kind === "duel" ? "#c46a3a" : "#8a6f4c";
  const points = useMemo(() => {
    const tiles: number[] = [];
    const step = arena.size / 6;
    for (let i = 1; i < 6; i += 1) {
      const p = -s + i * step;
      tiles.push(-inner, 0.05, p, inner, 0.05, p, p, 0.05, -inner, p, 0.05, inner);
    }
    tiles.push(
      -s, 0.06, -s, s, 0.06, -s,
      s, 0.06, -s, s, 0.06, s,
      s, 0.06, s, -s, 0.06, s,
      -s, 0.06, s, -s, 0.06, -s,
    );
    return new Float32Array(tiles);
  }, [arena.size, inner, s]);
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[arena.size + 1.4, arena.size + 1.4]} />
        <meshBasicMaterial color="#1a1612" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[arena.size, arena.size]} />
        <meshBasicMaterial color={fill} />
      </mesh>
      {arena.kind === "hub" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[4.2, 24]} />
          <meshBasicMaterial color="#4d5c48" />
        </mesh>
      ) : null}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={rim} transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

function Shots({
  snapRef,
  follow,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  follow: MutableRefObject<{ x: number; z: number; ready: boolean }>;
}) {
  const [ids, setIds] = useState<number[]>([]);
  const key = useRef("");
  useFrame(() => {
    const snap = snapRef.current;
    if (!snap) return;
    const shown = new Set(snap.arenas.filter((arena) => arenaOnScreen(arena, follow.current)).map((arena) => arena.id));
    const near = snap.projectiles.filter((shot) => shown.has(shot.arenaId) || nearLook(shot.x, shot.y, follow.current));
    const next = near.map((shot) => shot.id).join(",");
    if (next !== key.current) {
      key.current = next;
      setIds(near.map((shot) => shot.id));
    }
  });
  return (
    <>
      {ids.map((id) => <Shot key={id} id={id} snapRef={snapRef} />)}
    </>
  );
}

function Shot({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const sprite = useRef<import("three").Sprite>(null);
  useFrame((state) => {
    const shot = snapRef.current?.projectiles.find((item) => item.id === id);
    const placed = motionAt(id, state.clock.elapsedTime);
    if (!sprite.current) return;
    if (!shot || !placed) {
      sprite.current.visible = false;
      return;
    }
    sprite.current.visible = true;
    sprite.current.position.set(placed.x, 0.55, placed.y);
    sprite.current.scale.set(0.42, 0.42, 1);
    const mat = sprite.current.material as import("three").SpriteMaterial;
    mat.color.set(shot.color);
  });
  return (
    <sprite ref={sprite} center={[0.5, 0.5]} renderOrder={12}>
      <spriteMaterial map={shotTexture()} transparent alphaTest={0.4} depthWrite={false} />
    </sprite>
  );
}

function FxLayer({
  snapRef,
  follow,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  follow: MutableRefObject<{ x: number; z: number; ready: boolean }>;
}) {
  const [ids, setIds] = useState<number[]>([]);
  const key = useRef("");
  useFrame(() => {
    const snap = snapRef.current;
    if (!snap) return;
    const shown = new Set(snap.arenas.filter((arena) => arenaOnScreen(arena, follow.current)).map((arena) => arena.id));
    const near = snap.fx.filter((item) => shown.has(item.arenaId) || nearLook(item.x, item.y, follow.current));
    const next = near.map((item) => item.id).join(",");
    if (next !== key.current) {
      key.current = next;
      setIds(near.map((item) => item.id));
    }
  });
  return (
    <>
      {ids.map((id) => <FxBurst key={id} id={id} snapRef={snapRef} />)}
    </>
  );
}

function FxBurst({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const ring = useRef<import("three").Mesh>(null);
  const bolt = useRef<import("three").Mesh>(null);
  useFrame(() => {
    const fx = snapRef.current?.fx.find((item) => item.id === id);
    const fade = fx ? Math.max(0, 1 - fx.t) : 0;
    if (ring.current) ring.current.visible = false;
    if (bolt.current) bolt.current.visible = false;
    if (!fx) return;
    if (fx.kind === "bolt" && fx.x2 != null && fx.y2 != null && bolt.current) {
      const dx = fx.x2 - fx.x;
      const dz = fx.y2 - fx.y;
      const len = Math.hypot(dx, dz) || 0.2;
      bolt.current.visible = true;
      bolt.current.position.set((fx.x + fx.x2) / 2, 0.62, (fx.y + fx.y2) / 2);
      bolt.current.rotation.set(0, Math.atan2(dx, dz), 0);
      bolt.current.scale.set(fx.radius * 2.2 * fade, 0.16, len);
      const mat = bolt.current.material as import("three").MeshBasicMaterial;
      mat.color.set(fx.color);
      mat.opacity = 0.95 * fade;
      return;
    }
    if (!ring.current) return;
    ring.current.visible = true;
    const grow = 0.4 + fx.t * 1.35;
    ring.current.position.set(fx.x, 0.18, fx.y);
    ring.current.scale.set(fx.radius * grow, fx.radius * grow, 1);
    const mat = ring.current.material as import("three").MeshBasicMaterial;
    mat.color.set(fx.color);
    mat.opacity = Math.max(0, 0.72 * fade);
  });
  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={8}>
        <ringGeometry args={[0.28, 1, 28]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
      <mesh ref={bolt} renderOrder={9}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function nearLook(x: number, y: number, look: { x: number; z: number }) {
  return Math.hypot(x - look.x, y - look.z) < VIEW_RANGE + 36;
}

function arenaOnScreen(arena: { x: number; y: number; size: number }, look: { x: number; z: number }) {
  const cx = arena.x + arena.size / 2;
  const cz = arena.y + arena.size / 2;
  return Math.hypot(cx - look.x, cz - look.z) < VIEW_RANGE + arena.size * 0.75;
}

function smoothFocus(snap: Snapshot, watchId: string | null, now: number): [number, number] {
  const raw = focusOf(snap, watchId);
  const you = snap.players.find((player) => player.id === snap.youId);
  const watch = snap.players.find((player) => player.id === (watchId ?? you?.id)) ?? you;
  const entity = snap.entities.find((item) => item.playerId === watch?.id);
  if (!entity) return raw;
  const placed = motionAt(entity.id, now);
  return placed ? [placed.x, placed.y] : raw;
}

function focusOf(snap: Snapshot, watchId: string | null): [number, number] {
  const you = snap.players.find((player) => player.id === snap.youId);
  const watch = snap.players.find((player) => player.id === (watchId ?? you?.id)) ?? you;
  const entity = snap.entities.find((item) => item.playerId === watch?.id);
  if (entity) return [entity.x, entity.y];
  const arena = snap.arenas.find((item) => item.id === watch?.arenaId) ?? snap.arenas[0];
  if (!arena) return [0, 0];
  return [arena.x + arena.size / 2, arena.y + arena.size / 2];
}
