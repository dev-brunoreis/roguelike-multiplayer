import type { ArenaSnap, ObstacleSnap, PortalSnap, Snapshot } from "@game/shared/protocol";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { OrthographicCamera as OrthoCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { arenaInView, renderStats, setViewRect, type SnapIndex } from "./frame.js";
import { CAMERA_ZOOM, ZOOM_MAX, ZOOM_MIN } from "./glyphs.js";
import { setWorldAim } from "./input.js";
import { ArenaDressing, floorTexture, moteField, moteTexture, voidTexture, type MoteField } from "./atmosphere.js";
import { forgetMotion, motionAt, resetMotion } from "./motion.js";
import { VfxField } from "./VfxField.js";
import { DeathLayer, EntityPuppet, FloatLayer, HpLayer, resetPoses } from "./views.js";

export interface SceneView {
  x: number;
  z: number;
  zoom: number;
}

export const Scene = memo(function Scene({
  snapRef,
  indexRef,
  watchId,
  shakeRef,
  view = null,
  preserve = false,
  children = null,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  indexRef: MutableRefObject<SnapIndex>;
  watchId: string | null;
  shakeRef: MutableRefObject<number>;
  view?: SceneView | null;
  preserve?: boolean;
  children?: ReactNode;
}) {
  return (
    <Canvas className="scene" flat dpr={1} gl={{ antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: preserve }}>
      <color attach="background" args={["#0e0c0a"]} />
      <fog attach="fog" args={["#0e0c0a", 72, 168]} />
      <OrthographicCamera makeDefault position={[18, 22, 18]} zoom={view?.zoom ?? CAMERA_ZOOM} near={-120} far={420} />
      <AimCursor snapRef={snapRef} watchId={watchId} />
      <World snapRef={snapRef} indexRef={indexRef} watchId={watchId} shakeRef={shakeRef} view={view} />
      {children}
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
  view,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  indexRef: MutableRefObject<SnapIndex>;
  watchId: string | null;
  shakeRef: MutableRefObject<number>;
  view: SceneView | null;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const zoomRef = useRef(readZoom());
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

  useEffect(() => {
    if (view) return;
    const el = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomRef.current - event.deltaY * 0.012));
      zoomRef.current = next;
      writeZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [gl, view]);

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
    const focusX = view ? view.x : follow.current.x;
    const focusZ = view ? view.z : follow.current.z;
    if (camera instanceof OrthoCamera) {
      camera.zoom = view?.zoom ?? zoomRef.current;
      camera.updateProjectionMatrix();
    }
    camera.position.set(focusX + 16 + jx, 20, focusZ + 16 + jz);
    camera.lookAt(focusX, 0, focusZ);
    camera.updateMatrixWorld();
    fitView(camera, state.gl);

    const revealed = snap.dungeon ? new Set(snap.dungeon.revealed) : null;
    const arenas = snap.arenas.filter((arena) => (!revealed || revealed.has(arena.id)) && arenaInView(arena));
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
        <planeGeometry args={[voidSpan(snap), voidSpan(snap)]} />
        <meshBasicMaterial map={voidTexture()} color={snap?.dungeon ? "#121018" : "#141210"} dispose={null} />
      </mesh>
      <Drift />
      <CaveBed snap={snap} shown={visible.arenas} />
      {visible.arenas.map((id) => {
        const arena = snap?.arenas.find((item) => item.id === id);
        return arena ? <ArenaPad key={id} arena={arena} /> : null;
      })}
      <ObstacleLayer snap={snap} shown={visible.arenas} />
      <PortalLayer snap={snap} shown={visible.arenas} />
      {visible.entities.map((id) => <EntityPuppet key={id} id={id} snapRef={snapRef} indexRef={indexRef} />)}
      <DeathLayer snapRef={snapRef} />
      <FloatLayer snapRef={snapRef} />
      <HpLayer ids={visible.entities} indexRef={indexRef} snapRef={snapRef} />
      <VfxField snapRef={snapRef} />
    </>
  );
}

function readZoom() {
  if (typeof window === "undefined") return CAMERA_ZOOM;
  const raw = Number(window.localStorage.getItem("caos-zoom"));
  if (!Number.isFinite(raw)) return CAMERA_ZOOM;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw));
}

