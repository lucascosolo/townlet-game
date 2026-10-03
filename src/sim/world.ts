// The town's physical layer: building footprints, ambient qualities ("the town's senses",
// spec 4.1) and walking routes.

import { buildingDef } from '../content/buildings.js';
import { QUALITIES, type BuildingState, type QualityMap, type SimState } from './types.js';

export function emptyQualities(): QualityMap {
  return { noise: 0, bustle: 0, green: 0, scent: 0, water: 0 };
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
  const [w, h] = buildingDef(b.type).size;
  return [b.x + Math.floor((w - 1) / 2), b.y + Math.floor((h - 1) / 2)];
}

/** Chebyshev distance from a tile to the nearest tile of a building's footprint. */
export function distanceTo(b: BuildingState, x: number, y: number): number {
  const [w, h] = buildingDef(b.type).size;
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

/** Ambient qualities at a tile: the sum of every live building's emission, clamped to [0, 1]. */
export function ambientAt(state: SimState, x: number, y: number, worked: ReadonlySet<number>): QualityMap {
  const out = emptyQualities();
  for (const b of state.buildings) {
    if (b.removed) continue;
    const e = emissionAt(b, x, y, worked);
    for (const q of QUALITIES) out[q] += e[q];
  }
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

export function canPlace(state: SimState, type: string, x: number, y: number): string | null {
  const [w, h] = buildingDef(type).size;
  if (x < 0 || y < 0 || x + w > state.width || y + h > state.height) return 'out of bounds';
  for (const b of liveBuildings(state)) {
    const [bw, bh] = buildingDef(b.type).size;
    if (x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y) return `overlaps ${b.type} #${b.id}`;
  }
  return null;
}

export function buildingName(b: BuildingState): string {
  return buildingDef(b.type).name;
}
