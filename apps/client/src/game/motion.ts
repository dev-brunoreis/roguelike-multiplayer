const SNAP_DIST = 6;

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface Clock {
  tick: number;
  at: number;
  tickRate: number;
  delay: number;
  jitter: number;
  prevTick: number;
  prevAt: number;
  ready: boolean;
}

const tracks = new Map<number, Sample[]>();
let lockedDelay: number | null = null;

const clock: Clock = {
  tick: 0,
  at: 0,
  tickRate: 20,
  delay: 0.2,
  jitter: 0,
  prevTick: 0,
  prevAt: 0,
  ready: false,
};

export function setMotionDelay(delay: number | null) {
  lockedDelay = delay;
  if (delay != null) clock.delay = delay;
}

export function resetMotion() {
  tracks.clear();
  clock.ready = false;
  clock.jitter = 0;
  clock.delay = lockedDelay ?? 0.2;
}

export function noteSnapshot(tick: number, tickRate: number, now: number) {
  if (lockedDelay != null) {
    clock.delay = lockedDelay;
  } else if (clock.ready) {
    const gap = now - clock.prevAt;
    const expected = Math.max(0.001, (tick - clock.prevTick) / tickRate);
    const jitter = Math.abs(gap - expected);
    clock.jitter = clock.jitter * 0.8 + jitter * 0.2;
    clock.delay = Math.min(0.45, Math.max(0.12, 0.2 + clock.jitter));
  }
  clock.tick = tick;
  clock.at = now;
  clock.tickRate = tickRate;
  clock.prevTick = tick;
  clock.prevAt = now;
  clock.ready = true;
}

export function trackMotion(id: number, x: number, y: number, tick: number, tickRate: number) {
  const t = tick / tickRate;
  const list = tracks.get(id) ?? [];
  const last = list[list.length - 1];
  if (last && last.t === t) return;
  if (last && Math.hypot(x - last.x, y - last.y) > SNAP_DIST) {
    tracks.set(id, [{ t, x, y }]);
    return;
  }
  list.push({ t, x, y });
  while (list.length > 3) list.shift();
  tracks.set(id, list);
}

export function motionAt(id: number, now: number) {
  const list = tracks.get(id);
  if (!list || list.length === 0) return null;
  const latest = list[list.length - 1]!;
  if (!clock.ready) return { x: latest.x, y: latest.y };
  const serverNow = clock.tick / clock.tickRate + (now - clock.at) - clock.delay;
  if (serverNow >= latest.t) return { x: latest.x, y: latest.y };
  const first = list[0]!;
  if (serverNow <= first.t) return { x: first.x, y: first.y };
  let a = first;
  let b = latest;
  for (let i = 0; i < list.length - 1; i += 1) {
    const left = list[i]!;
    const right = list[i + 1]!;
    if (left.t <= serverNow && serverNow <= right.t) {
      a = left;
      b = right;
      break;
    }
  }
  const span = b.t - a.t;
  if (span < 1e-4) return { x: b.x, y: b.y };
  const u = (serverNow - a.t) / span;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export function forgetMotion(alive: Set<number>) {
  for (const id of tracks.keys()) {
    if (!alive.has(id)) tracks.delete(id);
  }
}
