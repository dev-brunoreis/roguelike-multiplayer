import type { Snapshot } from "@game/shared/protocol";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { arenaInView, inView, renderStats, setViewRect, type SnapIndex } from "./frame.js";
import { setWorldAim } from "./input.js";
import { ArenaDressing, floorTexture, moteField, moteTexture, voidTexture, type MoteField } from "./atmosphere.js";
import { forgetMotion, motionAt, resetMotion } from "./motion.js";
import { shotScale, shotShape, shotTexture } from "./sprites.js";
import { DeathLayer, EntityPuppet, FloatLayer, HpLayer, resetPoses } from "./views.js";

export const Scene = memo(function Scene({
  snapRef,
  indexRef,
  watchId,
  shakeRef,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  indexRef: MutableRefObject<SnapIndex>;
  watchId: string | null;
  shakeRef: MutableRefObject<number>;
}) {
  return (
    <Canvas className="scene" flat dpr={1} gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}>
      <color attach="background" args={["#0e0c0a"]} />
      <fog attach="fog" args={["#0e0c0a", 72, 168]} />
      <OrthographicCamera makeDefault position={[18, 22, 18]} zoom={22} near={-120} far={420} />
      <AimCursor snapRef={snapRef} watchId={watchId} />
      <World snapRef={snapRef} indexRef={indexRef} watchId={watchId} shakeRef={shakeRef} />
    </Canvas>
  );
});

function AimCursor({
  snapRef,
  watchId,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  watchId: string | null;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const hit = new Vector3();
    const ndc = new Vector2();
    const onMove = (event: PointerEvent) => {
      const snap = snapRef.current;
      if (!snap) return;
      if (watchId && watchId !== snap.youId) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      setWorldAim(hit.x, hit.z);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [camera, gl, snapRef, watchId]);
  return null;
}

function World({
  snapRef,
  indexRef,
  watchId,
  shakeRef,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  indexRef: MutableRefObject<SnapIndex>;
  watchId: string | null;
  shakeRef: MutableRefObject<number>;
}) {
  const camera = useThree((state) => state.camera);
  const follow = useRef({ x: 0, z: 0, ready: false });
  const focusMem = useRef({ x: 0, z: 0, ready: false });
  const [visible, setVisible] = useState<{ arenas: string[]; entities: number[] }>({ arenas: [], entities: [] });
  const idsKey = useRef("");

  useLayoutEffect(() => {
    resetMotion();
    resetPoses();
    return () => {
      resetMotion();
      resetPoses();
    };
  }, []);

  useFrame((state, delta) => {
    const snap = snapRef.current;
    if (!snap) return;
    const now = performance.now() / 1000;
    const alive = new Set<number>();
    for (const entity of snap.entities) alive.add(entity.id);
    for (const shot of snap.projectiles) alive.add(shot.id);
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
    camera.updateMatrixWorld();
    fitView(camera, state.gl);

    const arenas = snap.arenas.filter((arena) => arenaInView(arena));
    const shown = new Set(arenas.map((arena) => arena.id));
    const entities = snap.entities.filter((entity) => shown.has(entity.arenaId));
    renderStats.entities = entities.length;
    renderStats.html = document.querySelectorAll(".float-anchor, .nametag").length;
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
        <planeGeometry args={[420, 420]} />
        <meshBasicMaterial map={voidTexture()} color="#141210" dispose={null} />
      </mesh>
      <Drift />
      {visible.arenas.map((id) => {
        const arena = snap?.arenas.find((item) => item.id === id);
        return arena ? <ArenaPad key={id} arena={arena} /> : null;
      })}
      {visible.entities.map((id) => <EntityPuppet key={id} id={id} snapRef={snapRef} indexRef={indexRef} />)}
      <DeathLayer snapRef={snapRef} />
      <FloatLayer snapRef={snapRef} />
      <HpLayer ids={visible.entities} indexRef={indexRef} />
      <Shots snapRef={snapRef} indexRef={indexRef} />
      <FxLayer snapRef={snapRef} indexRef={indexRef} />
    </>
  );
}

function ArenaPad({ arena }: { arena: { id: string; x: number; y: number; size: number; kind: string } }) {
  const cx = arena.x + arena.size / 2;
  const cz = arena.y + arena.size / 2;
  const skirt = arena.kind === "hub" ? "#1c2218" : arena.kind === "duel" ? "#1a100e" : "#1a1612";
  const map = floorTexture(arena.kind);
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[arena.size + 2.2, arena.size + 2.2]} />
        <meshBasicMaterial color={skirt} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[arena.size, arena.size]} />
        <meshBasicMaterial map={map} dispose={null} />
      </mesh>
      {arena.kind === "hub" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[3.2, 4.4, 28]} />
          <meshBasicMaterial color="#6f8a62" transparent opacity={0.55} />
        </mesh>
      ) : null}
      <ArenaDressing id={arena.id} size={arena.size} kind={arena.kind} />
    </group>
  );
}

