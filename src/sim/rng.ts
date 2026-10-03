// Seeded deterministic randomness. Each resident owns its own stream (a single uint32 held in
// state), so injecting an experience into one resident in a twin test perturbs only that
// resident's choices directly; everyone else diverges only through interaction.

/** FNV-1a hash of a label, mixed with a seed, for deriving independent streams. */
export function deriveSeed(seed: number, label: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 0x9e3779b9;
}

/** A holder for one stream's state. Resident state objects satisfy this via their `rng` field. */
export interface RngHolder {
  rng: number;
}

/** mulberry32: advances the holder's state and returns a float in [0, 1). */
export function rand(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) >>> 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(h: RngHolder, p: number): boolean {
  return rand(h) < p;
}

export function between(h: RngHolder, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(h);
}

export function intBetween(h: RngHolder, lo: number, hi: number): number {
  return lo + Math.floor(rand(h) * (hi - lo + 1));
}

export function pick<T>(h: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[Math.floor(rand(h) * items.length)] as T;
}

/** Weighted pick. Items with weight <= 0 are never chosen. Returns undefined if none qualify. */
export function weighted<T>(h: RngHolder, items: readonly T[], weight: (item: T) => number): T | undefined {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, weight(it));
    total += w;
    return w;
  });
  if (total <= 0) return undefined;
  let r = rand(h) * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i] as number;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
