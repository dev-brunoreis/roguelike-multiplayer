import { useMemo } from "react";
import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace, type CanvasTexture as CanvasTextureType } from "three";

const floors = new Map<string, CanvasTextureType>();
let voidTex: CanvasTextureType | null = null;

function paintFloor(ctx: CanvasRenderingContext2D, kind: string) {
  const base = kind === "hub" ? "#3d4a38" : kind === "duel" ? "#3a241c" : kind === "boss" ? "#4a2424" : kind === "room" ? "#3a3348" : kind === "cave" ? "#2a2434" : "#4a3c2e";
  const light = kind === "hub" ? "#52664a" : kind === "duel" ? "#5a3428" : kind === "boss" ? "#6a3834" : kind === "room" ? "#514868" : kind === "cave" ? "#3a3248" : "#5c4b3a";
  const dark = kind === "hub" ? "#2c382a" : kind === "duel" ? "#241612" : kind === "boss" ? "#2a1414" : kind === "room" ? "#241e30" : kind === "cave" ? "#1a1622" : "#32281e";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      const n = (x * 13 + y * 17) % 11;
      ctx.fillStyle = n < 3 ? dark : n > 8 ? light : base;
      ctx.fillRect(x + 1, y + 1, 6, 6);
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 64; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, 64);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(64, i + 0.5);
    ctx.stroke();
  }
  if (kind === "hub") {
    ctx.fillStyle = "#6f8a62";
    ctx.fillRect(4, 28, 3, 3);
    ctx.fillRect(40, 12, 2, 2);
    ctx.fillRect(22, 46, 3, 2);
  }
  if (kind === "duel") {
    ctx.strokeStyle = "#c46a3a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 18);
    ctx.lineTo(28, 26);
    ctx.lineTo(62, 14);
    ctx.moveTo(10, 48);
    ctx.lineTo(40, 40);
    ctx.lineTo(58, 52);
    ctx.stroke();
  }
  if (kind === "cave") {
    ctx.fillStyle = "#221c2c";
    ctx.fillRect(6, 18, 8, 4);
    ctx.fillRect(36, 8, 6, 5);
    ctx.fillRect(20, 44, 10, 3);
  }
  if (kind === "pve" || kind === "room") {
    ctx.fillStyle = kind === "room" ? "#3c3450" : "#3f5134";
    ctx.fillRect(12, 8, 4, 3);
    ctx.fillRect(44, 36, 5, 3);
    ctx.fillRect(20, 50, 3, 2);
  }
  if (kind === "boss") {
    ctx.fillStyle = "#6a3030";
    ctx.fillRect(8, 8, 6, 4);
    ctx.fillRect(40, 28, 8, 4);
    ctx.fillRect(18, 46, 5, 3);
  }
}

function textureFrom(paint: (ctx: CanvasRenderingContext2D) => void, repeat: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  paint(ctx);
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.repeat.set(repeat, repeat);
  tex.needsUpdate = true;
  return tex;
}

export function floorTexture(kind: string) {
  const key = kind === "hub" || kind === "duel" || kind === "room" || kind === "boss" || kind === "cave" ? kind : "pve";
  const cached = floors.get(key);
  if (cached) return cached;
  const tex = textureFrom((ctx) => paintFloor(ctx, key), key === "hub" ? 5 : 4);
  floors.set(key, tex);
  return tex;
}

export function voidTexture() {
  if (voidTex) return voidTex;
  voidTex = textureFrom((ctx) => {
    ctx.fillStyle = "#100e0c";
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 48; i += 1) {
      const x = (i * 17) % 64;
      const y = (i * 29) % 64;
      ctx.fillStyle = i % 3 === 0 ? "#1a1612" : "#0a0908";
      ctx.fillRect(x, y, 2, 2);
    }
  }, 16);
  return voidTex;
}

