import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import {
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  BoxGeometry,
  type Texture,
} from "three";
import type { Snapshot } from "@game/shared/protocol";
import { inView } from "./frame.js";
import { motionAt } from "./motion.js";
import { vfxDef, vfxForFx, vfxForShot, vfxTexture, type VfxDef } from "./vfx.js";

const MAX = 256;
const dummy = new Object3D();
const tint = new Color();

interface Strip {
  mesh: InstancedMesh;
  frames: InstancedBufferAttribute;
  def: VfxDef;
}

function stripMaterial(map: Texture, frames: number) {
  const material = new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexColors: true,
  });
  material.customProgramCacheKey = () => `strip-${frames}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.frameCount = { value: frames };
    shader.vertexShader = shader.vertexShader
      .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nattribute float aFrame;\nvarying float vFrame;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFrame = aFrame;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <uv_pars_fragment>", "#include <uv_pars_fragment>\nvarying float vFrame;\nuniform float frameCount;")
      .replace(
        "vec4 sampledDiffuseColor = texture2D( map, vMapUv );",
        "vec2 stripUv = vMapUv;\nstripUv.x = (vMapUv.x + vFrame) / frameCount;\nvec4 sampledDiffuseColor = texture2D( map, stripUv );",
      );
  };
  return material;
}

function makeStrip(def: VfxDef) {
  const geometry = new PlaneGeometry(1, 1);
  const frames = new InstancedBufferAttribute(new Float32Array(MAX), 1);
  geometry.setAttribute("aFrame", frames);
  const mesh = new InstancedMesh(geometry, stripMaterial(vfxTexture(def), def.frames), MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  return { mesh, frames, def };
}

export function VfxField({ snapRef }: { snapRef: MutableRefObject<Snapshot | null> }) {
  const root = useRef<Group>(null);
  const strips = useRef(new Map<string, Strip>());
  const rings = useRef<InstancedMesh>(null);
  const bolts = useRef<InstancedMesh>(null);
  const ringGeo = useMemo(() => new RingGeometry(0.72, 1, 28), []);
  const boxGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);

  useFrame(({ camera, clock }) => {
    const snap = snapRef.current;
    const group = root.current;
    if (!snap || !group) return;
    const now = performance.now() / 1000;
    const used = new Map<string, number>();
    const put = (id: string, x: number, z: number, y: number, wide: number, tall: number, frame: number, color: string, spin: number) => {
      let strip = strips.current.get(id);
      if (!strip) {
        const def = vfxDef(id);
        strip = makeStrip(def);
        strips.current.set(id, strip);
        group.add(strip.mesh);
      }
      const index = used.get(id) ?? 0;
      if (index >= MAX) return;
      used.set(id, index + 1);
      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camera.quaternion);
      if (spin) dummy.rotateZ(spin);
      dummy.scale.set(wide, tall, 1);
      dummy.updateMatrix();
      strip.mesh.setMatrixAt(index, dummy.matrix);
      strip.mesh.setColorAt(index, tint.set(color));
      strip.frames.setX(index, frame);
    };
    const frameOf = (def: VfxDef, life: number) => {
      if (def.frames <= 1) return 0;
      const raw = def.loop ? clock.elapsedTime * def.fps : life * def.frames;
      const index = Math.floor(raw);
      return def.loop ? ((index % def.frames) + def.frames) % def.frames : Math.min(def.frames - 1, Math.max(0, index));
    };
    for (const shot of snap.projectiles) {
      if (!inView(shot.x, shot.y)) continue;
      const placed = motionAt(shot.id, now);
      const x = placed?.x ?? shot.x;
      const z = placed?.y ?? shot.y;
      const id = vfxForShot(shot);
      const def = vfxDef(id);
      const screenX = shot.vx - shot.vy;
      const screenY = -0.75 * (shot.vx + shot.vy);
      put(id, x, z, 0.55, def.wide, def.tall, frameOf(def, 0), def.tint ? shot.color : "#ffffff", def.aim ? Math.atan2(screenY, screenX) : 0);
    }
    for (const zone of snap.zones) {
      if (!inView(zone.x, zone.y)) continue;
      const placed = motionAt(zone.id, now);
      const named = zone.vfx && vfxDef(zone.vfx).id === zone.vfx ? zone.vfx : "fire";
      const def = vfxDef(named);
      const size = Math.max(def.wide, zone.radius * 1.3);
      put(def.id, placed?.x ?? zone.x, placed?.y ?? zone.y, 0.4, size, size, frameOf(def, zone.t), def.tint ? zone.color : "#ffffff", 0);
    }
    let boltsN = 0;
    for (const fx of snap.fx) {
      if (!inView(fx.x, fx.y)) continue;
      if (fx.kind === "bolt" && fx.x2 != null && fx.y2 != null && bolts.current && boltsN < MAX) {
        const dx = fx.x2 - fx.x;
        const dz = fx.y2 - fx.y;
        const len = Math.hypot(dx, dz) || 0.2;
        dummy.position.set((fx.x + fx.x2) / 2, 0.62, (fx.y + fx.y2) / 2);
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
        dummy.scale.set(0.16, 0.16, len);
        dummy.updateMatrix();
        bolts.current.setMatrixAt(boltsN, dummy.matrix);
        bolts.current.setColorAt(boltsN, tint.set(fx.color));
        boltsN += 1;
        continue;
      }
      const id = vfxForFx(fx.kind);
      const def = vfxDef(id);
      const size = Math.max(0.4, fx.radius) * (0.7 + fx.t);
      put(id, fx.x, fx.y, fx.kind === "ring" || fx.kind === "cone" ? 0.25 : 0.6, size, size, frameOf(def, fx.t), "#ffffff", 0);
    }
    let ringsN = 0;
    const ring = rings.current;
    for (const warning of snap.warnings) {
      if (!ring || !inView(warning.x, warning.y) || ringsN >= MAX) continue;
      if (warning.shape === "line") {
        const dx = warning.x2 - warning.x;
        const dz = warning.y2 - warning.y;
        const len = Math.hypot(dx, dz) || 0.2;
        dummy.position.set((warning.x + warning.x2) / 2, 0.08, (warning.y + warning.y2) / 2);
        dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
        dummy.scale.set(len, Math.max(0.35, warning.radius * (0.4 + warning.t)), 1);
      } else {
        const span = warning.radius * (0.35 + warning.t * 0.7);
        dummy.position.set(warning.x, 0.08, warning.y);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(span, span, 1);
      }
      dummy.updateMatrix();
      ring.setMatrixAt(ringsN, dummy.matrix);
      ring.setColorAt(ringsN, tint.set("#ff5a4a"));
      ringsN += 1;
    }
    if (ring) {
      ring.count = ringsN;
      ring.instanceMatrix.needsUpdate = true;
      if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
    }
    if (bolts.current) {
      bolts.current.count = boltsN;
      bolts.current.instanceMatrix.needsUpdate = true;
      if (bolts.current.instanceColor) bolts.current.instanceColor.needsUpdate = true;
    }
    for (const [id, strip] of strips.current) {
      const count = used.get(id) ?? 0;
      strip.mesh.count = count;
      strip.mesh.instanceMatrix.needsUpdate = true;
      if (strip.mesh.instanceColor) strip.mesh.instanceColor.needsUpdate = true;
      strip.frames.needsUpdate = true;
    }
  });

  return (
    <group ref={root}>
      <instancedMesh ref={rings} args={[ringGeo, undefined, MAX]} frustumCulled={false} renderOrder={7}>
        <meshBasicMaterial transparent depthWrite={false} opacity={0.55} toneMapped={false} vertexColors />
      </instancedMesh>
      <instancedMesh ref={bolts} args={[boxGeo, undefined, MAX]} frustumCulled={false} renderOrder={9}>
        <meshBasicMaterial transparent depthWrite={false} opacity={0.9} toneMapped={false} vertexColors />
      </instancedMesh>
    </group>
  );
}
