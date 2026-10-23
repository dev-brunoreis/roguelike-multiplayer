import type { ArenaSnap, Snapshot } from "@game/shared/protocol";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { resolveView } from "./views.js";

export function Scene({ snap, watchId, shake }: { snap: Snapshot; watchId: string | null; shake: number }) {
  return (
    <Canvas className="scene" dpr={[1, 1.75]}>
      <color attach="background" args={["#12100d"]} />
      <OrthographicCamera makeDefault position={[18, 22, 18]} zoom={26} near={-80} far={240} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 22, 8]} intensity={1.05} />
      <Rig snap={snap} watchId={watchId} shake={shake} />
      {snap.arenas.map((arena) => <ArenaPad key={arena.id} arena={arena} />)}
      {snap.entities.map((entity) => {
        const View = resolveView(entity);
        return <View key={entity.id} entity={entity} />;
      })}
      {snap.projectiles.map((shot) => (
        <mesh key={shot.id} position={[shot.x, 0.35, shot.y]}>
          <sphereGeometry args={[0.14, 10, 8]} />
          <meshBasicMaterial color={shot.color} />
        </mesh>
      ))}
      {snap.floats.map((item) => (
        <mesh key={item.id} position={[item.x, 1.2, item.y]}>
          <sphereGeometry args={[item.crit ? 0.16 : 0.1, 8, 8]} />
          <meshBasicMaterial color={item.crit ? "#ffcf70" : "#f4efe4"} />
        </mesh>
      ))}
    </Canvas>
  );
}

function ArenaPad({ arena }: { arena: ArenaSnap }) {
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
        <meshStandardMaterial color={arena.kind === "duel" ? "#6a3d28" : "#4a4034"} />
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

function Rig({ snap, watchId, shake }: { snap: Snapshot; watchId: string | null; shake: number }) {
  const camera = useThree((state) => state.camera);
  const focus = focusOf(snap, watchId);
  const shakeLeft = useRef(0);
  useEffect(() => {
    if (shake > 0) shakeLeft.current = 1;
  }, [shake]);
  useFrame(() => {
    shakeLeft.current *= 0.86;
    const jx = (Math.random() - 0.5) * shakeLeft.current * 0.35;
    const jz = (Math.random() - 0.5) * shakeLeft.current * 0.35;
    const desiredX = focus[0] + 14 + jx;
    const desiredZ = focus[1] + 14 + jz;
    camera.position.x += (desiredX - camera.position.x) * 0.1;
    camera.position.y += (18 - camera.position.y) * 0.1;
    camera.position.z += (desiredZ - camera.position.z) * 0.1;
    camera.lookAt(focus[0], 0, focus[1]);
  });
  return null;
}

function focusOf(snap: Snapshot, watchId: string | null): [number, number] {
  const you = snap.players.find((player) => player.id === snap.youId);
  const watch = snap.players.find((player) => player.id === (watchId ?? you?.id)) ?? you;
  const entity = snap.entities.find((item) => item.playerId && item.playerId === watch?.id);
  if (entity) return [entity.x, entity.y];
  const arena = snap.arenas.find((item) => item.id === watch?.arenaId) ?? snap.arenas[0];
  if (!arena) return [0, 0];
  return [arena.x + arena.size / 2, arena.y + arena.size / 2];
}