interface Bit {
  shape: "box" | "cyl" | "pad";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layout(id: string, size: number, kind: string): Bit[] {
  const rand = mulberry32(hash(`${kind}:${id}`));
  const bits: Bit[] = [];
  const span = size / 2 - 1.15;
  const count = kind === "hub" ? 8 : kind === "room" ? 0 : 11;
  const rock = kind === "duel" ? "#4a3028" : kind === "hub" ? "#5c564c" : "#6b5846";
  const wood = kind === "duel" ? "#3a2218" : "#4a3424";
  for (let i = 0; i < count; i += 1) {
    const edge = i % 4;
    const along = (rand() - 0.5) * span * 1.7;
    const inset = span - rand() * 0.8;
    const x = edge === 0 ? -inset : edge === 1 ? inset : along;
    const z = edge === 2 ? -inset : edge === 3 ? inset : along;
    const tall = kind === "hub" && i % 2 === 0;
    if (tall) {
      bits.push({
        shape: "box",
        position: [x, 0.85, z],
        rotation: [0, rand() * 0.4, 0],
        scale: [0.55, 1.7, 0.55],
        color: "#6a6258",
      });
      continue;
    }
    const stump = kind === "pve" && rand() > 0.55;
    bits.push({
      shape: stump ? "cyl" : "box",
      position: [x, stump ? 0.28 : 0.22, z],
      rotation: [0, rand() * Math.PI, 0],
      scale: stump ? [0.7, 0.55, 0.7] : [0.85 + rand() * 0.4, 0.38, 0.6 + rand() * 0.35],
      color: stump ? wood : rock,
    });
  }
  const tufts = kind === "duel" ? 4 : 7;
  const tuft = kind === "duel" ? "#6a3020" : kind === "hub" ? "#44563c" : "#3d5134";
  for (let i = 0; i < tufts; i += 1) {
    const reach = span * (0.25 + rand() * 0.55);
    const ang = rand() * Math.PI * 2;
    bits.push({
      shape: "pad",
      position: [Math.cos(ang) * reach, 0.03, Math.sin(ang) * reach],
      rotation: [-Math.PI / 2, 0, rand()],
      scale: [1.1 + rand(), 1, 0.7 + rand() * 0.6],
      color: tuft,
    });
  }
  if (kind === "hub") {
    const posts: Array<[number, number]> = [[6.2, 6.2], [-6.2, 6.2], [6.2, -6.2], [-6.2, -6.2]];
    for (const [x, z] of posts) {
      bits.push({
        shape: "cyl",
        position: [x, 0.35, z],
        rotation: [0, 0, 0],
        scale: [0.42, 0.7, 0.42],
        color: "#3a3228",
      });
      bits.push({
        shape: "box",
        position: [x, 0.78, z],
        rotation: [0, 0, 0],
        scale: [0.28, 0.22, 0.28],
        color: "#e07a3d",
      });
    }
  }
  if (kind === "duel") {
    bits.push({
      shape: "pad",
      position: [0, 0.025, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [3.2, 1, 3.2],
      color: "#2a1612",
    });
  }
  return bits;
}

export function ArenaDressing({ id, size, kind }: { id: string; size: number; kind: string }) {
  const bits = useMemo(() => layout(id, size, kind), [id, size, kind]);
  const rim = kind === "hub" ? "#6f8a62" : kind === "duel" ? "#c46a3a" : "#8a6f4c";
  const half = size / 2;
  const curbs: Array<[number, number, number, number]> = [
    [0, half, size, 0.22],
    [0, -half, size, 0.22],
    [half, 0, 0.22, size],
    [-half, 0, 0.22, size],
  ];
  return (
    <group>
      {curbs.map(([x, z, w, d]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.12, z]}>
          <boxGeometry args={[w, 0.24, d]} />
          <meshBasicMaterial color={rim} />
        </mesh>
      ))}
      {bits.map((bit, index) => (
        <mesh key={index} position={bit.position} rotation={bit.rotation} scale={bit.scale}>
          {bit.shape === "cyl" ? <cylinderGeometry args={[0.5, 0.62, 1, 6]} /> : null}
          {bit.shape === "pad" ? <planeGeometry args={[1, 1]} /> : null}
          {bit.shape === "box" ? <boxGeometry args={[1, 1, 1]} /> : null}
          <meshBasicMaterial color={bit.color} />
        </mesh>
      ))}
    </group>
  );
}

let moteTex: CanvasTextureType | null = null;

export function moteTexture() {
  if (moteTex) return moteTex;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  ctx.clearRect(0, 0, 4, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(1, 1, 2, 2);
  moteTex = new CanvasTexture(canvas);
  moteTex.magFilter = NearestFilter;
  moteTex.minFilter = NearestFilter;
  moteTex.colorSpace = SRGBColorSpace;
  moteTex.needsUpdate = true;
  return moteTex;
}

export interface MoteField {
  homes: Float32Array;
  positions: Float32Array;
  phases: Float32Array;
  speeds: Float32Array;
  wanders: Float32Array;
  lifts: Float32Array;
}

export function moteField(seed: number, count: number, span: number): MoteField {
  const rand = mulberry32(seed);
  const homes = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const wanders = new Float32Array(count);
  const lifts = new Float32Array(count);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = (span * 2) / cols;
    const cellZ = (span * 2) / rows;
    const x = -span + (col + 0.5) * cellX + (rand() - 0.5) * cellX * 0.65;
    const z = -span + (row + 0.5) * cellZ + (rand() - 0.5) * cellZ * 0.65;
    const y = 0.4 + rand() * 2.8;
    homes[i * 3] = x;
    homes[i * 3 + 1] = y;
    homes[i * 3 + 2] = z;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    phases[i] = rand() * Math.PI * 2;
    speeds[i] = 0.12 + rand() * 0.28;
    wanders[i] = 0.28 + rand() * 0.55;
    lifts[i] = 0.12 + rand() * 0.4;
  }
  return { homes, positions, phases, speeds, wanders, lifts };
}
