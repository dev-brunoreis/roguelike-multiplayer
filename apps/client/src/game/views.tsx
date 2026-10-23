import type { EntitySnap, Snapshot } from "@game/shared/protocol";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type ComponentType, type MutableRefObject } from "react";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";

export type ViewProps = { entity: EntitySnap };

const views = new Map<string, ComponentType<ViewProps>>();

export function registerEntityView(id: string, view: ComponentType<ViewProps>) {
  views.set(id, view);
}

export function resolveView(entity: EntitySnap) {
  return views.get(entity.view) ?? views.get(entity.kind) ?? views.get("default")!;
}

export function EntityPuppet({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const group = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const bar = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const fillMat = useRef<MeshBasicMaterial>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const camera = useThree((state) => state.camera);
  const pos = useRef({ x: 0, z: 0, ready: false });
  const flash = useRef(0);
  const glow = useRef(0);
  useFrame((_, delta) => {
    const entity = snapRef.current?.entities.find((item) => item.id === id);
    const root = group.current;
    if (!entity || !root) {
      if (root) root.visible = false;
      return;
    }
    root.visible = true;
    if (!pos.current.ready) {
      pos.current = { x: entity.x, z: entity.y, ready: true };
    }
    const smear = Math.min(1, delta * 14);
    pos.current.x += (entity.x - pos.current.x) * smear;
    pos.current.z += (entity.y - pos.current.z) * smear;
    root.position.set(pos.current.x, 0, pos.current.z);
    if (body.current) body.current.scale.setScalar(entity.radius);
    body.current?.position.set(0, entity.radius, 0);
    if (flash.current !== entity.flash) {
      flash.current = entity.flash;
      glow.current = 1;
    }
    glow.current *= 0.82;
    if (material.current) {
      material.current.color.set(entity.color);
      material.current.emissive.set(entity.color);
      material.current.emissiveIntensity = 0.15 + glow.current * 1.4;
    }
    if (bar.current) {
      bar.current.position.set(0, entity.radius * 2 + 0.35, 0);
      bar.current.lookAt(camera.position);
    }
    const hp = Math.max(0.04, entity.hp / entity.maxHp);
    if (fill.current) {
      fill.current.scale.x = hp;
      fill.current.position.x = (hp - 1) * 0.42;
    }
    if (fillMat.current) fillMat.current.color.set(entity.kind === "hero" ? "#8fdb67" : "#e23d3d");
  });
  return (
    <group ref={group}>
      <mesh ref={body}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial ref={material} roughness={0.45} />
      </mesh>
      <group ref={bar}>
        <mesh>
          <planeGeometry args={[0.84, 0.09]} />
          <meshBasicMaterial color="#2a1515" depthTest={false} />
        </mesh>
        <mesh ref={fill} position={[0, 0, 0.01]}>
          <planeGeometry args={[0.84, 0.09]} />
          <meshBasicMaterial ref={fillMat} color="#8fdb67" depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

registerEntityView("default", function UnusedDefault() {
  return null;
});
