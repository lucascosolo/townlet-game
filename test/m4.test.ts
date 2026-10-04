// M4 criteria 1–2 (spec 9.3, predeclared 2026-10-04): writing and minds, and tension in the economy.
import { describe, expect, it } from 'vitest';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { at } from '../src/sim/time.js';
import { WINTER_DAY } from '../src/sim/stores.js';
import { SEEDS } from './helpers.js';

const quotes = (text: string) => [...text.matchAll(/"([^"]{4,})"/g)].map((m) => m[1] as string);

describe('criterion 1: writing and minds', { timeout: 300_000 }, () => {
  const logs = SEEDS.map((seed) => {
    const sim = runScenario('quiet', seed, 'favours');
    const narrator = new Narrator(sim);
    sim.runUntil(at(22, 0));
    const day21 = narrator.text();
    sim.runUntil(at(29, 0));
    return { seed, day21, day28: narrator.text() };
  });

  it('no broken articles, plural names after "a", or stacked tics in 28 days', () => {
    for (const { seed, day28 } of logs) {
      expect(day28.match(/\b[Aa] [aeiou]\w+/g) ?? [], `seed ${seed}`).toEqual([]);
      expect(day28.match(/\ban? \w+ plots\b/gi) ?? [], `seed ${seed}`).toEqual([]);
      expect(day28.match(/\?,/g) ?? [], `seed ${seed}`).toEqual([]);
    }
  });

  it('the steward is in at most 12% of quoted lines; no line more than 10 times; at least 65% unique (21 days)', () => {
    for (const { seed, day21 } of logs) {
      const q = quotes(day21);
      const counts = new Map<string, number>();
      for (const x of q) counts.set(x, (counts.get(x) ?? 0) + 1);
      const steward = q.filter((x) => /\bsteward\b/i.test(x)).length / q.length;
      const most = Math.max(...counts.values());
      console.log(`seed ${seed}: ${q.length} quotes, steward ${(steward * 100).toFixed(1)}%, most repeated ${most}, unique ${((counts.size / q.length) * 100).toFixed(0)}%`);
      expect(steward, `seed ${seed}`).toBeLessThanOrEqual(0.12);
      expect(most, `seed ${seed}`).toBeLessThanOrEqual(10);
      expect(counts.size / q.length, `seed ${seed}`).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('opinions of people never use the place lines', { timeout: 300_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    const narrator = new Narrator(sim);
    sim.runUntil(at(3, 10));
    for (const id of sim.state.order) for (const o of sim.state.order) if (o !== id) sim.talk(id, 'opinion', `r:${o}`);
    const answers = narrator.entries.filter((e) => /^You ask|asks? .* what .* think/.test(e.text) || e.text.includes('think of')).map((e) => e.text);
    expect(answers.join('\n')).not.toMatch(/\b(Ada|Bram|Fen|Juniper|Marlow|Wren)\? (I like it|Good stuff|Love it)/);
  });

  it('a dream step waiting on a building advances within the hour it goes up', { timeout: 300_000 }, () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const built = new Map<string, number>();
      const late: string[] = [];
      sim.on((e) => {
        if (e.type === 'built') built.set(e.btype, e.t);
        if (e.type === 'aspiration' && e.who === 'juniper' && e.stage === 'built') {
          checked++;
          const t = built.get('glasshouse');
          if (t === undefined || e.t - t > 60) late.push(`seed ${seed}: built ${t}, step ${e.t}`);
        }
      });
      sim.runUntil(at(22, 0));
      expect(late).toEqual([]);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('criterion 2: tension in the economy', () => {
  it('a favour costs the resident their own job output for those hours', { timeout: 300_000 }, () => {
    const made = (favour: boolean) => {
      const sim = runScenario('quiet', 2, 'none');
      sim.runUntil(at(3, 7, 30));
      if (favour) {
        sim.schedule([{ at: sim.state.tick, kind: 'favour', who: 'bram', favour: 'timber' }]);
        sim.flushCommands();
        expect(sim.resident('bram').favour, 'Bram agreed').toBeTruthy();
      }
      sim.runUntil(at(3, 18));
      return sim.state.produced?.bram?.food ?? 0;
    };
    const baked = made(false);
    const bakedWhileHelping = made(true);
    console.log(`Bram's bread on day 3: ${baked.toFixed(1)} without a favour, ${bakedWhileHelping.toFixed(1)} after cutting timber for you`);
    expect(bakedWhileHelping).toBeLessThan(baked);
  });

  it('with the favour-asking steward, timber sits at its cap on at most 5 of 28 days', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'favours');
      let capped = 0;
      for (let d = 1; d <= 28; d++) {
        sim.runUntil(at(d + 1, 0));
        if (sim.state.stock.timber >= 99.5) capped++;
      }
      expect(capped, `seed ${seed}`).toBeLessThanOrEqual(5);
    }
  });

  it('with no granary, at least 3 of 5 seeds go short in winter', { timeout: 300_000 }, () => {
    let short = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const schedule = sim.schedule.bind(sim);
      sim.schedule = (cs) => schedule(cs.filter((c) => !(c.kind === 'build' && c.type === 'granary')));
      let days = 0;
      sim.on((e) => {
        if (e.type === 'shortage' && e.t >= at(WINTER_DAY, 0)) days++;
      });
      sim.runUntil(at(29, 0));
      console.log(`seed ${seed}: ${days} winter days short without a granary`);
      if (days > 0) short++;
    }
    expect(short).toBeGreaterThanOrEqual(3);
  });
});
