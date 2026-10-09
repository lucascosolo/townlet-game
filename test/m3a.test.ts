// M3a criteria 1-4 (spec 9.3, predeclared 2026-10-03): alive minds.
import { describe, expect, it } from 'vitest';
import { currentStage } from '../src/sim/story/aspirations.js';
import { ASPIRATION_LINES } from '../src/content/story.js';
import { MIND_LINES } from '../src/content/thoughts.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { mindTopics, topOfMind } from '../src/sim/mind/thoughts.js';
import type { Simulation } from '../src/sim/sim.js';
import { ASPIRATIONS } from '../src/sim/story/aspirations.js';
import { at } from '../src/sim/time.js';
import type { SimEvent } from '../src/sim/types.js';
import { SEEDS } from './helpers.js';

/** Has the resident seen their first, authored dream through? (Later dreams form after it, M3b.) */
const firstDreamDone = (sim: Simulation, id: string) => {
  const a = sim.state.residents[id]?.aspiration;
  return !!a && ((a.completed ?? 0) >= 1 || (!a.kind && a.done));
};

const doneAfter28 = (steward: 'considerate' | 'none', seed: number) => {
  const sim = runScenario('quiet', seed, steward);
  sim.runUntil(at(29, 0));
  return sim.state.order.filter((id) => firstDreamDone(sim, id)).length;
};

describe('criterion 1: aspirations', () => {
  it('every stage has a narrated line', () => {
    for (const a of Object.values(ASPIRATIONS)) {
      for (const s of a.stages) {
        if (a.who === 'marlow' && s.id === 'decide') {
          expect(ASPIRATION_LINES['marlow:decide:stay']).toBeTruthy();
          expect(ASPIRATION_LINES['marlow:decide:leave']).toBeTruthy();
        } else expect(ASPIRATION_LINES[`${a.who}:${s.id}`], `${a.who}:${s.id}`).toBeTruthy();
      }
    }
  });

  it('a considerate steward sees at least 3 of 6 dreams through in 28 days, on average, and each step is narrated', { timeout: 300_000 }, () => {
    let total = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const narrator = new Narrator(sim);
      const steps: Array<Extract<SimEvent, { type: 'aspiration' }>> = [];
      sim.on((e) => {
        if (e.type === 'aspiration' && !e.kind) steps.push(e);
      });
      sim.runUntil(at(29, 0));
      total += sim.state.order.filter((id) => firstDreamDone(sim, id)).length;
      for (const s of steps) {
        const line = ASPIRATION_LINES[`${s.who}:${s.stage}${s.outcome ? `:${s.outcome}` : ''}`] as string;
        const opening = line.split(/[{"]/)[0]?.trim() as string;
        expect(narrator.text(), `seed ${seed} ${s.who}:${s.stage}`).toContain(opening);
      }
    }
    expect(total / SEEDS.length).toBeGreaterThanOrEqual(3);
  });

  // MISSED, reported in spec 9.3: Fen's and Marlow's plans need nothing from the steward, so a
  // do-nothing steward still sees 2 of 6 through. Kept as an expected failure so it is visible
  // and flips the day the bound is met.
  it.fails('a do-nothing steward sees at most 1.5 of 6 through (missed: 2.0)', { timeout: 300_000 }, () => {
    let total = 0;
    for (const seed of SEEDS) total += doneAfter28('none', seed);
    expect(total / SEEDS.length).toBeLessThanOrEqual(1.5);
  });
});

describe("criterion 2: Marlow's choice", () => {
  it('resolves within the year: strong ties, he stays; isolated, he goes', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      for (const isolate of [false, true]) {
        const sim = runScenario('quiet', seed, 'considerate');
        // Bar round 3: he decides within nine days of starting to think it over, so the twin is
        // made the morning that step begins rather than on day 22.
        const m = sim.resident('marlow');
        while (sim.tick < at(26, 0) && currentStage(sim.state, m)?.id !== 'decide' && !m.aspiration.done) sim.runUntil(sim.tick + 60);
        if (isolate) {
          // The twin: same town, same day, but nobody close and nothing holding him.
          for (const [id, x] of Object.entries(m.rel)) {
            if (id === 'steward') {
              x.affinity = 0;
              continue;
            }
            x.affinity = -0.1;
            x.tags = [];
            const back = sim.resident(id).rel.marlow;
            if (back) {
              back.affinity = -0.1;
              back.tags = [];
            }
          }
          m.disposition = 0.5;
        }
        // Bar round 2: deciding to go gives the week's notice anyone else gets, and a good week can turn it round.
        let stayed = false;
        let outcome: string | undefined;
        let noticed = m.leaving !== null;
        sim.on((e) => {
          if (e.type === 'decided_to_stay' && e.who === 'marlow') stayed = true;
          if (e.type === 'thinking_of_leaving' && e.who === 'marlow') noticed = true;
          if (e.type === 'aspiration' && e.who === 'marlow' && e.outcome && !outcome) outcome = e.outcome;
        });
        if (m.aspiration.outcome) outcome = m.aspiration.outcome;
        sim.runUntil(Math.max(at(24, 12), sim.tick + 10 * 1440));
        expect(firstDreamDone(sim, 'marlow'), `seed ${seed}`).toBe(true);
        // Bar round 3: a step that needs nothing from you finishes within nine days, so he may decide
        // earlier than day 23 and move on to a new dream; the decision is read from when he made it.
        expect(outcome, `seed ${seed} isolated=${isolate}`).toBe(isolate ? 'leave' : 'stay');
        // He gives notice when he decides; a good week may since have turned it round, so the notice is read from the event.
        expect(noticed || m.departed, `seed ${seed} isolated=${isolate}: thinking of leaving`).toBe(isolate);
        sim.runUntil(sim.tick + 8 * 1440);
        expect(sim.resident('marlow').departed, `seed ${seed} isolated=${isolate}`).toBe(isolate && !stayed);
      }
    }
  });
});

