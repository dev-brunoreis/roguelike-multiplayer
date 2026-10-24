const LAG = 0.1;
const SNAP_DIST = 6;

interface Knot {
  x: number;
  y: number;
  t: number;
}

const knots = new Map<number, { a: Knot; b: Knot }>();

export function resetMotion() {
  knots.clear();
}

export function trackMotion(id: number, x: number, y: number, now: number) {
  const knot = knots.get(id);
  const sample = { x, y, t: now };
  if (!knot || now - knot.b.t > 0.5) {
    knots.set(id, { a: sample, b: sample });
    return;
  }
  if (knot.b.x === x && knot.b.y === y) return;
  if (Math.hypot(x - knot.b.x, y - knot.b.y) > SNAP_DIST) {
    knots.set(id, { a: sample, b: sample });
    return;
  }
  knot.a = knot.b;
  knot.b = sample;
}

export function motionAt(id: number, now: number) {
  const knot = knots.get(id);
  if (!knot) return null;
  const span = knot.b.t - knot.a.t;
  if (span < 1e-4) return { x: knot.b.x, y: knot.b.y };
  const u = Math.min(1.2, Math.max(0, (now - LAG - knot.a.t) / span));
  return {
    x: knot.a.x + (knot.b.x - knot.a.x) * u,
    y: knot.a.y + (knot.b.y - knot.a.y) * u,
  };
}

export function forgetMotion(alive: Set<number>) {
  for (const id of knots.keys()) {
    if (!alive.has(id)) knots.delete(id);
  }
}
