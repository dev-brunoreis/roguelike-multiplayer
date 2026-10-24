import { CanvasTexture, ClampToEdgeWrapping, NearestFilter, RepeatWrapping, SRGBColorSpace, Texture } from "three";

export type ClipName = "idle" | "run" | "attack" | "hit";

export interface ActorSheet {
  texture: Texture;
  frames: number;
  aspect: number;
  clips: Record<ClipName, [number, number]>;
}

type Rect = [number, number, number, number];
type Fx = "slash" | "flame" | "none";

interface PackActor {
  idle: string[];
  run: string[];
  hit: string[];
  fx: Fx;
}

const loading = new Map<string, Promise<ActorSheet>>();
let indexPromise: Promise<Map<string, Rect>> | null = null;
let imagePromise: Promise<HTMLImageElement> | null = null;

function quad(prefix: string, kind: "idle" | "run") {
  return [0, 1, 2, 3].map((frame) => `${prefix}_${kind}_anim_f${frame}`);
}

function loop(prefix: string) {
  return [0, 1, 2, 3].map((frame) => `${prefix}_anim_f${frame}`);
}

function hero(prefix: string, fx: Fx): PackActor {
  return {
    idle: quad(prefix, "idle"),
    run: quad(prefix, "run"),
    hit: [`${prefix}_hit_anim_f0`],
    fx,
  };
}

function creep(prefix: string, pattern: "split" | "loop", fx: Fx): PackActor {
  if (pattern === "loop") {
    const idle = loop(prefix);
    return { idle, run: idle, hit: [idle[0]!], fx };
  }
  const idle = quad(prefix, "idle");
  return { idle, run: quad(prefix, "run"), hit: [idle[0]!], fx };
}

const PACK: Record<string, PackActor> = {
  guerreiro: hero("knight_m", "slash"),
  mago: hero("wizzard_m", "slash"),
  arqueiro: hero("elf_f", "slash"),
  piromante: hero("wizzard_f", "flame"),
  lanceiro: hero("dwarf_m", "slash"),
  slime: creep("tiny_slug", "loop", "none"),
  bruto: creep("big_zombie", "split", "slash"),
  corredor: creep("goblin", "split", "slash"),
  atirador: creep("imp", "split", "none"),
  guarda: creep("orc_warrior", "split", "slash"),
  esqueleto: creep("skelet", "split", "slash"),
  lodo: creep("muddy", "loop", "none"),
  xama: creep("orc_shaman", "split", "flame"),
  diabrete: creep("chort", "split", "flame"),
  boss_golem: creep("ogre", "split", "slash"),
  boss_matriarca: creep("big_demon", "split", "slash"),
  boss_wogol: creep("wogol", "split", "flame"),
};

function atlasIndex() {
  indexPromise ??= fetch("/sprites/0x72/tile_list_v1.7")
    .then((res) => {
      if (!res.ok) throw new Error("tile list");
      return res.text();
    })
    .then((text) => {
      const map = new Map<string, Rect>();
      for (const line of text.split("\n")) {
        const [name, x, y, w, h] = line.trim().split(/\s+/);
        if (!name || h == null) continue;
        map.set(name, [Number(x), Number(y), Number(w), Number(h)]);
      }
      return map;
    });
  return indexPromise;
}

function atlasImage() {
  imagePromise ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("sprite sheet"));
    image.src = "/sprites/0x72/sheet.png";
  });
  return imagePromise;
}

function finish(canvas: HTMLCanvasElement, frames: number, clips: ActorSheet["clips"]): ActorSheet {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.repeat.set(1 / frames, 1);
  texture.needsUpdate = true;
  return {
    texture,
    frames,
    aspect: canvas.height === 0 ? 1 : (canvas.width / frames) / canvas.height,
    clips,
  };
}