type PairKind = 'friend' | 'neutral' | 'rival';

/** Directed: how a sees b. */
function pairKind(sim: Simulation, a: string, b: string): PairKind {
  const tags = sim.state.residents[a]?.rel[b]?.tags ?? [];
  if (tags.includes('rival')) return 'rival';
  if (tags.includes('friend')) return 'friend';
  return 'neutral';
}

/** Share of directed pair-minutes each kind of pair spends together awake (same place, or side by side). */
function coLocation(steward: 'considerate' | 'random') {
  const together: Record<PairKind, number> = { friend: 0, neutral: 0, rival: 0 };
  const possible: Record<PairKind, number> = { friend: 0, neutral: 0, rival: 0 };
  let invites = 0;
  let residentWeeks = 0;
  for (const seed of SEEDS) {
    const sim = runScenario('quiet', seed, steward);
    sim.on((e) => {
      if (e.type === 'invite') invites++;
    });
    const end = at(29, 0);
    while (sim.state.tick < end) {
      sim.step();
      if (sim.state.tick % 5 !== 0) continue;
      const ids = sim.state.order.filter((id) => !sim.state.residents[id]?.departed);
      for (let i = 0; i < ids.length; i++) {
        for (let j = 0; j < ids.length; j++) {
          if (i === j) continue;
          const a = sim.resident(ids[i] as string);
          const b = sim.resident(ids[j] as string);
          const k = pairKind(sim, a.id, b.id);
          possible[k] += 5;
          if (a.activity?.id === 'sleep' || b.activity?.id === 'sleep') continue;
          const samePlace = a.at !== null && a.at === b.at && a.path.length === 0 && b.path.length === 0;
          if (samePlace || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1) together[k] += 5;
        }
      }
    }
    residentWeeks += sim.state.order.length * 4;
  }
  const share = (k: PairKind) => (possible[k] > 0 ? together[k] / possible[k] : NaN);
  return { friend: share('friend'), neutral: share('neutral'), rival: share('rival'), rivalMinutes: possible.rival, invitesPerWeek: invites / residentWeeks };
}

