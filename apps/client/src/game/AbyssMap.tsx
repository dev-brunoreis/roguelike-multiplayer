import type { Snapshot } from "@game/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { Color, InstancedMesh, Object3D } from "three";
import {
  base64ToMask,
  generateAbyss,
  maskBit,
  TILE_FLOOR,
  TILE_PIT,
  TILE_WALL,
  type AbyssFloorDef,
  type AbyssMap,
} from "@game/sim/abyss";

const MARKS = 8;

export function AbyssField({ snapRef }: { snapRef: MutableRefObject<Snapshot | null> }) {
  const [map, setMap] = useState<AbyssMap | null>(null);
  const key = useRef("");
  useFrame(() => {
    const info = snapRef.current?.abyss;
    if (!info) return;
    const next = `${info.seed}|${info.tiles}|${info.floors.map((floor) => `${floor.kind}:${floor.palette}`).join(",")}`;
    if (next === key.current) return;
    key.current = next;
    const floors: AbyssFloorDef[] = info.floors.map((floor) => ({
      id: floor.id,
      nome: floor.nome,
      kind: floor.kind as AbyssFloorDef["kind"],
      palette: floor.palette,
    }));
    setMap(generateAbyss(info.seed, {
      tiles: info.tiles,
      tileSize: info.tileSize,
      vision: info.vision,
      stairCooldown: 0,
      floors,
    }));
  });
  if (!map) return null;
  return <AbyssMeshes map={map} snapRef={snapRef} />;
}

function AbyssMeshes({ map, snapRef }: { map: AbyssMap; snapRef: MutableRefObject<Snapshot | null> }) {
  const floorRef = useRef<InstancedMesh>(null);
  const pitRef = useRef<InstancedMesh>(null);
  const wallRef = useRef<InstancedMesh>(null);
  const markRef = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const lit = useMemo(() => new Color(), []);
  const dim = useMemo(() => new Color(), []);
  const seen = useRef("");
  const floorMem = useRef(-1);
  const lists = useMemo(() => map.floors.map((floor) => packFloor(map.tiles, floor.tiles)), [map]);
  const size = map.tileSize;
  const capacity = map.tiles * map.tiles;

  useFrame((state) => {
    const info = snapRef.current?.abyss;
    const floors = floorRef.current;
    const pits = pitRef.current;
    const walls = wallRef.current;
    const marks = markRef.current;
    if (!info || !floors || !pits || !walls || !marks) return;
    const pack = lists[info.floor];
    const grid = map.floors[info.floor];
    if (!pack || !grid) return;
    const mask = base64ToMask(info.revealed);
    const rebuilt = floorMem.current !== info.floor || seen.current !== info.revealed;
    if (rebuilt) {
      floorMem.current = info.floor;
      seen.current = info.revealed;
      lay(floors, pack.floors, map, mask, scratch, 0.02, true);
      lay(pits, pack.pits, map, mask, scratch, -0.16, true);
      lay(walls, pack.walls, map, mask, scratch, 0.85, false);
      layMarks(marks, map, info.floor, mask, scratch);
    }
    const heroes = snapRef.current?.entities.filter((entity) => entity.kind === "hero") ?? [];
    const reach = map.vision * map.tileSize;
    tint(floors, pack.floors, map, mask, heroes, reach, grid.palette, 0.42, 1, color, lit, dim);
    tint(pits, pack.pits, map, mask, heroes, reach, "#102026", 0.45, 0.85, color, lit, dim);
    tint(walls, pack.walls, map, mask, heroes, reach, grid.palette, 0.5, 0.9, color, lit, dim);
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 3) * 0.12;
    const heart = map.heart.floor === info.floor ? 1 : 0;
    if (marks.count > heart) {
      const stair = map.stairs.find((item) => item.floor === info.floor);
      if (stair && maskBit(mask, stair.y * map.tiles + stair.x)) {
        color.set("#e6c15a");
        for (let index = 0; index < marks.count - heart; index += 1) marks.setColorAt(index, color);
      }
    }
    if (heart && maskBit(mask, map.heart.y * map.tiles + map.heart.x)) {
      const spot = world(map, map.heart.x, map.heart.y);
      scratch.position.set(spot.x, 0.35, spot.y);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(pulse, 0.4, pulse);
      scratch.updateMatrix();
      marks.setMatrixAt(marks.count - 1, scratch.matrix);
      marks.setColorAt(marks.count - 1, color.set("#e23b4a"));
      marks.instanceMatrix.needsUpdate = true;
    }
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={floorRef} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={pitRef} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={wallRef} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <boxGeometry args={[size, 1.7, size]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={markRef} args={[undefined, undefined, MARKS]} frustumCulled={false}>
        <boxGeometry args={[size * 0.72, 0.45, size * 0.72]} />
        <meshBasicMaterial />
      </instancedMesh>
    </group>
  );
}

function packFloor(n: number, tiles: Uint8Array) {
  const floors: number[] = [];
  const pits: number[] = [];
  const walls: number[] = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const kind = tiles[index];
    if (kind === TILE_FLOOR) floors.push(index);
    else if (kind === TILE_PIT) pits.push(index);
    else if (kind === TILE_WALL && besideOpen(tiles, n, index)) walls.push(index);
  }
  return { floors, pits, walls };
}

