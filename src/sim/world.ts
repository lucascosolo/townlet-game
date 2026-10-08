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
/**
 * The way from one tile to another. Without the town, the plain L-shape (used to sketch worn
 * tracks). With it (paths, 2026-10-05), the cheapest way round: other buildings' footprints are
 * not crossed, laid paths are cheap and walked two tiles a minute, the commons can be cut across
 * and the brook forded. Falls back to the L-shape if no way round exists.
 */
export function route(from: [number, number], to: [number, number], state?: SimState): Array<[number, number]> {
  if (state) {
    const found = findRoute(state, from, to);
    if (found) return found;
  }
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

/** What each tile costs to walk; Infinity is a building in the way. */
const TILE_COST = { path: 1, open: 3, commons: 3, brook: 9 } as const;

interface Grid {
  key: string;
  /** Per tile: 0 open, 1 laid path, 2 commons, 3 brook, otherwise the id + 10 of the building on it. */
  cells: Int32Array;
  /** How much cheaper a worn tile is to cross, from the day's dawn (bar round 2: desire paths). */
  worn: Float32Array;
  width: number;
  height: number;
  cache: Map<string, Array<[number, number]> | null>;
}

/** The most a well-worn track takes off an open tile's cost: never cheaper than a laid path. */
const WORN_DISCOUNT = 1.5;

const grids = new WeakMap<SimState, Grid>();

/** The walking grid, rebuilt only when buildings change. */
function gridOf(state: SimState): Grid {
  const live = liveBuildings(state);
  // Rebuilt when buildings change and once a day, so the day's walking follows yesterday's tracks.
  const key = `${state.nextBuildingId}|${live.length}|${state.width}x${state.height}|${Math.floor(state.tick / 1440)}`;
  const old = grids.get(state);
  if (old && old.key === key) return old;
  const cells = new Int32Array(state.width * state.height);
  const worn = new Float32Array(state.width * state.height);
  for (const [k, w] of Object.entries(state.wear ?? {})) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (x >= 0 && y >= 0 && x < state.width && y < state.height) worn[y * state.width + x] = Math.min(WORN_DISCOUNT, Math.max(0, ((w as number) - 1) * 0.15));
  }
  for (const b of live) {
    const [w, h] = sizeOf(b);
    const v = b.type === 'path' ? 1 : b.type === 'commons' ? 2 : b.type === 'brook' ? 3 : b.id + 10;
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) if (x >= 0 && y >= 0 && x < state.width && y < state.height) cells[y * state.width + x] = v;
  }
  const grid: Grid = { key, cells, worn, width: state.width, height: state.height, cache: new Map() };
  grids.set(state, grid);
  return grid;
}

export function isPath(state: SimState, x: number, y: number): boolean {
  const g = gridOf(state);
  return x >= 0 && y >= 0 && x < g.width && y < g.height && g.cells[y * g.width + x] === 1;
}

/** A* over the walking grid. Steps along laid paths are taken two at a time. */
function findRoute(state: SimState, from: [number, number], to: [number, number]): Array<[number, number]> | null {
  const g = gridOf(state);
  const { width: W, height: H, cells, worn } = g;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  if (!inside(from[0], from[1]) || !inside(to[0], to[1])) return null;
  if (from[0] === to[0] && from[1] === to[1]) return [];
  const ck = `${from[0]},${from[1]}>${to[0]},${to[1]}`;
  if (g.cache.has(ck)) {
    const hit = g.cache.get(ck);
    return hit ? hit.map((p) => [p[0], p[1]] as [number, number]) : null;
  }
  // The buildings you set out from and are going to can be walked through.
  const startB = cells[from[1] * W + from[0]] as number;
  const endB = cells[to[1] * W + to[0]] as number;
  const cost = (i: number): number => {
    const c = cells[i] as number;
    if (c === 0) return TILE_COST.open - (worn[i] as number);
    if (c === 1) return TILE_COST.path;
    if (c === 2) return TILE_COST.commons;
    if (c === 3) return TILE_COST.brook;
    return c === startB || c === endB ? TILE_COST.open : Infinity;
  };
  const n = W * H;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const start = from[1] * W + from[0];
  const goal = to[1] * W + to[0];
  best[start] = 0;
  // A binary heap of [f, index].
  const heap: Array<[number, number]> = [[0, start]];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    for (let k = heap.length - 1; k > 0; ) {
      const p = (k - 1) >> 1;
      if ((heap[p] as [number, number])[0] <= (heap[k] as [number, number])[0]) break;
      [heap[p], heap[k]] = [heap[k] as [number, number], heap[p] as [number, number]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && (heap[l] as [number, number])[0] < (heap[m] as [number, number])[0]) m = l;
        if (r < heap.length && (heap[r] as [number, number])[0] < (heap[m] as [number, number])[0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k] as [number, number], heap[m] as [number, number]];
        k = m;
      }
    }
    return top;
  };
  const h = (i: number) => Math.abs((i % W) - to[0]) + Math.abs(Math.floor(i / W) - to[1]);
  while (heap.length) {
    const [, i] = pop();
    if (i === goal) break;
    const x = i % W;
    const y = (i - x) / W;
    // Neighbour order is fixed, so equal-cost ties resolve the same way every time.
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny)) continue;
      const j = ny * W + nx;
      const c = cost(j);
      if (c === Infinity) continue;
      const d = (best[i] as number) + c;
      if (d < (best[j] as number)) {
        best[j] = d;
        prev[j] = i;
        push(d + h(j), j);
      }
    }
  }
  if (prev[goal] === -1) {
    g.cache.set(ck, null);
    return null;
  }
  const tiles: Array<[number, number]> = [];
  for (let i = goal; i !== start; i = prev[i] as number) tiles.push([i % W, Math.floor(i / W)]);
  tiles.reverse();
  // Along a laid path they cover two tiles a minute: skip every other step while both are path.
  const steps: Array<[number, number]> = [];
  for (let k = 0; k < tiles.length; k++) {
    const t = tiles[k] as [number, number];
    const next = tiles[k + 1];
    const here = cells[t[1] * W + t[0]] === 1;
    if (here && next && cells[next[1] * W + next[0]] === 1 && k + 1 < tiles.length - 1) {
      steps.push(next);
      k++;
    } else steps.push(t);
  }
  if (g.cache.size > 4000) g.cache.clear();
  g.cache.set(ck, steps);
  return steps.map((p) => [p[0], p[1]] as [number, number]);
}