function paintSlash(ctx: CanvasRenderingContext2D, destX: number, cellW: number, cellH: number, step: number) {
  const x = destX + Math.floor(cellW * 0.46) + step * 2;
  const y = Math.floor(cellH * 0.38) + (step > 1 ? 2 : 0);
  ctx.fillStyle = step === 3 ? "#fff6d8" : "#f7f1e4";
  ctx.fillRect(x, y, 2 + step, 1);
  ctx.fillStyle = "#e6d7a4";
  ctx.fillRect(x, y + 1, 1 + step, 1);
}

function paintFlame(ctx: CanvasRenderingContext2D, destX: number, cellW: number, cellH: number, step: number, big: boolean) {
  const x = destX + Math.floor(cellW * 0.58);
  const y = Math.floor(cellH * 0.34) - (step % 2);
  const h = (big ? 6 : 3) + (step % 2);
  ctx.fillStyle = "#c4481a";
  ctx.fillRect(x, y, big ? 3 : 2, h);
  ctx.fillStyle = "#f0a202";
  ctx.fillRect(x, y, big ? 3 : 2, Math.max(2, h - 2));
  ctx.fillStyle = "#fff0c2";
  ctx.fillRect(x, y, 1, 2);
}

async function sheetFromPack(spec: PackActor): Promise<ActorSheet> {
  const index = await atlasIndex();
  const image = await atlasImage();
  const attack = [...spec.run.slice(0, 3), spec.hit[0] ?? spec.run[0]!];
  const order: { name: string; fx: Fx | "body" }[] = [
    ...spec.idle.map((name) => ({ name, fx: spec.fx === "flame" ? "flame" as const : "body" as const })),
    ...spec.run.map((name) => ({ name, fx: spec.fx === "flame" ? "flame" as const : "body" as const })),
    ...attack.map((name) => ({ name, fx: spec.fx === "none" ? "body" as const : spec.fx })),
    ...spec.hit.map((name) => ({ name, fx: "body" as const })),
  ];
  const rects = order.map((item) => index.get(item.name) ?? [0, 0, 16, 16] as Rect);
  const maxW = Math.max(...rects.map((rect) => rect[2]));
  const maxH = Math.max(...rects.map((rect) => rect[3]));
  const pad = 6;
  const cellW = maxW + pad * 2;
  const cellH = maxH;
  const canvas = document.createElement("canvas");
  canvas.width = cellW * order.length;
  canvas.height = cellH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  order.forEach((item, frame) => {
    const rect = rects[frame]!;
    const destX = frame * cellW;
    const dx = destX + pad + Math.floor((maxW - rect[2]) / 2);
    const dy = cellH - rect[3];
    ctx.drawImage(image, rect[0], rect[1], rect[2], rect[3], dx, dy, rect[2], rect[3]);
    if (item.fx === "slash") paintSlash(ctx, destX, cellW, cellH, frame % 4);
    if (item.fx === "flame") paintFlame(ctx, destX, cellW, cellH, frame, frame >= spec.idle.length + spec.run.length);
  });
  const idleCount = spec.idle.length;
  const runCount = spec.run.length;
  return finish(canvas, order.length, {
    idle: [0, idleCount],
    run: [idleCount, runCount],
    attack: [idleCount + runCount, attack.length],
    hit: [idleCount + runCount + attack.length, spec.hit.length],
  });
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawBat(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number, attack: boolean) {
  const flap = [0, 1, 2, 1][frame % 4] ?? 0;
  const lift = flap === 0 ? -2 : flap === 2 ? 2 : 0;
  const bite = attack ? 2 : 0;
  const ink = "#140e18";
  const wing = "#3a2754";
  const body = "#6b4c8a";
  const light = "#cbb6e6";
  px(ctx, ox + 1, oy + 7 + lift, ink, 5, 3);
  px(ctx, ox + 10, oy + 7 + lift, ink, 5, 3);
  px(ctx, ox + 2, oy + 8 + lift, wing, 4, 2);
  px(ctx, ox + 10, oy + 8 + lift, wing, 4, 2);
  px(ctx, ox + 5, oy + 6, ink, 6, 6);
  px(ctx, ox + 6, oy + 7, body, 4 + bite, 4);
  px(ctx, ox + 6, oy + 7, light, 3, 1);
  px(ctx, ox + 6, oy + 8, "#f4efe4", 1, 1);
  px(ctx, ox + 9, oy + 8, "#f4efe4", 1, 1);
  px(ctx, ox + 6, oy + 9, "#1b1410", 1, 1);
  px(ctx, ox + 9, oy + 9, "#1b1410", 1, 1);
  if (attack) px(ctx, ox + 11, oy + 9, "#e7d7a4", 3, 1);
}

function drawSpider(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number, attack: boolean) {
  const step = frame % 2;
  const ink = "#14210f";
  const body = "#3d6b3a";
  const light = "#7dce6a";
  px(ctx, ox + 1, oy + 6 + step, ink, 4, 1);
  px(ctx, ox + 11, oy + 6 + (1 - step), ink, 4, 1);
  px(ctx, ox + 2, oy + 10 + (1 - step), ink, 3, 1);
  px(ctx, ox + 11, oy + 10 + step, ink, 3, 1);
  px(ctx, ox + 1, oy + 13, ink, 3, 1);
  px(ctx, ox + 12, oy + 13, ink, 3, 1);
  px(ctx, ox + 5, oy + 6, ink, 6, 7);
  px(ctx, ox + 6, oy + 7, body, 4, 5);
  px(ctx, ox + 6, oy + 7, light, 3, 2);
  px(ctx, ox + 6, oy + 9, "#f4efe4", 1, 1);
  px(ctx, ox + 9, oy + 9, "#f4efe4", 1, 1);
  if (attack) px(ctx, ox + 11, oy + 8, "#e7d7a4", 4, 1);
}

function oval(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let y = -ry; y <= ry; y += 1) {
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    px(ctx, cx - span, cy + y, color, span * 2 + 1, 1);
  }
}