describe('criterion 3: relationships you can see', () => {
  it('friends spend at least twice the time together that others do, rivals less, and friends call on each other twice a week', { timeout: 240_000 }, () => {
    const c = coLocation('considerate');
    expect(c.friend / c.neutral).toBeGreaterThanOrEqual(2);
    expect(c.invitesPerWeek).toBeGreaterThanOrEqual(2);
  });

  // Regressed in bar round 1 (2026-10-08) and kept visible. On the old code only seed 5 of the five
  // ever formed a rival pair in 28 days under the considerate steward; with mood now moved by the
  // town and the steward, that seed's quarrels play out differently and none forms. Quarrels that
  // stick into rivalries are part of round 2 (opinionated sims), where this is to be met properly.
  // Back after bar round 2 (rivalries form again under the considerate steward), so a plain test once more.
  it('rivals keep apart', { timeout: 240_000 }, () => {
    const c = coLocation('considerate');
    expect(c.rivalMinutes).toBeGreaterThan(0);
    expect(c.rival).toBeLessThan(c.neutral);
  });

  // Bar round 5: 1.98 against the 2 declared under the random builder, after standing began to rest
  // nearer no view; friends are still twice as likely as not to be found together under a
  // considerate steward (above). Kept visible.
  it('friends keep company under a careless steward too, at least 1.9 times as often', { timeout: 240_000 }, () => {
    const c = coLocation('random');
    expect(c.friend / c.neutral).toBeGreaterThanOrEqual(1.9);
  });
  // Met again in bar round 6.
  it('friends keep company under a careless steward too, at least twice as often (missed in round 5: 1.98)', { timeout: 240_000 }, () => {
    const c = coLocation('random');
    expect(c.friend / c.neutral).toBeGreaterThanOrEqual(2);
  });
});

describe('criterion 4: honest, varied talk', () => {
  it('every thought is one of the top three things on their mind; chats draw on the same', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      let thoughts = 0;
      let chats = 0;
      sim.on((e) => {
        if (e.type === 'thought') {
          thoughts++;
          const top = topOfMind(sim.state, sim.resident(e.who), 3);
          expect(top.some((t) => t.key === e.key && t.about === e.about), `seed ${seed} ${e.who} ${e.key}`).toBe(true);
          expect(MIND_LINES[e.key], e.key).toBeTruthy();
        }
        if (e.type === 'exchange' && e.mind) {
          chats++;
          expect(e.mind.rank).toBeLessThan(3);
          expect(e.mind.about).not.toBe(`r:${e.b}`);
          expect(mindTopics(sim.state, sim.resident(e.a)).some((t) => t.key === e.mind?.key)).toBe(true);
        }
      });
      sim.runDays(7);
      expect(thoughts, `seed ${seed}`).toBeGreaterThan(20);
      expect(chats, `seed ${seed}`).toBeGreaterThan(10);
    }
  });

  it('a fresh grievance is thought or talked about within a day', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      sim.runUntil(at(5, 10));
      const t0 = sim.state.tick;
      let voiced = false;
      sim.on((e) => {
        const about = e.type === 'thought' ? e.about : e.type === 'exchange' ? e.mind?.about : undefined;
        const who = e.type === 'thought' ? e.who : e.type === 'exchange' && e.mind ? e.a : undefined;
        if ((who === 'ada' && about === 'r:juniper') || (who === 'juniper' && about === 'r:ada')) voiced = true;
      });
      sim.forceExchange(sim.resident('ada'), sim.resident('juniper'), 'argue', null);
      while (!voiced && sim.state.tick < t0 + 24 * 60) sim.step();
      expect(voiced, `seed ${seed}`).toBe(true);
    }
  });

  it('a 7-day radio play has at least 80 distinct lines, none more than 4% of what is said', { timeout: 300_000 }, () => {
    for (const steward of ['considerate', 'none'] as const) {
      for (const seed of SEEDS) {
        const sim = runScenario('quiet', seed, steward);
        const narrator = new Narrator(sim);
        sim.runDays(7);
        const said = narrator.entries.flatMap((e) => [...e.text.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string));
        const counts = new Map<string, number>();
        for (const s of said) counts.set(s, (counts.get(s) ?? 0) + 1);
        const most = Math.max(...counts.values());
        expect(counts.size, `${steward} seed ${seed}`).toBeGreaterThanOrEqual(80);
        expect(most / said.length, `${steward} seed ${seed}`).toBeLessThanOrEqual(0.04);
      }
    }
  });
});
