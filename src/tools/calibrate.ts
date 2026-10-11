// Phase C calibration (spec 9.3, the plan of 2026-10-11): the tuned measures that the routing fix of
// 2026-10-10 tipped, measured on seeds 1-10 so the fix can be judged against means, not one seed's
// knife edge. Prints one JSON line per measure and seed:
//   npx tsx src/tools/calibrate.ts [seeds=10] > before.jsonl
import { townWorries } from '../narrate/board.js';
import { runScenario } from '../scenarios/index.js';
import { dayOfMeals } from '../sim/hunger.js';
import type { Simulation } from '../sim/sim.js';
import { LARDER_CAP } from '../sim/stores.js';
import { at } from '../sim/time.js';
import type { SimEvent } from '../sim/types.js';
import { soak } from '../soak/soak.js';

const seeds = Number(process.argv[2] ?? 10);
const here = (sim: Simulation) => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
const meanMood = (sim: Simulation) => here(sim).reduce((s, r) => s + r.mood, 0) / Math.max(1, here(sim).length);
const out = (measure: string, seed: number, value: number, bar: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ measure, seed, value: Number(value.toFixed(4)), bar, ...extra }));

for (let seed = 1; seed <= seeds; seed++) {
  // Round 4: a larder held low for a week lowers mean mood (bar 0.025 every seed; 0.06 as declared).
  {
    const make = () => {
      const sim = runScenario('bakery', seed, 'considerate', { scripted: false });
      sim.runUntil(at(12, 23));
      return sim;
    };
    const a = make();
    const b = make();
    for (let t = at(13, 0); t <= at(19, 12); t++) {
      a.state.stock.food = Math.min(a.state.stock.food, Math.max(1, dayOfMeals(a.state) / 4));
      a.state.granary = 0;
      a.runUntil(t);
    }
    b.runUntil(at(19, 12));
    out('larder_mood_drop', seed, meanMood(b) - meanMood(a), '>= 0.025 (0.06 declared)');
  }
  // Round 4: a neglected quiet town is glummer on day 21 than day 2 (bar 0.08 every seed; 0.10 declared).
  {
    const sim = runScenario('quiet', seed, 'none');
    sim.runUntil(at(2, 12));
    const before = meanMood(sim);
    sim.runUntil(at(21, 12));
    out('neglected_drop', seed, before - meanMood(sim), '>= 0.08 (0.10 declared)');
  }
  // Winter stores: days at the larder cap with the considerate steward (bar <= 2), and what the stores hold against the target.
  for (const steward of ['considerate', 'favours'] as const) {
    const sim = runScenario('quiet', seed, steward);
    let outcome: Extract<SimEvent, { type: 'stores' }> | null = null;
    sim.on((e) => {
      if (e.type === 'stores' && (e.phase === 'met' || e.phase === 'short') && !outcome) outcome = e;
    });
    let capDays = 0;
    for (let d = 1; d <= 28; d++) {
      sim.runUntil(at(d + 1, 0));
      if (sim.state.stock.food >= LARDER_CAP - 0.5) capDays++;
    }
    if (steward === 'considerate') out('larder_cap_days', seed, capDays, '<= 2');
    const o = outcome as Extract<SimEvent, { type: 'stores' }> | null;
    out(`stores_${steward}`, seed, o ? (o.stored ?? 0) - (o.target ?? 0) : NaN, 'met: stored >= target', { phase: o?.phase, stored: o?.stored, target: o?.target });
  }
  // Round 7: eating the winter stores early lowers mood (bar 0.02, seed 1 only in the test).
  {
    const sim = runScenario('quiet', seed, 'none');
    sim.runUntil(at(5, 6));
    const a = sim.clone();
    const b = sim.clone();
    for (let t = at(5, 6); t <= at(7, 12); t += 30) {
      a.state.stock.food = 0;
      a.state.granary = 200;
      b.state.stock.food = 40;
      b.state.granary = 200;
      a.runUntil(t);
      b.runUntil(t);
    }
    a.state.stock.food = 0;
    out('early_stores_mood', seed, meanMood(b) - meanMood(a), '>= 0.02', { named: townWorries(a.state).some((w) => /winter stores/.test(w)) });
  }
}
// Story soak: rival pairs mean over 10 seeds (bar 0.5 to 4), arguments on 7 of 10, negative gap 48h.
{
  const report = soak({ scenario: 'quiet', seeds: 10, days: 28 });
  const runs = report.runs;
  out('story_rivals_mean', 0, runs.reduce((s, m) => s + m.rivalPairs, 0) / runs.length, '0.5 to 4', { perSeed: runs.map((m) => m.rivalPairs) });
  out('story_arguments_seeds', 0, runs.filter((m) => m.arguments > 0).length, '>= 7');
  out('story_min_gap_hours', 0, Math.min(...runs.map((m) => m.minNegativeGapHours)), '>= 48');
}
