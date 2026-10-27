import type { AbyssSnap } from "@game/shared";
import { base64ToMask, generateAbyss, maskBit, TILE_FLOOR, TILE_PIT, type AbyssFloorDef, type AbyssMap } from "@game/sim/abyss";
import { memo, useEffect, useRef } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const AbyssHud = memo(function AbyssHud() {
  const abyss = useSlice(() => (matchStore.snap?.mode === "abismo" ? matchStore.snap.abyss : null));
  const dots = useSlice(() => {
    if (matchStore.snap?.mode !== "abismo") return "";
    return matchStore.snap.entities
      .filter((entity) => entity.kind === "hero")
      .map((entity) => `${entity.x.toFixed(1)},${entity.y.toFixed(1)},${entity.playerId === matchStore.youId ? "1" : "0"}`)
      .join(";");
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = abyss ? layoutOf(abyss) : null;
  useEffect(() => {
    if (!abyss || !map) return;
    const node = canvas.current;
    if (!node) return;
    drawMap(node, map, abyss.floor, base64ToMask(abyss.revealed), dots);
  }, [abyss, map, dots]);
  if (!abyss) return null;
  return (
    <aside className="hud abyss-map">
      <strong>{abyss.nome}</strong>
      <span>{abyss.objective}</span>
      <canvas ref={canvas} width={abyss.tiles} height={abyss.tiles} />
    </aside>
  );
});

const maps = new Map<string, AbyssMap>();

function layoutOf(abyss: AbyssSnap) {
  const key = `${abyss.seed}|${abyss.tiles}|${abyss.floors.map((floor) => floor.kind).join(",")}`;
  const cached = maps.get(key);
  if (cached) return cached;
  const floors: AbyssFloorDef[] = abyss.floors.map((floor) => ({
    id: floor.id,
    nome: floor.nome,
    kind: floor.kind as AbyssFloorDef["kind"],
    palette: floor.palette,
  }));
  const map = generateAbyss(abyss.seed, {
    tiles: abyss.tiles,
    tileSize: abyss.tileSize,
    vision: abyss.vision,
    stairCooldown: 0,
    floors,
  });
  maps.set(key, map);
  return map;
}

function drawMap(node: HTMLCanvasElement, map: AbyssMap, floor: number, mask: Uint8Array, dots: string) {
  const ctx = node.getContext("2d");
  const grid = map.floors[floor];
  if (!ctx || !grid) return;
  const n = map.tiles;
  const image = ctx.createImageData(n, n);
  const palette = rgb(grid.palette);
  const data = image.data;
  for (let index = 0; index < n * n; index += 1) {
    const pixel = index * 4;
    data[pixel + 3] = 255;
    if (!maskBit(mask, index)) {
      data[pixel] = 7;
      data[pixel + 1] = 6;
      data[pixel + 2] = 10;
      continue;
    }
    const kind = grid.tiles[index];
    if (kind === TILE_PIT) {
      data[pixel] = 8;
      data[pixel + 1] = 12;
      data[pixel + 2] = 16;
    } else if (kind === TILE_FLOOR) {
      data[pixel] = palette[0];
      data[pixel + 1] = palette[1];
      data[pixel + 2] = palette[2];
    } else {
      data[pixel] = 18;
      data[pixel + 1] = 16;
      data[pixel + 2] = 14;
    }
  }
  for (const stair of map.stairs) {
    if (stair.floor !== floor) continue;
    const index = stair.y * n + stair.x;
    if (!maskBit(mask, index)) continue;
    paint(data, n, stair.x, stair.y, 230, 193, 90);
  }
  if (map.heart.floor === floor && maskBit(mask, map.heart.y * n + map.heart.x)) {
    paint(data, n, map.heart.x, map.heart.y, 226, 59, 74);
  }
  ctx.putImageData(image, 0, 0);
  for (const dot of dots.split(";")) {
    if (!dot) continue;
    const [x, y, mine] = dot.split(",");
    const tx = Math.floor(Number(x) / map.tileSize);
    const ty = Math.floor(Number(y) / map.tileSize);
    ctx.fillStyle = mine === "1" ? "#f4efe4" : "#7eb6d6";
    ctx.fillRect(tx, ty, 2, 2);
  }
}

function paint(data: Uint8ClampedArray, n: number, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= n || y >= n) return;
  const pixel = (y * n + x) * 4;
  data[pixel] = r;
  data[pixel + 1] = g;
  data[pixel + 2] = b;
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const color = Number.parseInt(full, 16);
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}
