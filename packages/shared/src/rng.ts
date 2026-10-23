export interface Rng {
  next(): number;
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
}

/** Deterministic RNG (mulberry32). The server owns the seed. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(max: number) {
      return Math.floor(next() * max);
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]!;
    },
  };
}
