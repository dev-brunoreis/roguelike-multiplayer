import { CanvasTexture, NearestFilter, SRGBColorSpace, Texture } from "three";

const labels = new Map<string, Texture>();
const floats = new Map<string, Texture>();

function textureOf(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function labelTexture(text: string, color: string, hero: boolean) {
  const key = `${hero ? "h" : "c"}|${color}|${text}`;
  const cached = labels.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return textureOf(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = hero ? "bold 28px sans-serif" : "22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text.slice(0, 18), 128, 24);
  const texture = textureOf(canvas);
  labels.set(key, texture);
  return texture;
}

export function floatTexture(text: string, tone: "dealt" | "taken" | "other", crit: boolean) {
  const key = `${tone}|${crit ? "c" : "n"}|${text}`;
  const cached = floats.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return textureOf(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = crit ? "bold 36px sans-serif" : "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = tone === "taken" ? "#e23d3d" : crit ? "#e6c15a" : "#f4efe4";
  ctx.fillText(text.slice(0, 12), 96, crit ? 24 : 32);
  if (crit) {
    ctx.font = "16px sans-serif";
    ctx.fillText("crítico", 96, 50);
  }
  const texture = textureOf(canvas);
  floats.set(key, texture);
  return texture;
}