function writeZoom(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("caos-zoom", String(Math.round(value * 10) / 10));
}

function CaveBed({ snap, shown }: { snap: Snapshot | null; shown: string[] }) {
  if (!snap?.dungeon) return null;
  const cell = snap.dungeon.cellSize;
  const open = new Set(shown);
  const map = floorTexture("cave");
  return (
    <>
      {snap.arenas.filter((arena) => open.has(arena.id)).map((arena) => {
        const cx = arena.x + cell / 2;
        const cz = arena.y + cell / 2;
        return (
          <mesh key={`cave-${arena.id}`} rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.04, cz]}>
            <planeGeometry args={[cell + 1.2, cell + 1.2]} />
            <meshBasicMaterial map={map} color="#8a8496" dispose={null} />
          </mesh>
        );
      })}
    </>
  );
}

function ObstacleLayer({ snap, shown }: { snap: Snapshot | null; shown: string[] }) {
  if (!snap) return null;
  const open = new Set(shown);
  return (
    <>
      {snap.obstacles.filter((item) => open.has(item.arenaId)).map((item, index) => (
        <ObstacleMark key={`${item.arenaId}:${index}`} item={item} />
      ))}
    </>
  );
}

function ObstacleMark({ item }: { item: ObstacleSnap }) {
  if (item.shape === "circle") {
    return (
      <mesh position={[item.x, item.r * 0.85, item.y]}>
        <cylinderGeometry args={[item.r, item.r * 1.08, item.r * 1.7, 8]} />
        <meshBasicMaterial color="#6a5c52" />
      </mesh>
    );
  }
  return (
    <mesh position={[item.x, Math.min(item.w, item.h) * 0.55, item.y]}>
      <boxGeometry args={[item.w, Math.min(item.w, item.h) * 1.1, item.h]} />
      <meshBasicMaterial color="#5c5048" />
    </mesh>
  );
}

function voidSpan(snap: Snapshot | null) {
  if (!snap || snap.arenas.length === 0) return 420;
  let max = 40;
  for (const arena of snap.arenas) {
    max = Math.max(max, Math.abs(arena.x), Math.abs(arena.y), Math.abs(arena.x + arena.size), Math.abs(arena.y + arena.size));
  }
  return max * 2 + 80;
}

function ArenaPad({ arena }: { arena: ArenaSnap }) {
  const cx = arena.x + arena.size / 2;
  const cz = arena.y + arena.size / 2;
  const boss = arena.role === "boss";
  const skirt = arena.kind === "hub" ? "#1c2218" : arena.kind === "duel" ? "#1a100e" : boss ? "#2a1214" : arena.kind === "room" ? "#16141c" : "#1a1612";
  const map = floorTexture(boss ? "boss" : arena.kind);
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

function PortalLayer({ snap, shown }: { snap: Snapshot | null; shown: string[] }) {
  if (!snap?.dungeon) return null;
  const open = new Set(shown);
  const sealed = new Set(snap.dungeon.sealed);
  return (
    <>
      {snap.portals.filter((portal) => open.has(portal.arenaId)).map((portal) => (
        <PortalMark key={portal.id} portal={portal} sealed={sealed.has(portal.arenaId)} />
      ))}
    </>
  );
}

function PortalMark({ portal, sealed }: { portal: PortalSnap; sealed: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[portal.x, 0.08, portal.y]}>
      <ringGeometry args={[0.55, 1.05, 20]} />
      <meshBasicMaterial color={sealed ? "#5c5348" : "#e6c15a"} transparent opacity={sealed ? 0.35 : 0.85} />
    </mesh>
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
