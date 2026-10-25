export interface DrawnBox {
  kind: "entity" | "vfx";
  id: number;
  x: number;
  y: number;
  wide: number;
  tall: number;
  vfx?: string;
}

let watch = false;
let stamp = -1;
let boxes: DrawnBox[] = [];

export function watchDrawn(on: boolean) {
  watch = on;
  if (!on) boxes = [];
}

export function noteDrawn(frame: number, box: DrawnBox) {
  if (!watch) return;
  if (frame !== stamp) {
    stamp = frame;
    boxes = [];
  }
  boxes.push(box);
}

export function drawnBoxes() {
  return boxes;
}
