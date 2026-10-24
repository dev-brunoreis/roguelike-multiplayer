import type { EntitySnap, Snapshot } from "@game/shared/protocol";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentType, type MutableRefObject } from "react";
import { Sprite, SpriteMaterial, type Group, type Texture } from "three";
import { motionAt } from "./motion.js";
import { cloneSheet, setSpriteFrame } from "./sprites.js";

export type ViewProps = { entity: EntitySnap };

const views = new Map<string, ComponentType<ViewProps>>();

export function registerEntityView(id: string, view: ComponentType<ViewProps>) {
  views.set(id, view);
}

export function resolveView(entity: EntitySnap) {
  return views.get(entity.view) ?? views.get(entity.kind) ?? views.get("default")!;
}

function tallOf(entity: EntitySnap) {
  return entity.radius * (entity.kind === "hero" ? 5.4 : entity.kind === "boss" ? 4.2 : 4.6);
}

export function EntityPuppet({ id, snapRef }: { id: number; snapRef: MutableRefObject<Snapshot | null> }) {
  const group = useRef<Group>(null);
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const anim = useRef({ frame: 0, acc: 0, flip: 1, swing: 0, attack: 0 });
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

  useFrame((state, delta) => {
    const entity = snapRef.current?.entities.find((item) => item.id === id);
    const root = group.current;
    if (!entity || !root) {
      if (root) root.visible = false;
      return;
    }
    const placed = motionAt(id, state.clock.elapsedTime);
    if (!placed) return;
    root.visible = true;
    const prevX = root.position.x;
    const prevZ = root.position.z;
    root.position.set(placed.x, 0, placed.y);

    const vx = placed.x - prevX;
    const vz = placed.y - prevZ;
    const speed = Math.hypot(vx, vz) / Math.max(delta, 0.0001);
    const moving = speed > 0.55 && speed < 24;
    const right = vx - vz;
    if (Math.abs(right) > 0.0008) anim.current.flip = right > 0 ? 1 : -1;

    if (anim.current.swing !== entity.swing) {
      anim.current.swing = entity.swing;
      anim.current.attack = 0.48;
      anim.current.frame = 6;
      anim.current.acc = 0;
    }
    anim.current.attack = Math.max(0, anim.current.attack - delta);
    const attacking = anim.current.attack > 0;
    const fps = attacking ? 6 : moving ? 10 : 3.4;
    anim.current.acc += delta * fps;
    if (anim.current.acc >= 1) {
      anim.current.acc = 0;
      if (attacking) anim.current.frame = anim.current.frame === 6 ? 7 : 6;
      else if (moving) anim.current.frame = 2 + ((anim.current.frame + 1) % 4);
      else anim.current.frame = (anim.current.frame + 1) % 2;
    }
    const map = material.current?.map as Texture | null;
    if (map) setSpriteFrame(map, anim.current.frame);

    const tall = tallOf(entity);
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
  });

  return (
    <group ref={group}>
      <sprite ref={sprite} renderOrder={1}>
        <spriteMaterial ref={material} map={sheet} transparent alphaTest={0.25} depthWrite={false} depthTest />
      </sprite>
    </group>
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
    const barY = tallOf(entity) + 0.62;
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
  });

  return (
    <group ref={group}>
      <sprite ref={bar} renderOrder={40}>
        <spriteMaterial color="#1a1010" depthTest={false} depthWrite={false} transparent opacity={0.95} />
      </sprite>
      <sprite ref={fill} renderOrder={41}>
        <spriteMaterial color="#8fdb67" depthTest={false} depthWrite={false} transparent />
      </sprite>
    </group>
  );
}

registerEntityView("default", function UnusedDefault() {
  return null;
});
