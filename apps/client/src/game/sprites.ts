import { CanvasTexture, ClampToEdgeWrapping, NearestFilter, RepeatWrapping, SRGBColorSpace, Texture } from "three";

export const SHEET_FRAMES = 6;
const SIZE = 24;

type Draw = (ctx: CanvasRenderingContext2D, frame: number, pal: Palette) => void;

interface Palette {
  ink: string;
  fill: string;
  dark: string;
  light: string;
  skin: string;
  metal: string;
  white: string;
}

const cache = new Map<string, Texture>();

function mix(hex: string, other: string, t: number) {
  const a = parse(hex);
  const b = parse(other);
  const n = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * t);
  return `#${[n(0), n(1), n(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parse(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function palette(fill: string): Palette {
  return {
    ink: "#1b1410",
    fill,
    dark: mix(fill, "#000000", 0.38),
    light: mix(fill, "#fff4e0", 0.42),
    skin: "#e8b894",
    metal: "#d5c7a1",
    white: "#f4efe4",
  };
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function bob(frame: number) {
  if (frame < 2) return frame;
  return frame === 3 || frame === 5 ? 1 : 0;
}

function stride(frame: number) {
  if (frame < 2) return 0;
  return frame === 3 || frame === 4 ? 1 : 0;
}

function humanoid(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  const y = 3 - bob(frame);
  const step = stride(frame);
  px(ctx, 8, 17 + y, pal.dark, 3, 5 - step);
  px(ctx, 13, 17 + y + step, pal.dark, 3, 5 - step);
  px(ctx, 7, 10 + y, pal.fill, 10, 8);
  px(ctx, 7, 10 + y, pal.light, 10, 3);
  px(ctx, 8, 4 + y, pal.skin, 8, 7);
  px(ctx, 8, 4 + y, pal.ink, 8, 2);
  px(ctx, 10, 7 + y, pal.ink);
  px(ctx, 13, 7 + y, pal.ink);
  px(ctx, 5, 12 + y + (frame >= 2 ? step : 0), pal.skin, 2, 4);
}

function guerreiro(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  humanoid(ctx, frame, pal);
  const y = 3 - bob(frame);
  px(ctx, 16, 6 + y, pal.metal, 2, 12);
  px(ctx, 15, 5 + y, pal.light, 4, 3);
  px(ctx, 8, 9 + y, pal.metal, 8, 2);
}

function mago(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  humanoid(ctx, frame, pal);
  const y = 3 - bob(frame);
  px(ctx, 7, 2 + y, pal.fill, 10, 4);
  px(ctx, 10, 0 + y, pal.fill, 4, 3);
  px(ctx, 10, 0 + y, pal.light, 4, 1);
  px(ctx, 17, 8 + y, pal.metal, 2, 13);
  px(ctx, 16, 7 + y, pal.white, 4, 2);
}

function arqueiro(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  humanoid(ctx, frame, pal);
  const y = 3 - bob(frame);
  px(ctx, 17, 8 + y, pal.ink, 1, 10);
  px(ctx, 16, 8 + y, pal.metal, 1, 2);
  px(ctx, 16, 16 + y, pal.metal, 1, 2);
  px(ctx, 18, 11 + y, pal.metal, 4, 1);
}

function piromante(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  humanoid(ctx, frame, pal);
  const y = 3 - bob(frame);
  const flare = frame % 2;
  px(ctx, 8, 1 + y, "#f0a202", 8, 4);
  px(ctx, 10, 0 + y - flare, "#ffcf70", 4, 3);
  px(ctx, 16, 12 + y, "#f0a202", 3, 3 + flare);
}

function slime(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  const squash = frame === 1 || frame === 4 ? 1 : 0;
  const y = 8 + squash;
  px(ctx, 5, y + 2, pal.ink, 14, 12 - squash);
  px(ctx, 6, y + 3, pal.fill, 12, 10 - squash);
  px(ctx, 7, y + 4, pal.light, 10, 3);
  px(ctx, 8, y + 6, pal.ink, 2, 2);
  px(ctx, 14, y + 6, pal.ink, 2, 2);
  px(ctx, 10, y + 9, pal.dark, 4, 2);
}

function bruto(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  const y = 2 - bob(frame);
  const step = stride(frame);
  px(ctx, 5, 16 + y, pal.dark, 5, 6 - step);
  px(ctx, 14, 16 + y + step, pal.dark, 5, 6 - step);
  px(ctx, 4, 8 + y, pal.fill, 16, 10);
  px(ctx, 4, 8 + y, pal.light, 16, 3);
  px(ctx, 7, 3 + y, pal.skin, 10, 7);
  px(ctx, 7, 3 + y, pal.ink, 10, 2);
  px(ctx, 9, 6 + y, pal.ink, 2, 2);
  px(ctx, 14, 6 + y, pal.ink, 2, 2);
}

function corredor(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  const y = 5 - bob(frame);
  const lean = frame >= 2 ? 2 : 0;
  px(ctx, 8 + lean, 16 + y, pal.dark, 2, 6);
  px(ctx, 13 + lean, 16 + y - (frame % 2), pal.dark, 2, 6);
  px(ctx, 8 + lean, 9 + y, pal.fill, 8, 8);
  px(ctx, 9 + lean, 4 + y, pal.skin, 6, 6);
  px(ctx, 10 + lean, 6 + y, pal.ink);
  px(ctx, 13 + lean, 6 + y, pal.ink);
}

function golem(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  const y = 1 - (frame % 2);
  px(ctx, 3, 6 + y, pal.dark, 18, 16);
  px(ctx, 4, 7 + y, pal.fill, 16, 14);
  px(ctx, 6, 8 + y, pal.light, 6, 4);
  px(ctx, 8, 10 + y, pal.ink, 2, 2);
  px(ctx, 14, 10 + y, pal.ink, 2, 2);
  px(ctx, 9, 14 + y, pal.ink, 6, 2);
}

function olho(ctx: CanvasRenderingContext2D, frame: number, pal: Palette) {
  const blink = frame === 1;
  px(ctx, 4, 6, pal.ink, 16, 14);
  px(ctx, 5, 7, pal.fill, 14, 12);
  px(ctx, 6, 8, pal.white, 12, 10);
  if (blink) {
    px(ctx, 6, 12, pal.ink, 12, 2);
  } else {
    px(ctx, 9, 10, pal.ink, 6, 6);
    px(ctx, 11, 12, pal.white, 2, 2);
  }
}

const DRAWS: Record<string, Draw> = {
  guerreiro,
  mago,
  arqueiro,
  piromante,
  slime,
  bruto,
  corredor,
  boss_golem: golem,
  boss_olho: olho,
};

function paint(id: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * SHEET_FRAMES;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  const pal = palette(color);
  const draw = DRAWS[id] ?? slime;
  for (let frame = 0; frame < SHEET_FRAMES; frame += 1) {
    ctx.save();
    ctx.translate(frame * SIZE, 0);
    draw(ctx, frame, pal);
    ctx.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.repeat.set(1 / SHEET_FRAMES, 1);
  texture.needsUpdate = true;
  return texture;
}

export function spriteSheet(view: string, color: string) {
  const key = `${view}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const texture = paint(view, color);
  cache.set(key, texture);
  return texture;
}

export function cloneSheet(view: string, color: string) {
  const sheet = spriteSheet(view, color).clone();
  sheet.repeat.set(1 / SHEET_FRAMES, 1);
  sheet.offset.set(0, 0);
  return sheet;
}

export function setSpriteFrame(texture: Texture, frame: number) {
  texture.offset.x = (frame % SHEET_FRAMES) / SHEET_FRAMES;
}
