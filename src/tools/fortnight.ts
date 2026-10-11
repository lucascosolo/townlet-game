// The second fortnight (spec 9.3, the plan of 2026-10-11, Phase D criterion 6): how much there is
// to decide on days 15-30 against days 1-14, counted headless so round 8's claim can be checked as
// numbers. Prints one JSON line per steward and seed:
//   npx tsx src/tools/fortnight.ts [seeds=5]
import { runScenario } from '../scenarios/index.js';
import { at, dayOf } from '../sim/time.js';
import type { SimEvent } from '../sim/types.js';

const seeds = Number(process.argv[2] ?? 5);
type Counts = { proposals: number; asks: number; dreamSteps: number; dreamsLetGo: number; arrivals: number; leavingWarnings: number; storesAsks: number };
const empty = (): Counts => ({ proposals: 0, asks: 0, dreamSteps: 0, dreamsLetGo: 0, arrivals: 0, leavingWarnings: 0, storesAsks: 0 });

for (const steward of ['none', 'considerate'] as const) {
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = runScenario('quiet', seed, steward);
    const first = empty();
    const second = empty();
    sim.on((e: SimEvent) => {
      const c = dayOf(e.t) <= 14 ? first : second;
      if (e.type === 'dilemma_posted') c.proposals++;
      else if (e.type === 'request_posted') c.asks++;
      else if (e.type === 'aspiration' && !e.kind) c.dreamSteps++;
      else if (e.type === 'dream_let_go') c.dreamsLetGo++;
      else if (e.type === 'arrived') c.arrivals++;
      else if (e.type === 'thinking_of_leaving') c.leavingWarnings++;
      else if (e.type === 'stores' && e.phase === 'asked') c.storesAsks++;
    });
    sim.runUntil(at(29, 0));
    const sum = (c: Counts) => c.proposals + c.asks + c.dreamSteps + c.arrivals + c.leavingWarnings + c.storesAsks;
    console.log(JSON.stringify({ steward, seed, days1to14: { ...first, total: sum(first) }, days15to28: { ...second, total: sum(second) } }));
  }
}