function besideOpen(tiles: Uint8Array, n: number, index: number) {
  const x = index % n;
  const y = Math.floor(index / n);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
    const kind = tiles[ny * n + nx];
    if (kind === TILE_FLOOR || kind === TILE_PIT) return true;
  }
  return false;
}

function world(map: AbyssMap, tileX: number, tileY: number) {
  return { x: (tileX + 0.5) * map.tileSize, y: (tileY + 0.5) * map.tileSize };
}

function lay(mesh: InstancedMesh, cells: number[], map: AbyssMap, mask: Uint8Array, scratch: Object3D, y: number, flat: boolean) {
  mesh.count = cells.length;
  const n = map.tiles;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;
    const shown = maskBit(mask, cell);
    const spot = world(map, cell % n, Math.floor(cell / n));
    scratch.position.set(shown ? spot.x : 0, shown ? y : 0, shown ? spot.y : 0);
    scratch.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    scratch.scale.set(shown ? 1 : 0, shown ? 1 : 0, shown ? 1 : 0);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function layMarks(mesh: InstancedMesh, map: AbyssMap, floor: number, mask: Uint8Array, scratch: Object3D) {
  const marks = map.stairs.filter((stair) => stair.floor === floor).map((stair) => ({ x: stair.x, y: stair.y, heart: false }));
  if (map.heart.floor === floor) marks.push({ x: map.heart.x, y: map.heart.y, heart: true });
  mesh.count = Math.min(MARKS, marks.length);
  for (let index = 0; index < mesh.count; index += 1) {
    const mark = marks[index]!;
    const shown = maskBit(mask, mark.y * map.tiles + mark.x);
    const spot = world(map, mark.x, mark.y);
    scratch.position.set(shown ? spot.x : 0, shown ? 0.32 : 0, shown ? spot.y : 0);
    scratch.rotation.set(0, 0, 0);
    const scale = shown ? (mark.heart ? 0.95 : 0.72) : 0;
    scratch.scale.set(scale, shown ? 1 : 0, scale);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function tint(
  mesh: InstancedMesh,
  cells: number[],
  map: AbyssMap,
  mask: Uint8Array,
  heroes: { x: number; y: number }[],
  reach: number,
  palette: string,
  low: number,
  high: number,
  color: Color,
  lit: Color,
  dim: Color,
) {
  dim.set(palette).multiplyScalar(low);
  lit.set(palette).multiplyScalar(high);
  const n = map.tiles;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;
    if (!maskBit(mask, cell)) continue;
    const spot = world(map, cell % n, Math.floor(cell / n));
    color.copy(dim).lerp(lit, glow(spot.x, spot.y, heroes, reach));
    mesh.setColorAt(index, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function glow(x: number, y: number, heroes: { x: number; y: number }[], reach: number) {
  let best = 0;
  for (const hero of heroes) {
    const dist = Math.hypot(hero.x - x, hero.y - y);
    const light = 1 - Math.min(1, dist / Math.max(1, reach));
    if (light > best) best = light;
  }
  return best * best;
}
