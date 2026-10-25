import type { ClipName } from "./sprites.js";

export interface PoseLock {
  entityId: number | null;
  clip: ClipName | "death";
  frame: number | null;
  fps: number | null;
}

let lock: PoseLock | null = null;

export function setPoseLock(next: PoseLock | null) {
  lock = next;
}

export function poseLock() {
  return lock;
}