const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function canPlace(state: SimState, type: string, x: number, y: number, rot = 0): string | null {
  // Buildings that open up with the town's tier (M4).
  const tier = buildingDef(type).tier ?? 0;
  if (tier > (state.progress?.tier ?? 0)) return 'not unlocked yet';
  const [w, h] = footprint(type, rot);
  if (x < 0 || y < 0 || x + w > state.width || y + h > state.height) return 'out of bounds';
  // A jetty is for fishing: it has to reach the water (owner playtest: one sat on dry land).
  if (type === 'jetty' && brookSide(state, x, y) === null) return 'must be beside the brook';
  for (const b of liveBuildings(state)) {
    // A building can go over a path (the path under it is taken up); a path can't go over anything.
    if (b.type === 'path' && type !== 'path') continue;
    const [bw, bh] = sizeOf(b);
    if (x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y) return `overlaps ${b.type} #${b.id}`;
  }
  return null;
}

// ---------------------------------------------------------------- worn tracks

/** Each dawn a track keeps this much of its wear: unwalked for 7 days, about a fifth is left. */
export const WEAR_KEEP = 0.8;
/** Wear below this is not drawn: a track takes real, repeated traffic to show (bar round 1). */
export const WEAR_SHOW = 6;

/** A footstep off the laid paths wears the ground a little. */
export function wearStep(state: SimState, x: number, y: number): void {
  // Only open ground wears (bar round 2): the commons and every other footprint stay as drawn.
  const g = gridOf(state);
  if (x < 0 || y < 0 || x >= g.width || y >= g.height || g.cells[y * g.width + x] !== 0) return;
  if (isPath(state, x, y)) return;
  const wear = (state.wear ??= {});
  const k = `${x},${y}`;
  wear[k] = (wear[k] ?? 0) + 1;
}

/** At dawn, tracks nobody walks start to grow back. */
export function wearDawn(state: SimState): void {
  const wear = state.wear;
  if (!wear) return;
  for (const k of Object.keys(wear)) {
    const w = (wear[k] as number) * WEAR_KEEP;
    if (w < 0.5) delete wear[k];
    else wear[k] = Math.round(w * 100) / 100;
  }
}

/**
 * The founding town has been lived in: its everyday walks (home to work twice a day, home to the
 * places people gather) start worn about half as deep as daily walking keeps them.
 */
export function seedWear(state: SimState): void {
  const live = liveBuildings(state);
  const door = (id: number | null) => {
    const b = id !== null ? live.find((x) => x.id === id) : undefined;
    return b ? placeTile(b) : null;
  };
  const gathering = live.filter((b) => ['commons', 'teahouse', 'well', 'oak', 'bakery'].includes(b.type));
  const steady = 1 / (1 - WEAR_KEEP);
  const walk = (a: [number, number], b: [number, number], perDay: number) => {
    for (const [x, y] of route(a, b, state)) for (let i = 0; i < perDay; i++) wearStep(state, x, y);
  };
  for (const id of state.order) {
    const r = state.residents[id];
    if (!r || r.departed) continue;
    const home = door(r.homeId);
    if (!home) continue;
    const job = door(r.jobId);
    if (job) walk(home, job, 2);
    for (const g of gathering) walk(home, placeTile(g), 1);
  }
  const wear = state.wear ?? {};
  for (const k of Object.keys(wear)) wear[k] = Math.round((wear[k] as number) * steady * 0.3);
}

/** The nearest tile that is not under a building (paths and the commons count as open), searching outward. */
export function nearestOpen(state: SimState, x: number, y: number): [number, number] | null {
  const live = liveBuildings(state).filter((b) => b.type !== 'path' && b.type !== 'commons');
  const blocked = (tx: number, ty: number) =>
    live.some((b) => {
      const [bw, bh] = sizeOf(b);
      return tx >= b.x && tx < b.x + bw && ty >= b.y && ty < b.y + bh;
    });
  for (let ring = 1; ring <= 6; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) continue;
        if (!blocked(tx, ty)) return [tx, ty];
      }
    }
  }
  return null;
}

/** Which way the brook lies from a tile, as a quarter turn (0 east, 1 south, 2 west, 3 north), or null if it isn't next to it. */
export function brookSide(state: SimState, x: number, y: number): number | null {
  const brooks = liveBuildings(state).filter((b) => b.type === 'brook');
  const sides: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let rot = 0; rot < 4; rot++) {
    const [dx, dy] = sides[rot] as [number, number];
    const tx = x + dx;
    const ty = y + dy;
    if (brooks.some((b) => {
      const [bw, bh] = sizeOf(b);
      return tx >= b.x && tx < b.x + bw && ty >= b.y && ty < b.y + bh;
    })) return rot;
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
