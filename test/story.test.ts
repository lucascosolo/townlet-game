// M1.5 criteria (spec 9.3, predeclared 2026-10-03). Each test names the criterion it checks.
import { describe, expect, it } from 'vitest';
import { runScenario } from '../src/scenarios/index.js';
import { Simulation } from '../src/sim/sim.js';
import { dilemmaDef, stanceScore } from '../src/sim/story/dilemmas.js';
import { at } from '../src/sim/time.js';
import type { SimEvent } from '../src/sim/types.js';
import { soak } from '../src/soak/soak.js';
import { SEEDS } from './helpers.js';

const NOTABLE_EXCHANGES = new Set(['argue', 'comfort', 'apologize', 'reminisce', 'share_opinion']);

function isNotable(e: SimEvent): boolean {
  switch (e.type) {
    case 'story':
    case 'dilemma_posted':
    case 'belief_formed':
    case 'request_posted':
    case 'relationship':
    case 'weather':
      return true;
    case 'gathering':
      return e.phase === 'announced';
    case 'exchange':
      return NOTABLE_EXCHANGES.has(e.kind);
    default:
      return false;
  }
}

describe('criterion 1: early story', () => {
  it('days 1-3 of the quiet town hold at least 6 notable events on every seed', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      let n = 0;
      sim.on((e) => {
        if (isNotable(e)) n++;
      });
      sim.runUntil(at(4, 0));
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('criteria 2, 3 and 7: pacing, gentle friction, spread (soak, 10 seeds x 28 days)', () => {
  it('meets the predeclared bands', { timeout: 180_000 }, () => {
    const report = soak({ scenario: 'quiet', seeds: 10, days: 28 });
    const runs = report.runs;
    for (const m of runs) expect(m.minNegativeGapHours, `seed ${m.seed}`).toBeGreaterThanOrEqual(48);
    const meanRivals = runs.reduce((s, m) => s + m.rivalPairs, 0) / runs.length;
    expect(meanRivals).toBeGreaterThanOrEqual(0.5);
    expect(meanRivals).toBeLessThanOrEqual(4);
    expect(runs.filter((m) => m.arguments > 0).length).toBeGreaterThanOrEqual(7);
    expect(runs.filter((m) => m.departures > 0).length).toBeLessThanOrEqual(1);
    const meanBusiest = runs.reduce((s, m) => s + m.busiestShare, 0) / runs.length;
    expect(meanBusiest).toBeLessThan(0.6);
    expect(report.flagged).toBe(false);
  });
});

describe('criterion 4: neglect versus care', () => {
  it('neglect starts thoughts of leaving; care does not', { timeout: 120_000 }, () => {
    let neglectedSeeds = 0;
    for (const seed of SEEDS) {
      const leaving = (sim: Simulation) => {
        let n = 0;
        sim.on((e) => {
          if (e.type === 'thinking_of_leaving') n++;
        });
        sim.runDays(28);
        return n;
      };
      if (leaving(runScenario('neglect', seed)) > 0) neglectedSeeds++;
      expect(leaving(runScenario('caring', seed)), `caring seed ${seed}`).toBe(0);
    }
    expect(neglectedSeeds).toBeGreaterThanOrEqual(4);
  });

  it('a resident thinking of leaving can be won back', { timeout: 120_000 }, () => {
    let wonBack = 0;
    let tried = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('neglect', seed);
      let who: string | null = null;
      sim.on((e) => {
        if (e.type === 'thinking_of_leaving' && who === null) who = e.who;
      });
      while (who === null && sim.tick < at(29, 0)) sim.step();
      if (who === null) continue;
      tried++;
      const ignored = sim.clone();
      const cared = sim.clone();
      const id: string = who;
      // The steward finally pays attention: a few days of answered asks and kindness.
      let stayed = false;
      cared.on((e) => {
        if (e.type === 'decided_to_stay' && e.who === id) stayed = true;
      });
      for (let d = 0; d < 7; d++) {
        cared.perceive(id, { subject: 'steward', aspect: 'listens_to_me', valence: 1, base: 1, source: 'witnessed', note: 'the steward came to see me' });
        cared.runDays(1);
        ignored.runDays(1);
      }
      if (stayed && !cared.resident(id).departed) wonBack++;
      expect(ignored.resident(id).departed || ignored.resident(id).leaving !== null, `seed ${seed}`).toBe(true);
    }
    expect(tried).toBeGreaterThanOrEqual(4);
    expect(wonBack).toBe(tried);
  });
});

describe('criterion 5: festivals leave shared memories', () => {
  it('attendees remember the festival together and grow closer than in a town without it', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(5, 12));
      const festival = sim.state.story.gatherings.find((g) => g.kind === 'festival');
      expect(festival, `seed ${seed}`).toBeDefined();
      const twin = sim.clone();
      twin.state.story.gatherings = twin.state.story.gatherings.filter((g) => g.kind !== 'festival');
      sim.runUntil(at(6, 9));
      twin.runUntil(at(6, 9));
      const memory = sim.state.story.memories.find((m) => m.kind === 'festival');
      expect(memory, `seed ${seed}`).toBeDefined();
      const attendees = memory!.attendees;
      expect(attendees.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      for (const id of attendees) {
        const r = sim.resident(id);
        const held = [...r.episodes, ...r.buffer].some((ep) => ep.subject === `m:${memory!.id}`);
        expect(held, `seed ${seed} ${id}`).toBe(true);
      }
      let withFestival = 0;
      let without = 0;
      for (const a of attendees) {
        for (const b of attendees) {
          if (a === b) continue;
          withFestival += sim.resident(a).rel[b]!.affinity;
          without += twin.resident(a).rel[b]!.affinity;
        }
      }
      expect(withFestival, `seed ${seed}`).toBeGreaterThan(without);
    }
  });
});

describe('criterion 6: dilemmas split the town by values', () => {
  it("approving moves the steward's standing up with supporters and down with opponents", { timeout: 60_000 }, () => {
    const def = dilemmaDef('market_day');
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(1, 9));
      sim.state.story.dilemmas = sim.state.story.dilemmas.filter((d) => d.status !== 'open');
      const id = sim.state.story.nextId++;
      sim.state.story.dilemmas.push({ id, type: 'market_day', proposer: 'marlow', postedTick: sim.tick, status: 'open' });
      const approved = sim.clone();
      const declined = sim.clone();
      approved.decide(id, 'approve');
      declined.decide(id, 'decline');
      approved.runDays(1);
      declined.runDays(1);
      let supporters = 0;
      let opponents = 0;
      for (const rid of sim.state.order) {
        const score = rid === 'marlow' ? 1 : stanceScore(sim.resident(rid), def);
        const up = approved.resident(rid).rel.steward!.affinity - declined.resident(rid).rel.steward!.affinity;
        if (score > 0.3) {
          supporters++;
          expect(up, `seed ${seed} ${rid} supports`).toBeGreaterThan(0);
        } else if (score < -0.3) {
          opponents++;
          expect(up, `seed ${seed} ${rid} opposes`).toBeLessThan(0);
        }
      }
      expect(supporters).toBeGreaterThan(0);
      expect(opponents).toBeGreaterThan(0);
    }
  });
});
