// Paths criteria 1–3 (spec 9.3, predeclared 2026-10-05): laying paths, nobody walking through
// buildings, and paths that help.
import { describe, expect, it } from 'vitest';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import type { Simulation } from '../src/sim/sim.js';
import { at } from '../src/sim/time.js';
import { canPlace, getBuilding, isPath, liveBuildings, placeTile, route, sizeOf } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

/** Lay a path along the way between two buildings, wherever the tiles are free. */
function layPath(sim: Simulation, fromId: number, toId: number): number {
  const a = placeTile(getBuilding(sim.state, fromId));
  const b = placeTile(getBuilding(sim.state, toId));
  let laid = 0;
  for (const [x, y] of route(a, b, sim.state)) {
    if (canPlace(sim.state, 'path', x, y) !== null) continue;
    sim.schedule([{ at: sim.state.tick, kind: 'build', type: 'path', x, y }]);
    sim.flushCommands();
    laid++;
  }
  return laid;
}

/** Which building, if any, covers a tile (paths, the commons and the brook don't count). */
function solidAt(sim: Simulation, x: number, y: number): number | null {
  for (const b of liveBuildings(sim.state)) {
    if (b.type === 'path' || b.type === 'commons' || b.type === 'brook') continue;
    const [w, h] = sizeOf(b);
    if (x >= b.x && x < b.x + w && y >= b.y && y < b.y + h) return b.id;
  }
  return null;
}

describe('paths', () => {
  it('criterion 1: a path tile is free, quiet, removable, and replays the same', () => {
    const play = () => {
      const sim = runScenario('quiet', 1, 'none');
      const narrator = new Narrator(sim, { stewardIsYou: true });
      sim.runUntil(at(1, 10));
      const timber = sim.state.stock.timber;
      const r = sim.resident('bram');
      const laid = layPath(sim, r.homeId, r.jobId as number);
      expect(laid).toBeGreaterThan(2);
      expect(sim.state.stock.timber).toBe(timber);
      const first = liveBuildings(sim.state).find((b) => b.type === 'path')!;
      sim.schedule([{ at: sim.state.tick, kind: 'remove', x: first.x, y: first.y }]);
      sim.runUntil(at(2, 0));
      expect(isPath(sim.state, first.x, first.y)).toBe(false);
      expect(narrator.text()).not.toMatch(/You build a path|path taken down/);
      return JSON.stringify(liveBuildings(sim.state).filter((b) => b.type === 'path').map((b) => [b.x, b.y]));
    };
    expect(play()).toBe(play());
  });

  it('criterion 1: a building goes over a path, taking it up', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(1, 10));
    let spot: [number, number] | null = null;
    for (let y = 1; y < 22 && !spot; y++) for (let x = 1; x < 22 && !spot; x++) if (canPlace(sim.state, 'bench', x, y) === null) spot = [x, y];
    sim.schedule([{ at: sim.state.tick, kind: 'build', type: 'path', x: spot![0], y: spot![1] }]);
    sim.flushCommands();
    sim.schedule([{ at: sim.state.tick, kind: 'build', type: 'bench', x: spot![0], y: spot![1] }]);
    sim.flushCommands();
    expect(isPath(sim.state, spot![0], spot![1])).toBe(false);
    expect(liveBuildings(sim.state).some((b) => b.type === 'bench' && b.x === spot![0] && b.y === spot![1])).toBe(true);
  });

  it('criterion 2: over 7 days nobody steps onto a building they are not leaving or going to', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const bad: string[] = [];
      const from = new Map<string, number>();
      // Calling round for a friend means walking to their door, in whatever they are at.
      const calling = new Map<string, number>();
      sim.on((e) => {
        if (e.type !== 'invite') return;
        const f = sim.resident(e.b);
        const there = solidAt(sim, f.x, f.y);
        if (there !== null) calling.set(e.a, there);
      });
      const end = at(8, 0);
      while (sim.state.tick < end) {
        sim.step();
        for (const id of sim.state.order) {
          const r = sim.resident(id);
          if (r.at !== null) {
            from.set(id, r.at);
            calling.delete(id);
          }
          if (r.departed || r.path.length === 0) continue;
          const on = solidAt(sim, r.x, r.y);
          if (on === null) continue;
          // Where they set out from, and where they are going.
          const allowed = new Set([from.get(id), r.pending?.placeId, r.activity?.placeId, r.at, calling.get(id)]);
          if (!allowed.has(on) && bad.length < 5) bad.push(`${id} on ${getBuilding(sim.state, on).type} at ${r.x},${r.y} t${sim.state.tick}`);
        }
      }
      expect(bad, `seed ${seed}`).toEqual([]);
    }
  });

  it('criterion 3a: a path along a commute cuts the walk by at least 25%', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(1, 6));
      for (const id of sim.state.order) {
        const r = sim.resident(id);
        if (r.jobId === null) continue;
        const a = placeTile(getBuilding(sim.state, r.homeId));
        const b = placeTile(getBuilding(sim.state, r.jobId));
        const before = route(a, b, sim.state).length;
        layPath(sim, r.homeId, r.jobId);
        const after = route(a, b, sim.state).length;
        if (before >= 6) expect(after, `seed ${seed} ${id}: ${before} → ${after} minutes`).toBeLessThanOrEqual(before * 0.75);
      }
    }
  });

  // MISSED, reported in spec 9.3: as declared, 52% of steps near a path are on it, against 60%.
  // Most of the rest are steps inside the buildings at either end of a walk, which can't be on a
  // path (leaving those out, 68%). Kept as an expected failure so it stays visible.
  it.fails('criterion 3b: at least 60% of steps near a path are on it', { timeout: 300_000 }, () => {
    let onPath = 0;
    let near = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(1, 6));
      for (const id of sim.state.order) {
        const r = sim.resident(id);
        if (r.jobId === null) continue;
        const a = placeTile(getBuilding(sim.state, r.homeId));
        const b = placeTile(getBuilding(sim.state, r.jobId));
        const before = route(a, b, sim.state).length;
        layPath(sim, r.homeId, r.jobId);
        const after = route(a, b, sim.state).length;
        if (before >= 6) expect(after, `seed ${seed} ${id}: ${before} → ${after} minutes`).toBeLessThanOrEqual(before * 0.75);
      }
      const end = at(4, 0);
      while (sim.state.tick < end) {
        sim.step();
        for (const id of sim.state.order) {
          const r = sim.resident(id);
          if (r.path.length === 0) continue;
          let close = false;
          for (let dx = -1; dx <= 1 && !close; dx++) for (let dy = -1; dy <= 1 && !close; dy++) if (isPath(sim.state, r.x + dx, r.y + dy)) close = true;
          if (!close) continue;
          near++;
          if (isPath(sim.state, r.x, r.y)) onPath++;
        }
      }
    }
    console.log(`steps near a path that are on it: ${((onPath / near) * 100).toFixed(0)}% (${onPath}/${near})`);
    expect(onPath / near).toBeGreaterThanOrEqual(0.6);
  });
});
