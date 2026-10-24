import type { Snapshot } from "@game/shared/protocol";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { EntityPuppet } from "./views.js";

const VIEW_RANGE = 48;

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
      <OrthographicCamera makeDefault position={[18, 22, 18]} zoom={22} near={-120} far={280} />
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
  const gl = useThree((state) => state.gl);
  const follow = useRef({ x: 0, z: 0, ready: false });
  const pan = useRef({ x: 0, z: 0 });
  const mouse = useRef({ x: 0.5, y: 0.5, drag: false, lx: 0, ly: 0 });
  const [visible, setVisible] = useState<{ arenas: string[]; entities: number[] }>({ arenas: [], entities: [] });
  const idsKey = useRef("");

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.current.x = (event.clientX - rect.left) / Math.max(1, rect.width);
      mouse.current.y = (event.clientY - rect.top) / Math.max(1, rect.height);
      if (!mouse.current.drag) return;
      const dx = event.clientX - mouse.current.lx;
      const dy = event.clientY - mouse.current.ly;
      mouse.current.lx = event.clientX;
      mouse.current.ly = event.clientY;
      pan.current.x += (-dx - dy) * 0.045;
      pan.current.z += (dx - dy) * 0.045;
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 1 && event.button !== 2) return;
      mouse.current.drag = true;
      mouse.current.lx = event.clientX;
      mouse.current.ly = event.clientY;
      el.setPointerCapture(event.pointerId);
    };
    const onUp = () => {
      mouse.current.drag = false;
    };
    const onMenu = (event: Event) => event.preventDefault();
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);
    el.addEventListener("contextmenu", onMenu);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onUp);
      el.removeEventListener("contextmenu", onMenu);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const snap = snapRef.current;
    if (!snap) return;
    const focus = focusOf(snap, watchId);
    const edge = 0.07;
    const speed = 28 * delta;
    if (mouse.current.x < edge) {
      pan.current.x -= speed * Math.SQRT1_2;
      pan.current.z += speed * Math.SQRT1_2;
    } else if (mouse.current.x > 1 - edge) {
      pan.current.x += speed * Math.SQRT1_2;
      pan.current.z -= speed * Math.SQRT1_2;
    }
    if (mouse.current.y < edge) {
      pan.current.x -= speed * Math.SQRT1_2;
      pan.current.z -= speed * Math.SQRT1_2;
    } else if (mouse.current.y > 1 - edge) {
      pan.current.x += speed * Math.SQRT1_2;
      pan.current.z += speed * Math.SQRT1_2;
    }
    const lookX = focus[0] + pan.current.x;
    const lookZ = focus[1] + pan.current.z;
    if (!follow.current.ready) {
      follow.current = { x: lookX, z: lookZ, ready: true };
    } else if (Math.hypot(lookX - follow.current.x, lookZ - follow.current.z) > 24) {
      follow.current.x = lookX;
      follow.current.z = lookZ;
      pan.current.x = 0;
      pan.current.z = 0;
    }
    const smear = Math.min(1, delta * 8);
    follow.current.x += (lookX - follow.current.x) * smear;
    follow.current.z += (lookZ - follow.current.z) * smear;
    shakeRef.current *= 0.86;
    const j = shakeRef.current;
    const jx = (Math.random() - 0.5) * j * 0.28;
    const jz = (Math.random() - 0.5) * j * 0.28;
    camera.position.set(follow.current.x + 16 + jx, 20, follow.current.z + 16 + jz);
    camera.lookAt(follow.current.x, 0, follow.current.z);

    const arenas = snap.arenas.filter((arena) => {
      const cx = arena.x + arena.size / 2;
      const cz = arena.y + arena.size / 2;
      return Math.hypot(cx - follow.current.x, cz - follow.current.z) < VIEW_RANGE + arena.size * 0.35;
    });
    const arenaIds = new Set(arenas.map((arena) => arena.id));
    const entities = snap.entities.filter((entity) => arenaIds.has(entity.arenaId));
    const key = `${arenas.map((arena) => arena.id).join(",")}|${entities.map((entity) => entity.id).join(",")}`;
    if (key !== idsKey.current) {
      idsKey.current = key;
      setVisible({
        arenas: arenas.map((arena) => arena.id),
        entities: entities.map((entity) => entity.id),
      });
    }
  });

  const snap = snapRef.current;
  return (
    <>
      {visible.arenas.map((id) => {
        const arena = snap?.arenas.find((item) => item.id === id);
        return arena ? <ArenaPad key={id} arena={arena} /> : null;
      })}
      {visible.entities.map((id) => <EntityPuppet key={id} id={id} snapRef={snapRef} />)}
      <Shots snapRef={snapRef} follow={follow} />
    </>
  );
}

function ArenaPad({ arena }: { arena: { id: string; x: number; y: number; size: number; kind: string } }) {
  const cx = arena.x + arena.size / 2;
  const cz = arena.y + arena.size / 2;
  const s = arena.size / 2;
  const points = useMemo(() => new Float32Array([
    -s, 0.04, -s, s, 0.04, -s,
    s, 0.04, -s, s, 0.04, s,
    s, 0.04, s, -s, 0.04, s,
    -s, 0.04, s, -s, 0.04, -s,
  ]), [s]);
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[arena.size, arena.size]} />
        <meshBasicMaterial color={arena.kind === "hub" ? "#3d4a3a" : arena.kind === "duel" ? "#6a3d28" : "#4a4034"} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#8a6f4c" />
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
    const near = snap.projectiles.filter((shot) => Math.hypot(shot.x - follow.current.x, shot.y - follow.current.z) < VIEW_RANGE);
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
  const mesh = useRef<import("three").Mesh>(null);
  useFrame(() => {
    const shot = snapRef.current?.projectiles.find((item) => item.id === id);
    if (!mesh.current) return;
    if (!shot) {
      mesh.current.visible = false;
      return;
    }
    mesh.current.visible = true;
    mesh.current.position.set(shot.x, 0.35, shot.y);
  });
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.14, 8, 6]} />
      <meshBasicMaterial color="#f4efe4" />
    </mesh>
  );
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
