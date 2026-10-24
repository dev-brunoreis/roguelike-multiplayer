import { CanvasTexture, NearestFilter, SRGBColorSpace, Texture, TextureLoader } from "three";
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

const BY_ABILITY: Record<string, string> = {
  flecha: "arrow",
  lanca: "spear",
  dardo: "dart",
  chuva_meteoros: "fireball",
  granizo: "ice",
  pisao: "explosion",
  rastro_fogo: "fire",
  chao_chamas: "fire",
  lamina_bumerangue: "arrow",
};

export function vfxForShot(shot: { vfx: string; abilityId: string }) {
  if (shot.vfx && defs.has(shot.vfx)) return shot.vfx;
  return BY_ABILITY[shot.abilityId] ?? "orb";
}

export function vfxForFx(kind: string) {
  if (kind === "flash" || kind === "slash") return "hit";
  return "explosion";
}

function builtin(id: string, shape: ShotShape, wide: number, tall: number, aim: boolean): VfxDef {
  return { id, frames: 1, fps: 1, loop: true, wide, tall, tint: true, aim, sheet: "", builtin: shape };
}

function strip(id: string, file: string, frames: number, fps: number, loop: boolean, size: number, aim = false): VfxDef {
  return {
    id,
    frames,
    fps,
    loop,
    wide: size,
    tall: size,
    tint: false,
    aim,
    sheet: `/sprites/vfx/spritepilot/${file}`,
  };
}

registerVfx(builtin("orb", "orb", 0.42, 0.42, false));
registerVfx(builtin("arrow", "arrow", 0.78, 0.34, true));
registerVfx(builtin("spear", "spear", 1.05, 0.26, true));
registerVfx(builtin("dart", "dart", 0.58, 0.2, true));
registerVfx(strip("explosion", "explosion-32px_strip10.png", 10, 14, false, 1.5));
registerVfx(strip("hit", "hit-spark-32px_strip6.png", 6, 15, false, 0.9));
registerVfx(strip("fire", "fire-32px_strip8.png", 8, 10, true, 0.85));
registerVfx(strip("sparkle", "magic-sparkle-32px_strip8.png", 8, 10, true, 0.7));
registerVfx(strip("fireball", "fireball-32px_strip8.png", 8, 12, true, 0.72, true));
registerVfx(strip("ice", "ice-shard-32px_strip8.png", 8, 12, true, 0.7, true));
registerVfx(strip("orb-magic", "energy-orb-32px_strip8.png", 8, 12, true, 0.62));
registerVfx(strip("lightning", "lightning-strike-32px_strip8.png", 8, 15, false, 1.3));
registerVfx(strip("poison", "poison-cloud-32px_strip8.png", 8, 8, true, 1.2));
registerVfx(strip("heal", "healing-aura-32px_strip8.png", 8, 10, true, 1.1));
registerVfx({
  id: "rock",
  frames: 1,
  fps: 1,
  loop: true,
  wide: 0.46,
  tall: 0.46,
  tint: true,
  aim: false,
  sheet: "/sprites/vfx/devwizard/Rock Sling.png",
});
registerVfx({
  id: "ray",
  frames: 8,
  fps: 12,
  loop: true,
  wide: 0.9,
  tall: 0.28,
  tint: true,
  aim: true,
  sheet: "/sprites/vfx/devwizard/Black And White Ray.png",
});

const textures = new Map<string, Texture>();
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
