import { vfxVisualSchema, type VfxVisual } from "@game/shared";
import { CanvasTexture, NearestFilter, SRGBColorSpace, Texture, TextureLoader } from "three";
import raw from "../../../../packages/game-data/data/visual/vfx.json";
import { shotTexture, type ShotShape } from "./sprites.js";

export interface VfxDef {
  id: string;
  frames: number;
  fps: number;
  loop: boolean;
  wide: number;
  tall: number;
  tint: boolean;
  aim: boolean;
  sheet: string;
  builtin?: ShotShape;
}

const defs = new Map<string, VfxDef>();

export function registerVfx(def: VfxDef) {
  defs.set(def.id, def);
}

export function vfxDef(id: string) {
  return defs.get(id) ?? defs.get("orb")!;
}

export function vfxIds() {
  return [...defs.keys()];
}

let byAbility: Record<string, string> = {};
let fxKind: Record<string, string> = {};
let bolt = { vfx: "ray", tall: 0.42 };
const sheets = new Map<string, string>();

export function boltLook() {
  return bolt;
}

export function applyVfx(data: VfxVisual) {
  defs.clear();
  for (const def of data.defs) {
    const prev = sheets.get(def.id);
    if (prev != null && prev !== def.sheet) textures.delete(def.id);
    sheets.set(def.id, def.sheet);
    defs.set(def.id, def);
  }
  byAbility = { ...data.byAbility };
  fxKind = { ...data.fxKind };
  bolt = { ...data.bolt };
}

export function vfxForShot(shot: { vfx: string; abilityId: string }) {
  if (shot.vfx && defs.has(shot.vfx)) return shot.vfx;
  return byAbility[shot.abilityId] ?? "orb";
}

export function vfxForFx(kind: string) {
  return fxKind[kind] ?? fxKind.default ?? "explosion";
}

export interface VfxPreview {
  id: string;
  x: number;
  y: number;
  scale: number;
}

let preview: VfxPreview[] = [];

export function setVfxPreview(items: VfxPreview[]) {
  preview = items;
}

export function vfxPreview() {
  return preview;
}

const textures = new Map<string, Texture>();

applyVfx(vfxVisualSchema.parse(raw));
const loader = new TextureLoader();

export function vfxTexture(def: VfxDef) {
  if (def.builtin) return shotTexture(def.builtin);
  const cached = textures.get(def.id);
  if (cached) return cached;
  const texture = loader.load(def.sheet);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  textures.set(def.id, texture);
  return texture;
}

export function blankTexture() {
  const cached = textures.get("blank");
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 2, 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  textures.set("blank", texture);
  return texture;
}
