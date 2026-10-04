// The town's physical layer: building footprints, ambient qualities ("the town's senses",
// spec 4.1) and walking routes.

import { buildingDef } from '../content/buildings.js';
import { QUALITIES, type BuildingState, type QualityMap, type SimState } from './types.js';

export function emptyQualities(): QualityMap {
  return { noise: 0, bustle: 0, green: 0, scent: 0, water: 0 };
}

/** A building type's footprint after a number of quarter turns. */
export function footprint(type: string, rot = 0): [number, number] {
  const [w, h] = buildingDef(type).size;
  return rot % 2 === 1 ? [h, w] : [w, h];
}

export function sizeOf(b: BuildingState): [number, number] {
  return footprint(b.type, b.rot ?? 0);
}

export function liveBuildings(state: SimState): BuildingState[] {
  return state.buildings.filter((b) => !b.removed);
}

export function getBuilding(state: SimState, id: number): BuildingState {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) throw new Error(`no building ${id}`);
  return b;
}

/** The tile residents stand on when they are "at" a building. */
export function placeTile(b: BuildingState): [number, number] {
  const [w, h] = sizeOf(b);
  return [b.x + Math.floor((w - 1) / 2), b.y + Math.floor((h - 1) / 2)];
}

/** Chebyshev distance from a tile to the nearest tile of a building's footprint. */
export function distanceTo(b: BuildingState, x: number, y: number): number {
  const [w, h] = sizeOf(b);
  const dx = Math.max(b.x - x, 0, x - (b.x + w - 1));
  const dy = Math.max(b.y - y, 0, y - (b.y + h - 1));
  return Math.max(dx, dy);
}

/** Walking distance between two buildings' place tiles. */
export function walkDistance(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function falloff(d: number, radius: number): number {
  return d > radius ? 0 : 1 - d / (radius + 1);
}

/** One building's contribution of a quality to a tile. */
export function emissionAt(b: BuildingState, x: number, y: number, worked: ReadonlySet<number>): QualityMap {
  const def = buildingDef(b.type);
  const out = emptyQualities();
  const f = falloff(distanceTo(b, x, y), def.radius);
  if (f === 0) return out;
  for (const q of QUALITIES) {
    let v = def.emits[q] ?? 0;
    if (worked.has(b.id)) v += def.emitsWhenWorked?.[q] ?? 0;
    out[q] = v * f;
  }
  return out;
}

/** Night storms are loud everywhere, indoors or out. */
export const STORM_NOISE = 0.55;

/**
 * Ambient qualities at a tile: every live building's emission, plus running gatherings (a
 * market is noisy) and the weather, clamped to [0, 1]. `weather: false` leaves the storm out,
 * to tell whether a building alone is the cause.
 */
export function ambientAt(state: SimState, x: number, y: number, worked: ReadonlySet<number>, opts: { weather?: boolean } = {}): QualityMap {
  const out = emptyQualities();
  for (const b of state.buildings) {
    if (b.removed) continue;
    const e = emissionAt(b, x, y, worked);
    for (const q of QUALITIES) out[q] += e[q];
  }
  for (const g of state.story.gatherings) {
    if (!g.emits || state.tick < g.from || state.tick >= g.until) continue;
    const b = state.buildings.find((bb) => bb.id === g.placeId);
    if (!b || b.removed) continue;
    const r = g.radius ?? 2;
    const d = distanceTo(b, x, y);
    if (d > r) continue;
    const f = 1 - d / (r + 1);
    for (const q of QUALITIES) out[q] += (g.emits[q] ?? 0) * f;
  }
  if (opts.weather !== false && state.story.weather.kind === 'storm' && state.tick < state.story.weather.until) out.noise += STORM_NOISE;
  for (const q of QUALITIES) out[q] = Math.min(1, Math.max(0, out[q]));
  return out;
}

/** The building contributing most positively to a quality at a tile (to attribute a cause). */
export function mainSource(
  state: SimState,
  x: number,
  y: number,
  q: keyof QualityMap,
  worked: ReadonlySet<number>,
): BuildingState | undefined {
  let best: BuildingState | undefined;
  let bestV = 0;
  for (const b of state.buildings) {
    if (b.removed) continue;
    const v = emissionAt(b, x, y, worked)[q];
    if (v > bestV) {
      bestV = v;
      best = b;
    }
  }
  return best;
}

/** An L-shaped walking route, excluding the start tile and including the destination. */
export function route(from: [number, number], to: [number, number]): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  let [x, y] = from;
  while (x !== to[0]) {
    x += Math.sign(to[0] - x);
    path.push([x, y]);
  }
  while (y !== to[1]) {
    y += Math.sign(to[1] - y);
    path.push([x, y]);
  }
  return path;
}

export function canPlace(state: SimState, type: string, x: number, y: number, rot = 0): string | null {
  // Buildings that open up with the town's tier (M4).
  const tier = buildingDef(type).tier ?? 0;
  if (tier > (state.progress?.tier ?? 0)) return 'not unlocked yet';
  const [w, h] = footprint(type, rot);
  if (x < 0 || y < 0 || x + w > state.width || y + h > state.height) return 'out of bounds';
  for (const b of liveBuildings(state)) {
    const [bw, bh] = sizeOf(b);
    if (x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y) return `overlaps ${b.type} #${b.id}`;
  }
  return null;
}

export function buildingName(b: BuildingState): string {
  return buildingDef(b.type).name;
}

/** Tiles between two buildings' footprints (Chebyshev): 1 means side by side. */
export function gapBetween(a: BuildingState, b: BuildingState): number {
  const [aw, ah] = sizeOf(a);
  const [bw, bh] = sizeOf(b);
  const dx = Math.max(a.x - (b.x + bw - 1), b.x - (a.x + aw - 1), 0);
  const dy = Math.max(a.y - (b.y + bh - 1), b.y - (a.y + ah - 1), 0);
  return Math.max(dx, dy);
}

/**
 * How green it is around a home, as residents judge it (M3c playtest fix): anything green right
 * beside the home counts in full, two tiles off counts half. Measured around the whole home, not
 * at one corner of it.
 */
export function greenAroundHome(state: SimState, home: BuildingState): number {
  let g = 0;
  for (const b of liveBuildings(state)) {
    if (b.id === home.id) continue;
    const green = buildingDef(b.type).emits.green ?? 0;
    if (green <= 0) continue;
    const d = gapBetween(home, b);
    g += d <= 1 ? green : d === 2 ? green / 2 : 0;
  }
  return Math.min(1, g);
}
