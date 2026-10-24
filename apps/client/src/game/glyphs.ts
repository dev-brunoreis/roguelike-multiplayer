import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Texture } from "three";

export const CAMERA_ZOOM = 22;

const LABEL_W = 256;
const LABEL_H = 56;
const LABEL_PX = 0.4;
const FLOAT_W = 256;
const FLOAT_H = 88;
const FLOAT_PX = 0.44;

export const LABEL_SCALE: [number, number] = [LABEL_W * LABEL_PX / CAMERA_ZOOM, LABEL_H * LABEL_PX / CAMERA_ZOOM];
export const FLOAT_SCALE: [number, number] = [FLOAT_W * FLOAT_PX / CAMERA_ZOOM, FLOAT_H * FLOAT_PX / CAMERA_ZOOM];

const labels = new Map<string, Texture>();
const floats = new Map<string, Texture>();

function textureOf(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function inked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, outline: number) {
  ctx.lineJoin = "round";
  ctx.lineWidth = outline;
  ctx.strokeStyle = "#120d09";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

export function labelTexture(text: string, color: string, hero: boolean, mine: boolean) {
  const key = `${mine ? "m" : hero ? "h" : "c"}|${color}|${text}`;
  const cached = labels.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return textureOf(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = mine ? "800 32px sans-serif" : hero ? "bold 30px sans-serif" : "600 25px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  const shown = text.slice(0, 18);
  if (mine) {
    ctx.lineJoin = "round";
    ctx.lineWidth = 11;
    ctx.strokeStyle = "#fff6e4";
    ctx.strokeText(shown, LABEL_W / 2, LABEL_H / 2);
  }
  inked(ctx, shown, LABEL_W / 2, LABEL_H / 2, 6);
  const texture = textureOf(canvas);
  labels.set(key, texture);
  return texture;
}

export function floatTexture(text: string, tone: "dealt" | "taken" | "other", crit: boolean) {
  const key = `${tone}|${crit ? "c" : "n"}|${text}`;
  const cached = floats.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = FLOAT_W;
  canvas.height = FLOAT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return textureOf(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = crit ? "900 42px sans-serif" : "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = tone === "taken" ? "#ff4a3d" : crit ? "#ffcf5a" : "#f7f1e4";
  inked(ctx, text.slice(0, 12), FLOAT_W / 2, crit ? 32 : FLOAT_H / 2, 7);
  if (crit) {
    ctx.font = "bold 20px sans-serif";
    inked(ctx, "crítico", FLOAT_W / 2, 68, 5);
  }
  const texture = textureOf(canvas);
  floats.set(key, texture);
  return texture;
}