function drawEye(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number, attack: boolean) {
  const blink = !attack && frame % 4 === 3;
  const look = attack ? 3 : (frame % 4) - 1;
  oval(ctx, ox + 16, oy + 16, 14, 12, "#1b1410");
  oval(ctx, ox + 16, oy + 16, 13, 11, "#f4efe4");
  oval(ctx, ox + 16, oy + 15, 8, 4, "#f7f1e4");
  if (blink) {
    px(ctx, ox + 4, oy + 15, "#1b1410", 24, 3);
    return;
  }
  oval(ctx, ox + 16 + look, oy + 16, 6, 6, "#c9a227");
  oval(ctx, ox + 16 + look, oy + 16, 3, 3, "#1b1410");
  px(ctx, ox + 15 + look, oy + 14, "#fff6d8", 2, 2);
  if (attack) oval(ctx, ox + 16 + look, oy + 16, 2, 2, "#ffcf70");
}

function sheetDrawn(
  cellW: number,
  cellH: number,
  draw: (ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number, attack: boolean) => void,
): ActorSheet {
  const clips: ActorSheet["clips"] = { idle: [0, 4], run: [4, 4], attack: [8, 4], hit: [12, 2] };
  const frames = 14;
  const canvas = document.createElement("canvas");
  canvas.width = cellW * frames;
  canvas.height = cellH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  for (let frame = 0; frame < frames; frame += 1) {
    const attack = frame >= 8 && frame < 12;
    const local = frame >= 12 ? 0 : frame % 4;
    draw(ctx, frame * cellW, 0, attack ? frame - 8 : local, attack);
    if (frame >= 12) {
      ctx.fillStyle = "rgba(255,246,216,0.45)";
      ctx.fillRect(frame * cellW, 0, cellW, cellH);
    }
  }
  return finish(canvas, frames, clips);
}