function Drift() {
  const dust = useMemo(() => moteField(0x51a7e, 560, 104), []);
  const spark = useMemo(() => moteField(0xc15a, 90, 104), []);
  return (
    <group>
      <MoteCloud field={dust} color="#cbbba6" size={2.2} opacity={0.34} />
      <MoteCloud field={spark} color="#e6c15a" size={3.4} opacity={0.5} />
    </group>
  );
}

function MoteCloud({ field, color, size, opacity }: { field: MoteField; color: string; size: number; opacity: number }) {
  const points = useRef<import("three").Points>(null);
  useFrame((state) => {
    const attr = points.current?.geometry.getAttribute("position") as import("three").BufferAttribute | undefined;
    if (!attr) return;
    const t = state.clock.elapsedTime;
    const pos = attr.array as Float32Array;
    const { homes, phases, speeds, wanders, lifts } = field;
    for (let i = 0; i < phases.length; i += 1) {
      const wobble = t * speeds[i]! + phases[i]!;
      pos[i * 3] = homes[i * 3]! + Math.sin(wobble) * wanders[i]!;
      pos[i * 3 + 1] = homes[i * 3 + 1]! + Math.sin(wobble * 0.65) * lifts[i]!;
      pos[i * 3 + 2] = homes[i * 3 + 2]! + Math.cos(wobble * 0.75) * wanders[i]!;
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={points} renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[field.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation={false}
        map={moteTexture()}
        transparent
        opacity={opacity}
        depthWrite={false}
        alphaTest={0.05}
      />
    </points>
  );
}

function Shots({
  snapRef,
  indexRef,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  indexRef: MutableRefObject<SnapIndex>;
}) {
  const [ids, setIds] = useState<number[]>([]);
  const key = useRef("");
  useFrame(() => {
    const snap = snapRef.current;
    if (!snap) return;
    const near = snap.projectiles.filter((shot) => inView(shot.x, shot.y));
    const next = near.map((shot) => shot.id).join(",");
    if (next !== key.current) {
      key.current = next;
      setIds(near.map((shot) => shot.id));
    }
  });
  return (
    <>
      {ids.map((id) => <Shot key={id} id={id} indexRef={indexRef} />)}
    </>
  );
}

function Shot({ id, indexRef }: { id: number; indexRef: MutableRefObject<SnapIndex> }) {
  const sprite = useRef<import("three").Sprite>(null);
  useFrame(() => {
    const shot = indexRef.current.projectiles.get(id);
    const placed = motionAt(id, performance.now() / 1000);
    if (!sprite.current) return;
    if (!shot || !placed) {
      sprite.current.visible = false;
      return;
    }
    sprite.current.visible = true;
    sprite.current.position.set(placed.x, 0.55, placed.y);
    const shape = shotShape(shot.abilityId);
    const [wide, tall] = shotScale(shape);
    sprite.current.scale.set(wide, tall, 1);
    const mat = sprite.current.material as import("three").SpriteMaterial;
    mat.map = shotTexture(shape);
    const screenX = shot.vx - shot.vy;
    const screenY = -0.75 * (shot.vx + shot.vy);
    mat.rotation = shape === "orb" ? 0 : Math.atan2(screenY, screenX);
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
  indexRef,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  indexRef: MutableRefObject<SnapIndex>;
}) {
  const [ids, setIds] = useState<number[]>([]);
  const key = useRef("");
  useFrame(() => {
    const snap = snapRef.current;
    if (!snap) return;
    const near = snap.fx.filter((item) => inView(item.x, item.y));
    const next = near.map((item) => item.id).join(",");
    if (next !== key.current) {
      key.current = next;
      setIds(near.map((item) => item.id));
    }
  });
  return (
    <>
      {ids.map((id) => <FxBurst key={id} id={id} indexRef={indexRef} />)}
    </>
  );
}

function FxBurst({ id, indexRef }: { id: number; indexRef: MutableRefObject<SnapIndex> }) {
  const ring = useRef<import("three").Mesh>(null);
  const bolt = useRef<import("three").Mesh>(null);
  useFrame(() => {
    const fx = indexRef.current.fx.get(id);
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

function fitView(camera: import("three").Camera, gl: { domElement: HTMLCanvasElement }) {
  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const ndc = new Vector2();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let hits = 0;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) continue;
    hits += 1;
    minX = Math.min(minX, hit.x);
    maxX = Math.max(maxX, hit.x);
    minZ = Math.min(minZ, hit.z);
    maxZ = Math.max(maxZ, hit.z);
  }
  if (hits < 3 || gl.domElement.width <= 0) return;
  const margin = 4;
  setViewRect(minX - margin, maxX + margin, minZ - margin, maxZ + margin);
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
