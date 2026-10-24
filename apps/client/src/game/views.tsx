import type { EntitySnap, Snapshot } from "@game/shared/protocol";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentType, type MutableRefObject } from "react";
import { PlaneGeometry, Sprite, SpriteMaterial, type Group, type Mesh, type MeshBasicMaterial, type Texture } from "three";
import { cloneSheet, setSpriteFrame } from "./sprites.js";

export type ViewProps = { entity: EntitySnap };

const views = new Map<string, ComponentType<ViewProps>>();
const BAR_GEO = new PlaneGeometry(0.84, 0.09);

export function registerEntityView(id: string, view: ComponentType<ViewProps>) {
  views.set(id, view);
}

export function resolveView(entity: EntitySnap) {
  return views.get(entity.view) ?? views.get(entity.kind) ?? views.get("default")!;
}

export function EntityPuppet({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const group = useRef<Group>(null);
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const bar = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const fillMat = useRef<MeshBasicMaterial>(null);
  const camera = useThree((state) => state.camera);
  const pos = useRef({ x: 0, z: 0, ready: false });
  const anim = useRef({ frame: 0, acc: 0, flip: 1 });
  const flash = useRef(0);
  const glow = useRef(0);
  const first = snapRef.current?.entities.find((item) => item.id === id);
  const sheet = useMemo(
    () => cloneSheet(first?.view ?? "slime", first?.color ?? "#c9b8a0"),
    [first?.view, first?.color],
  );

  useEffect(() => {
    if (material.current) material.current.map = sheet;
    return () => sheet.dispose();
  }, [sheet]);

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
    const prevX = pos.current.x;
    const prevZ = pos.current.z;
    const smear = Math.min(1, delta * 14);
    pos.current.x += (entity.x - pos.current.x) * smear;
    pos.current.z += (entity.y - pos.current.z) * smear;
    root.position.set(pos.current.x, 0, pos.current.z);

    const vx = pos.current.x - prevX;
    const vz = pos.current.z - prevZ;
    const speed = Math.hypot(vx, vz) / Math.max(delta, 0.0001);
    const moving = speed > 0.55;
    const right = vx - vz;
    if (Math.abs(right) > 0.0008) anim.current.flip = right > 0 ? 1 : -1;

    const fps = moving ? 10 : 3.4;
    anim.current.acc += delta * fps;
    if (anim.current.acc >= 1) {
      anim.current.acc = 0;
      anim.current.frame = moving
        ? 2 + ((anim.current.frame + 1) % 4)
        : (anim.current.frame + 1) % 2;
    }
    const map = material.current?.map as Texture | null;
    if (map) setSpriteFrame(map, anim.current.frame);

    const tall = entity.radius * (entity.kind === "hero" ? 5.4 : entity.kind === "boss" ? 4.2 : 4.6);
    if (sprite.current) {
      sprite.current.position.set(0, tall * 0.48, 0);
      sprite.current.scale.set(tall * anim.current.flip, tall, 1);
    }
    if (flash.current !== entity.flash) {
      flash.current = entity.flash;
      glow.current = 1;
    }
    glow.current *= 0.78;
    if (material.current) {
      const lit = 1 + glow.current * 1.8;
      material.current.color.setRGB(lit, lit, lit);
    }
    if (bar.current) {
      bar.current.position.set(0, tall + 0.18, 0);
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
      <sprite ref={sprite}>
        <spriteMaterial ref={material} map={sheet} transparent alphaTest={0.25} depthWrite />
      </sprite>
      <group ref={bar}>
        <mesh geometry={BAR_GEO}>
          <meshBasicMaterial color="#2a1515" depthTest={false} />
        </mesh>
        <mesh ref={fill} geometry={BAR_GEO} position={[0, 0, 0.01]}>
          <meshBasicMaterial ref={fillMat} color="#8fdb67" depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

registerEntityView("default", function UnusedDefault() {
  return null;
});
