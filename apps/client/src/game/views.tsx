import type { EntitySnap } from "@game/shared/protocol";
import { useFrame } from "@react-three/fiber";
import { useRef, type ComponentType } from "react";
import type { Mesh, MeshStandardMaterial } from "three";

export type ViewProps = { entity: EntitySnap };

const views = new Map<string, ComponentType<ViewProps>>();

export function registerEntityView(id: string, view: ComponentType<ViewProps>) {
  views.set(id, view);
}

export function resolveView(entity: EntitySnap) {
  return views.get(entity.view) ?? views.get(entity.kind) ?? views.get("default")!;
}

function SphereView({ entity }: ViewProps) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const pos = useRef({ x: entity.x, z: entity.y });
  const flash = useRef(entity.flash);
  const glow = useRef(0);
  useFrame((_, delta) => {
    pos.current.x += (entity.x - pos.current.x) * Math.min(1, delta * 12);
    pos.current.z += (entity.y - pos.current.z) * Math.min(1, delta * 12);
    mesh.current?.position.set(pos.current.x, entity.radius, pos.current.z);
    if (flash.current !== entity.flash) {
      flash.current = entity.flash;
      glow.current = 1;
    }
    glow.current *= 0.82;
    if (material.current) material.current.emissiveIntensity = 0.15 + glow.current * 1.4;
  });
  const hp = Math.max(0.05, entity.hp / entity.maxHp);
  return (
    <group>
      <mesh ref={mesh} position={[entity.x, entity.radius, entity.y]}>
        <sphereGeometry args={[entity.radius, 24, 16]} />
        <meshStandardMaterial ref={material} color={entity.color} emissive={entity.color} emissiveIntensity={0.15} roughness={0.45} />
      </mesh>
      <mesh position={[entity.x, entity.radius * 2 + 0.18, entity.y]} rotation={[-0.6, 0.6, 0]}>
        <planeGeometry args={[0.9, 0.08]} />
        <meshBasicMaterial color="#2a1515" />
      </mesh>
      <mesh position={[entity.x + (hp - 1) * 0.45, entity.radius * 2 + 0.19, entity.y]} rotation={[-0.6, 0.6, 0]} scale={[hp, 1, 1]}>
        <planeGeometry args={[0.9, 0.08]} />
        <meshBasicMaterial color={entity.kind === "hero" ? "#8fdb67" : "#e23d3d"} />
      </mesh>
    </group>
  );
}

registerEntityView("default", SphereView);
registerEntityView("hero", SphereView);
registerEntityView("creep", SphereView);
registerEntityView("boss", SphereView);

// Trocar uma primitiva por modelo:
// registerEntityView("guerreiro", function Guerreiro({ entity }) {
//   const gltf = useGLTF("/models/guerreiro.glb");
//   return <primitive object={gltf.scene.clone()} position={[entity.x, 0, entity.y]} />;
// });
