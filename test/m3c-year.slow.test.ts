// M3c criteria 2 and 3 over a year (112 days) with the favour-asking steward, seeds 1-5.
// Slow: excluded from npm test; runs in the nightly slow-checks workflow (npm run test:slow).
import { describe, expect, it } from 'vitest';
import { runScenario } from '../src/scenarios/index.js';
import { cottageSpot } from '../src/scenarios/steward.js';
import { TICKS_PER_DAY } from '../src/sim/time.js';
import { SEEDS } from './helpers.js';

describe('criteria 2 and 3 over a year', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: plots cleared, room for cottages, newcomers who make friends`, { timeout: 600_000 }, () => {
      const sim = runScenario('quiet', seed, 'favours');
      let cleared = 0;
      let noRoom = 0;
      const arrivals: Array<{ who: string; t: number }> = [];
      const friendedBy28 = new Set<string>();
      sim.on((e) => {
        if (e.type === 'plot_cleared') cleared++;
        if (e.type === 'arrived') arrivals.push({ who: e.who, t: e.t });
        if (e.type === 'dawn') {
          if (!cottageSpot(sim)) noRoom++;
          for (const a of arrivals) {
            if (e.t - a.t > 28 * TICKS_PER_DAY) continue;
            const r = sim.state.residents[a.who];
            if (r && Object.values(r.rel).some((x) => x.tags.includes('friend'))) friendedBy28.add(a.who);
          }
        }
      });
      sim.runDays(112);
      expect(cleared).toBeGreaterThanOrEqual(2);
      expect(noRoom).toBe(0);
      expect(arrivals.length).toBeGreaterThanOrEqual(3);
      // Only those who have had their 28 days count.
      const due = arrivals.filter((a) => sim.state.tick - a.t >= 28 * TICKS_PER_DAY);
      expect(due.filter((a) => friendedBy28.has(a.who)).length).toBeGreaterThanOrEqual(Math.ceil((2 / 3) * due.length));
    });
  }
});
