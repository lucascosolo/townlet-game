import { describe, expect, it } from 'vitest';
import { bakeryScenario } from '../src/scenarios/bakery.js';
import { MAX_BELIEFS, MAX_EPISODES } from '../src/sim/mind/memory.js';
import { Simulation } from '../src/sim/sim.js';
import { NEEDS } from '../src/sim/types.js';
import { soakRun } from '../src/soak/soak.js';

describe('invariants', () => {
  it('needs, mood and relationships stay in range and memory stays bounded', { timeout: 180_000 }, () => {
    const sim = Simulation.fromScenario(bakeryScenario, 11);
    for (let day = 0; day < 21; day++) {
      sim.runDays(1);
      for (const id of sim.state.order) {
        const r = sim.resident(id);
        for (const n of NEEDS) {
          expect(r.needs[n]).toBeGreaterThanOrEqual(0);
          expect(r.needs[n]).toBeLessThanOrEqual(1);
        }
        expect(r.mood).toBeGreaterThanOrEqual(0);
        expect(r.mood).toBeLessThanOrEqual(1);
        expect(r.episodes.length).toBeLessThanOrEqual(MAX_EPISODES);
        expect(Object.keys(r.beliefs).length).toBeLessThanOrEqual(MAX_BELIEFS);
        for (const x of Object.values(r.rel)) {
          expect(Math.abs(x.affinity)).toBeLessThanOrEqual(1);
          expect(x.trust).toBeGreaterThanOrEqual(0);
          expect(x.trust).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('short soak runs show no degenerate state', { timeout: 300_000 }, () => {
    for (const seed of [1, 2, 3]) {
      const m = soakRun('quiet', seed, 21);
      expect(m.flags, `seed ${seed}`).toEqual([]);
    }
  });
});
