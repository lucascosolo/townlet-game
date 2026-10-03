// Twin tests, after brain-sim's trained-versus-never-trained baselines: two copies of the same
// town, identical except for one experience, must diverge measurably and in the intended
// direction. These are the tests that say memory matters.
import { describe, expect, it } from 'vitest';
import { bakeryScenario, quietScenario } from '../src/scenarios/bakery.js';
import { Simulation, type Scenario } from '../src/sim/sim.js';
import { at } from '../src/sim/time.js';
import type { ResidentState } from '../src/sim/types.js';
import { SEEDS } from './helpers.js';

const withBakeryAt = (x: number, y: number, extra: Scenario['commands'] = []): Scenario => ({
  ...bakeryScenario,
  commands: [{ at: at(2, 8), kind: 'build', type: 'bakery', x, y }, ...extra],
});

const told = (r: ResidentState, subject: string) =>
  [...Object.values(r.beliefs), ...Object.values(r.traces)].some((b) => b.subject === subject && b.sources.some((s) => s.kind === 'told'));

describe('twin: night noise becomes a belief and a request', () => {
  it('Ada complains about a bakery beside her cottage, and not about one across town', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const near = Simulation.fromScenario(withBakeryAt(5, 8), seed);
      const far = Simulation.fromScenario(withBakeryAt(19, 21), seed);
      near.runDays(6);
      far.runDays(6);
      const nearAda = near.resident('ada');
      const farAda = far.resident('ada');
      const bakeryNear = near.state.buildings.find((b) => b.type === 'bakery')!;
      const bakeryFar = far.state.buildings.find((b) => b.type === 'bakery')!;
      expect(nearAda.beliefs[`b:${bakeryNear.id}|noisy_at_night`], `seed ${seed}`).toBeDefined();
      expect(near.state.requests.some((q) => q.by === 'ada'), `seed ${seed}`).toBe(true);
      expect(farAda.beliefs[`b:${bakeryFar.id}|noisy_at_night`], `seed ${seed}`).toBeUndefined();
      expect(far.state.requests).toHaveLength(0);
    }
  });
});

describe('twin: the steward is judged on answering requests', () => {
  it('planting the hedge earns trust; ignoring the request costs it', { timeout: 60_000 }, () => {
    const hedges: NonNullable<Scenario['commands']> = [
      { at: at(6, 10), kind: 'build', type: 'hedge', x: 5, y: 7 },
      { at: at(6, 10), kind: 'build', type: 'hedge', x: 6, y: 7 },
    ];
    let helpedTrust = 0;
    let ignoredTrust = 0;
    for (const seed of SEEDS) {
      const helped = Simulation.fromScenario(withBakeryAt(5, 8, hedges), seed);
      const ignored = Simulation.fromScenario(withBakeryAt(5, 8), seed);
      helped.runDays(14);
      ignored.runDays(14);
      expect(helped.state.requests.some((q) => q.by === 'ada' && q.status === 'fulfilled'), `seed ${seed}`).toBe(true);
      expect(ignored.state.requests.some((q) => q.by === 'ada' && q.status === 'lapsed'), `seed ${seed}`).toBe(true);
      expect(helped.resident('ada').beliefs['steward|listens_to_me'], `seed ${seed}`).toBeDefined();
      helpedTrust += helped.resident('ada').rel.steward!.trust;
      ignoredTrust += ignored.resident('ada').rel.steward!.trust;
    }
    expect(helpedTrust).toBeGreaterThan(ignoredTrust + 0.2 * SEEDS.length);
  });
});

describe('twin: word gets around', () => {
  it("a grievance planted in one resident reaches others' minds as hearsay", { timeout: 60_000 }, () => {
    let reachedWith = 0;
    let reachedWithout = 0;
    for (const seed of SEEDS) {
      const base = Simulation.fromScenario(quietScenario, seed);
      base.runDays(3);
      const twin = base.clone();
      for (let i = 0; i < 3; i++) {
        base.perceive('juniper', { subject: 'r:marlow', aspect: 'rude_to_me', valence: -0.8, base: 0.9, source: 'witnessed', note: 'Marlow mocked the glasshouse plans' });
      }
      base.runDays(6);
      twin.runDays(6);
      const others = (sim: Simulation) => sim.state.order.filter((id) => id !== 'juniper' && id !== 'marlow' && told(sim.resident(id), 'r:marlow')).length;
      reachedWith += others(base);
      reachedWithout += others(twin);
    }
    expect(reachedWithout).toBe(0);
    expect(reachedWith).toBeGreaterThanOrEqual(SEEDS.length);
  });
});

describe('twin: memories change behaviour', () => {
  it('a fond memory of the bench draws Fen back to it', { timeout: 60_000 }, () => {
    let withMemory = 0;
    let without = 0;
    for (const seed of SEEDS) {
      const base = Simulation.fromScenario(quietScenario, seed);
      base.runDays(2);
      const bench = base.state.buildings.find((b) => b.type === 'bench')!;
      const twin = base.clone();
      for (let i = 0; i < 3; i++) {
        base.perceive('fen', { subject: `b:${bench.id}`, aspect: 'good_times', valence: 0.8, base: 0.8, source: 'witnessed', note: 'a perfect evening on the bench' });
      }
      const minutesAt = (sim: Simulation) => {
        let n = 0;
        for (let t = 0; t < 5 * 1440; t++) {
          sim.step();
          if (sim.resident('fen').at === bench.id) n++;
        }
        return n;
      };
      withMemory += minutesAt(base);
      without += minutesAt(twin);
    }
    expect(withMemory).toBeGreaterThan(without * 1.5 + 60);
  });
});
