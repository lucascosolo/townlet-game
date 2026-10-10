// M2.5 criteria 3, 4, 6 and 7 (spec 9.3, predeclared 2026-10-03).
import { describe, expect, it } from 'vitest';
import { REACTIONS } from '../src/content/voice.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { attachSteward } from '../src/scenarios/steward.js';
import { Simulation } from '../src/sim/sim.js';
import { at, TICKS_PER_DAY } from '../src/sim/time.js';
import type { SimEvent } from '../src/sim/types.js';
import { canPlace, sizeOf } from '../src/sim/world.js';
import { quietScenario } from '../src/scenarios/bakery.js';
import { SEEDS } from './helpers.js';

describe('criterion 3: seeing before reacting', () => {
  it('nobody reacts while asleep; sleepers react on waking or sight, everyone else within a day', { timeout: 180_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(2, 2)); // 2 a.m.: everyone is asleep
      const reactions: Array<Extract<SimEvent, { type: 'reaction' }> & { asleep: boolean }> = [];
      sim.on((e) => {
        if (e.type === 'reaction') {
          const r = sim.resident(e.who);
          reactions.push({ ...e, asleep: r.activity?.id === 'sleep' && r.at === r.activity.placeId });
        }
      });
      sim.build('flowerbed', 4, 7); // by Ada's cottage
      sim.runUntil(at(2, 2) + TICKS_PER_DAY + 10);
      expect(reactions.filter((x) => x.asleep), `seed ${seed}`).toHaveLength(0);
      expect(reactions.filter((x) => x.t < at(2, 3, 30)), `seed ${seed}: nobody reacts in the night`).toHaveLength(0);
      const ada = reactions.find((x) => x.who === 'ada');
      expect(ada?.how, `seed ${seed}`).toBe('woke');
      // Everyone has taken it in, one way or another, within a day.
      for (const id of sim.state.order) expect(sim.resident(id).unseen, `seed ${seed} ${id}`).toHaveLength(0);
    }
  });

  it('every reaction names what changed, and a year shows at least 12 distinct reaction lines', { timeout: 300_000 }, () => {
    const lines = new Set<string>();
    let reactions = 0;
    for (const seed of [1, 2, 3]) {
      const sim = runScenario('quiet', seed, 'considerate');
      const narrator = new Narrator(sim);
      sim.on((e) => {
        if (e.type !== 'reaction') return;
        reactions++;
        expect(Object.keys(REACTIONS)).toContain(e.detail);
      });
      // A steward who keeps building things around the town.
      const plan = ['bench', 'flowerbed', 'hedge', 'garden', 'bench', 'flowerbed', 'woodlot', 'hedge', 'bench'];
      plan.forEach((type, i) => {
        const x = 2 + ((i * 5) % 18);
        const y = 2 + ((i * 7) % 18);
        sim.schedule([{ at: at(2 + i * 3, 10), kind: 'build', type, x, y }]);
      });
      sim.runDays(28);
      for (const l of narrator.lines) if (/(spots|wakes to find|hears about|hears the|sees the)/.test(l)) lines.add(l.replace(/^\S+\s+/, '').replace(/^[^:]+: /, ''));
    }
    expect(reactions).toBeGreaterThan(20);
    expect(lines.size).toBeGreaterThanOrEqual(12);
  });
});

describe('criterion 4: rotation', () => {
  it('a rotated workshop occupies its swapped footprint', () => {
    const sim = Simulation.fromScenario(quietScenario, 1);
    const b = sim.build('workshop', 2, 2, 1);
    expect(sizeOf(b)).toEqual([1, 2]);
    expect(canPlace(sim.state, 'bench', 2, 3)).not.toBeNull(); // covered by the turned workshop
    expect(canPlace(sim.state, 'bench', 3, 2)).toBeNull(); // free: it would be covered unturned
  });
});

describe('criterion 6: being needed', () => {
  it('a responsive steward is valued far above a do-nothing one, and residents ask early', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const measure = (policy: 'none' | 'considerate') => {
        const sim = runScenario('quiet', seed, policy);
        const early = new Set<string>();
        sim.on((e) => {
          if (e.type === 'request_posted' && e.t < 7 * TICKS_PER_DAY) early.add(`${e.request.by}:${e.request.kind}`);
        });
        sim.runDays(28);
        const rs = sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
        return {
          standing: rs.reduce((s, r) => s + (r.rel.steward?.affinity ?? 0), 0) / rs.length,
          disposition: rs.reduce((s, r) => s + r.disposition, 0) / rs.length,
          early: early.size,
        };
      };
      const idle = measure('none');
      const caring = measure('considerate');
      expect(caring.standing - idle.standing, `seed ${seed}`).toBeGreaterThanOrEqual(0.3);
      expect(caring.disposition - idle.disposition, `seed ${seed}`).toBeGreaterThanOrEqual(0.08);
      expect(idle.early, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('criterion 7: thin economy', () => {
  it('building costs timber and an unaffordable build is refused', () => {
    const sim = Simulation.fromScenario(quietScenario, 1);
    const before = sim.state.stock.timber;
    sim.build('bench', 2, 2);
    expect(sim.state.stock.timber).toBe(before - 2);
    sim.state.stock.timber = 3;
    expect(() => sim.build('teahouse', 2, 4)).toThrow(/afford/);
    sim.schedule([{ at: sim.tick, kind: 'build', type: 'teahouse', x: 2, y: 4 }]);
    sim.step();
    expect(sim.state.buildings.some((b) => b.type === 'teahouse' && b.placedBy === 'steward')).toBe(false);
  });

  it('with a responsive steward food runs short on at most 10% of days; idle stewards never starve anyone', { timeout: 600_000 }, () => {
    let shortDays = 0;
    let days = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = runScenario('quiet', seed, 'considerate');
      const short = new Set<number>();
      sim.on((e) => {
        if (e.type === 'shortage') short.add(Math.floor(e.t / TICKS_PER_DAY));
      });
      sim.runDays(28);
      shortDays += short.size;
      days += 28;
    }
    expect(shortDays / days).toBeLessThanOrEqual(0.1);

    for (const seed of SEEDS) {
      const sim = Simulation.fromScenario(quietScenario, seed);
      attachSteward(sim, 'none');
      const hungry = new Map<string, number>();
      const awake = new Map<string, number>();
      for (let h = 0; h < 28 * 24; h++) {
        sim.runUntil(sim.tick + 60);
        for (const id of sim.state.order) {
          const r = sim.resident(id);
          if (r.departed || r.activity?.id === 'sleep') continue;
          awake.set(id, (awake.get(id) ?? 0) + 1);
          if (r.needs.food < 0.1) hungry.set(id, (hungry.get(id) ?? 0) + 1);
        }
      }
      for (const id of sim.state.order) expect((hungry.get(id) ?? 0) / (awake.get(id) ?? 1), `seed ${seed} ${id}`).toBeLessThanOrEqual(0.25);
    }
  });
});
