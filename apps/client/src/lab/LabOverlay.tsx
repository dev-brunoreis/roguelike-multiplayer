import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import { CanvasTexture, InstancedMesh, LinearFilter, Object3D, PlaneGeometry, RingGeometry, SRGBColorSpace } from "three";
import type { Snapshot } from "@game/shared/protocol";
import { drawnBoxes } from "../game/drawn.js";

export interface LabMark {
  x: number;
  y: number;
  radius: number;
  color: string;
}

const dummy = new Object3D();
const labels = new Map<string, CanvasTexture>();

function labelTexture(text: string) {
  const cached = labels.get(text);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f3ecdf";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 16);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  labels.set(text, texture);
  return texture;
}

function gridPositions(size: number) {
  const half = size / 2;
  const coords: number[] = [];
  for (let i = Math.ceil(-half); i <= half; i += 1) {
    coords.push(i, 0.04, -half, i, 0.04, half);
    coords.push(-half, 0.04, i, half, 0.04, i);
  }
  return new Float32Array(coords);
}

export function LabOverlay({
  snapRef,
  size,
  show,
  marks,
}: {
  snapRef: MutableRefObject<Snapshot | null>;
  size: number;
  show: boolean;
  marks: LabMark[];
}) {
  const positions = useMemo(() => gridPositions(size), [size]);
  const ring = useMemo(() => new RingGeometry(0.94, 1, 32), []);
  const box = useMemo(() => new PlaneGeometry(1, 1), []);
  const body = useRef<InstancedMesh>(null);
  const reach = useRef<InstancedMesh>(null);
  const skill = useRef<InstancedMesh>(null);
  const boxes = useRef<InstancedMesh>(null);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const half = Math.floor(size / 2);
  const ticks: number[] = [];
  for (let i = -half; i <= half; i += 2) ticks.push(i);

  useFrame(({ camera }) => {
    if (!show) return;
    const snap = snapRef.current;
    const paint = (mesh: InstancedMesh | null, items: { x: number; y: number; radius: number }[]) => {
      if (!mesh) return;
      items.forEach((item, index) => {
        if (index >= 64) return;
        dummy.position.set(item.x, 0.06, item.y);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(item.radius, item.radius, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.count = Math.min(64, items.length);
      mesh.instanceMatrix.needsUpdate = true;
    };
    const entities = snap?.entities ?? [];
    paint(body.current, entities.map((entity) => ({ x: entity.x, y: entity.y, radius: entity.radius })));
    paint(reach.current, entities.filter((entity) => entity.attackRange > 0.05).map((entity) => ({
      x: entity.x,
      y: entity.y,
      radius: entity.attackRange,
    })));
    paint(skill.current, marksRef.current);
    const drawn = drawnBoxes();
    if (boxes.current) {
      drawn.forEach((box, index) => {
        if (index >= 96) return;
        dummy.position.set(box.x, box.kind === "entity" ? box.tall / 2 : 0.7, box.y);
        dummy.quaternion.copy(camera.quaternion);
        dummy.scale.set(box.wide, box.tall, 1);
        dummy.updateMatrix();
        boxes.current!.setMatrixAt(index, dummy.matrix);
      });
      boxes.current.count = Math.min(96, drawn.length);
      boxes.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (!show) return null;
  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#4a4034" transparent opacity={0.45} />
      </lineSegments>
      {ticks.map((tick) => (
        <sprite key={`x${tick}`} position={[tick, 0.2, 0.35]} scale={[0.7, 0.35, 1]}>
          <spriteMaterial map={labelTexture(String(tick))} transparent depthWrite={false} />
        </sprite>
      ))}
      <instancedMesh ref={body} args={[ring, undefined, 64]} frustumCulled={false}>
        <meshBasicMaterial color="#f3ecdf" transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={reach} args={[ring, undefined, 64]} frustumCulled={false}>
        <meshBasicMaterial color="#e6c15a" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={skill} args={[ring, undefined, 64]} frustumCulled={false}>
        <meshBasicMaterial color="#e07a3d" transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[box, undefined, 96]} frustumCulled={false}>
        <meshBasicMaterial color="#7dce6a" wireframe transparent opacity={0.9} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
