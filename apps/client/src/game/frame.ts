import type { EntitySnap, FxSnap, ProjectileSnap, Snapshot } from "@game/shared/protocol";

export interface SnapIndex {
  entities: Map<number, EntitySnap>;
  projectiles: Map<number, ProjectileSnap>;
  fx: Map<number, FxSnap>;
  arenas: Map<string, { id: string; x: number; y: number; size: number; kind: string }>;
}

export const emptyIndex = (): SnapIndex => ({
  entities: new Map(),
  projectiles: new Map(),
  fx: new Map(),
  arenas: new Map(),
});

export function indexSnapshot(snap: Snapshot): SnapIndex {
  return {
    entities: new Map(snap.entities.map((entity) => [entity.id, entity])),
    projectiles: new Map(snap.projectiles.map((shot) => [shot.id, shot])),
    fx: new Map(snap.fx.map((item) => [item.id, item])),
    arenas: new Map(snap.arenas.map((arena) => [arena.id, arena])),
  };
}

export const viewRect = {
  minX: -1e9,
  maxX: 1e9,
  minZ: -1e9,
  maxZ: 1e9,
};

export function setViewRect(minX: number, maxX: number, minZ: number, maxZ: number) {
  viewRect.minX = minX;
  viewRect.maxX = maxX;
  viewRect.minZ = minZ;
  viewRect.maxZ = maxZ;
}

export function inView(x: number, y: number) {
  return x >= viewRect.minX && x <= viewRect.maxX && y >= viewRect.minZ && y <= viewRect.maxZ;
}

export function arenaInView(arena: { x: number; y: number; size: number }) {
  return arena.x <= viewRect.maxX && arena.x + arena.size >= viewRect.minX
    && arena.y <= viewRect.maxZ && arena.y + arena.size >= viewRect.minZ;
}

export const renderStats = { entities: 0, html: 0 };