const DRAWN: Record<string, () => ActorSheet> = {
  morcego: () => sheetDrawn(16, 16, drawBat),
  aranha: () => sheetDrawn(16, 16, drawSpider),
  boss_olho: () => sheetDrawn(32, 32, drawEye),
};

async function buildActor(view: string): Promise<ActorSheet> {
  const drawn = DRAWN[view];
  if (drawn) return drawn();
  return sheetFromPack(PACK[view] ?? PACK.slime!);
}

export function loadIdle(view: string) {
  const pending = loading.get(view) ?? buildActor(view);
  loading.set(view, pending);
  return pending.then((master) => {
    const image = master.texture.image as CanvasImageSource & { width: number; height: number };
    const [start, count] = master.clips.idle;
    const frameW = image.width / master.frames;
    return { image, start, count, frameW, frameH: image.height };
  });
}

export function loadActor(view: string): Promise<ActorSheet> {
  const pending = loading.get(view) ?? buildActor(view);
  loading.set(view, pending);
  return pending.then((master) => {
    const texture = master.texture.clone();
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.repeat.set(1 / master.frames, 1);
    texture.offset.set(0, 0);
    texture.needsUpdate = true;
    return { ...master, texture };
  });
}

export function setSpriteFrame(texture: Texture, frame: number, frames: number, flip: number) {
  const span = 1 / frames;
  const index = ((frame % frames) + frames) % frames;
  if (flip < 0) {
    texture.repeat.x = -span;
    texture.offset.x = (index + 1) * span;
    return;
  }
  texture.repeat.x = span;
  texture.offset.x = index * span;
}

export type ShotShape = "orb" | "arrow" | "spear" | "dart";

const SHOT_BY_ABILITY: Record<string, ShotShape> = {
  flecha: "arrow",
  lanca: "spear",
  dardo: "dart",
};

export function shotShape(abilityId: string): ShotShape {
  return SHOT_BY_ABILITY[abilityId] ?? "orb";
}

export function shotScale(shape: ShotShape): [number, number] {
  if (shape === "arrow") return [0.78, 0.34];
  if (shape === "spear") return [1.05, 0.26];
  if (shape === "dart") return [0.58, 0.2];
  return [0.42, 0.42];
}

const shotTextures = new Map<ShotShape, Texture>();

function shotCanvas(shape: ShotShape) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  const rows = shape === "arrow"
    ? [".......www......", ".....wwwwwww....", "wwwwwwwwwwwwwwwh", ".....wwwwwww....", ".......www......"]
    : shape === "spear"
      ? ["...............h", "wwwwwwwwwwwwwwwh", "wwwwwwwwwwwwwwss", "...............h"]
        : shape === "dart"
        ? ["...............h", "wwwwwwwwwwwwwwwh", "...............s"]
        : ["......oooo......", "....oyyyyyyo....", "...oyyyyyyyyo...", "..oyyyyyyyyyyo..", "..oyyyyyyyyyyo..", "..oyyyyyyyyyyo..", "..oyyyyyyyyyyo..", "...oyyyyyyyyo...", "....oyyyyyyo....", "......oooo......"];
  const color: Record<string, string> = { o: "#2a241c", y: "#fff6d8", w: "#ffffff", h: "#fff6d8", s: "#c8c0b4" };
  const top = Math.floor((16 - rows.length) / 2);
  rows.forEach((row, y) => {
    const left = Math.floor((16 - row.length) / 2);
    for (let x = 0; x < row.length; x += 1) {
      const pixel = color[row[x] ?? ""];
      if (!pixel) continue;
      ctx.fillStyle = pixel;
      ctx.fillRect(left + x, top + y, 1, 1);
    }
  });
  return canvas;
}

export function shotTexture(shape: ShotShape = "orb") {
  const cached = shotTextures.get(shape);
  if (cached) return cached;
  const texture = new CanvasTexture(shotCanvas(shape));
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  shotTextures.set(shape, texture);
  return texture;
}
