// M3c criteria 1, 2, 3 and 6 that fit in weeks (spec 9.3, predeclared 2026-10-03; criterion 3
// changed by the owner mid-chunk and recorded there). The year-long checks are in m3c-year.slow.test.ts (npm run test:slow).
import { describe, expect, it } from 'vitest';
import { generateNewcomer, type Welcome } from '../src/content/newcomers.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { considerFavour, openPlots, WILLING } from '../src/sim/favours.js';
import { assess } from '../src/sim/asks.js';
import { rel } from '../src/sim/mind/relationships.js';
import { topOfMind } from '../src/sim/mind/thoughts.js';
import { feelingAbout, feelingBand, moodBand, reconcile } from '../src/sim/talk.js';
import { dreamTitle, nextStep } from '../src/sim/story/aspirations.js';
import { at, TICKS_PER_DAY } from '../src/sim/time.js';
import { TRAITS, VALUES, type SimEvent } from '../src/sim/types.js';
import { SEEDS } from './helpers.js';

const awake = (day: number) => at(day, 10);

describe('criterion 1: favours', () => {
  it('a refusal names a reason that is true of the resident', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(awake(3));
    const state = sim.state;
    const fresh = () => {
      const r = sim.resident('fen');
      r.favour = null;
      r.favoursAsked = [];
      r.coldUntil = -1;
      r.needs.rest = r.setpoints.rest;
      r.mood = 0.8;
      rel(r, 'steward').affinity = 0.3;
      return r;
    };
    let r = fresh();
    expect(considerFavour(state, r, 'timber').yes).toBe(true);
    r = fresh();
    r.coldUntil = state.tick + 600;
    expect(considerFavour(state, r, 'timber').reason).toBe('unwell');
    r = fresh();
    r.needs.rest = 0.02;
    expect(considerFavour(state, r, 'timber').reason).toBe('tired');
    r = fresh();
    r.favoursAsked = [state.tick - 60, state.tick - 1500, state.tick - 3000, state.tick - 4500];
    expect(considerFavour(state, r, 'timber').reason).toBe('asked_often');
    r = fresh();
    rel(r, 'steward').affinity = -0.8;
    expect(considerFavour(state, r, 'timber').reason).toBe('distrust');
    r = fresh();
    r.mood = 0.1;
    expect(considerFavour(state, r, 'timber').reason).toBe('low');
    r = fresh();
    rel(r, 'bram').affinity = -0.8;
    rel(r, 'bram').tags = ['rival'];
    expect(considerFavour(state, r, 'visit', 'bram').reason).toBe('not_speaking');
    r = fresh();
    r.favour = { id: 1, kind: 'catch', placeId: 1, askedTick: state.tick, minutesNeeded: 60, minutes: 0 };
    expect(considerFavour(state, r, 'timber').reason).toBe('busy');
    // A yes is never below the line, a no never above it.
    r = fresh();
    const v = considerFavour(state, r, 'garden');
    expect(v.yes).toBe(v.score >= WILLING);
  });

  it('an accepted favour is done: they go there, spend the time, and the stores rise', { timeout: 180_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(awake(2));
      const events: SimEvent[] = [];
      sim.on((e) => {
        if (e.type === 'favour') events.push(e);
      });
      const before = sim.state.stock.timber;
      const v = sim.askFavour('fen', 'timber');
      expect(v.yes, `seed ${seed}`).toBe(true);
      let seenThere = false;
      for (let i = 0; i < TICKS_PER_DAY && !events.some((e) => e.type === 'favour' && e.phase === 'done'); i++) {
        sim.step();
        if (sim.resident('fen').at === v.placeId) seenThere = true;
      }
      const done = events.find((e) => e.type === 'favour' && e.phase === 'done') as Extract<SimEvent, { type: 'favour' }>;
      expect(seenThere, `seed ${seed}`).toBe(true);
      expect(done, `seed ${seed}`).toBeTruthy();
      expect(done.yield?.timber ?? 0).toBeGreaterThan(0);
      expect(sim.state.stock.timber).toBeGreaterThan(before);
    }
  });

  it('timber income with the favour-asking steward is at least double the income with none', { timeout: 240_000 }, () => {
    const income = (steward: 'favours' | 'none', seed: number) => {
      const sim = runScenario('quiet', seed, steward);
      let timber = 0;
      sim.on((e) => {
        if (e.type === 'production') for (const v of Object.values(e.by)) timber += v.timber ?? 0;
      });
      sim.runDays(28);
      return timber;
    };
    for (const seed of SEEDS) expect(income('favours', seed), `seed ${seed}`).toBeGreaterThanOrEqual(2 * income('none', seed));
  });

  it('twin: asked five favours in five days, a resident thinks less of the steward than when asked one', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const standing = (asks: number) => {
        const sim = runScenario('quiet', seed, 'none');
        for (let d = 0; d < 5; d++) {
          sim.runUntil(awake(3 + d));
          if (d < asks) sim.askFavour('marlow', d % 2 ? 'garden' : 'timber');
        }
        sim.runUntil(at(9, 8));
        return sim.resident('marlow').rel.steward?.affinity ?? 0;
      };
      expect(standing(5), `seed ${seed}`).toBeLessThan(standing(1));
    }
  });
});

describe('criterion 2: a growing valley', () => {
  it('the wild land is at least twice the settled valley, and opens next to settled land in a thriving town', () => {
    const sim = runScenario('quiet', 1, 'none');
    const s = sim.state;
    const settled = (s.settled?.width ?? 0) * (s.settled?.height ?? 0);
    expect(settled).toBe(24 * 24);
    expect(s.width * s.height - settled).toBeGreaterThanOrEqual(2 * settled);
    const open = openPlots(s);
    expect(open.length).toBeGreaterThan(0);
    for (const id of open) {
      const b = s.buildings.find((x) => x.id === id);
      expect(b && (b.x === 24 || b.y === 24)).toBe(true);
    }
    for (const id of s.order) sim.resident(id).disposition = 0.3;
    expect(openPlots(s)).toHaveLength(0);
  });

  it('clearing a plot by favours opens it to build on, and brings in timber', { timeout: 180_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(awake(2));
    const plot = openPlots(sim.state)[0] as number;
    const b = sim.state.buildings.find((x) => x.id === plot) as { x: number; y: number };
    let cleared = false;
    sim.on((e) => {
      if (e.type === 'plot_cleared' && e.building === plot) cleared = true;
    });
    const before = sim.state.stock.timber;
    for (let d = 2; d < 10 && !cleared; d++) {
      sim.runUntil(awake(d));
      for (const id of ['fen', 'marlow', 'bram', 'ada']) sim.askFavour(id, 'clear', undefined, plot);
    }
    sim.runUntil(sim.state.tick + TICKS_PER_DAY);
    expect(cleared).toBe(true);
    expect(sim.state.stock.timber).toBeGreaterThan(before);
    sim.state.stock.timber = 50;
    expect(() => sim.build('cottage', b.x + 2, b.y + 2)).not.toThrow();
  });
});

describe('criterion 3: newcomers', () => {
  it('nobody moves in without an empty home; build one and someone does', { timeout: 180_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runDays(7);
    expect(sim.state.order).toHaveLength(6);
    sim.state.stock.timber = 50;
    sim.build('cottage', 12, 20);
    let arrived: string | null = null;
    sim.on((e) => {
      if (e.type === 'arrived') arrived = e.who;
    });
    sim.runUntil(sim.state.tick + 3 * 60);
    expect(arrived).not.toBeNull();
    expect(sim.state.order).toHaveLength(7);
    sim.runDays(2);
    expect(sim.state.order).toHaveLength(7);
  });

  it('who comes is coherent, and shaped by the town: same actions, same person; different actions, different people', () => {
    const base: Welcome = { tick: 2000, home: [10, 10], built: { garden: 1 }, near: [] };
    const a = generateNewcomer(1, 0, base);
    expect(generateNewcomer(1, 0, base)).toEqual(a);
    const variants = [
      generateNewcomer(1, 0, { ...base, home: [3, 20] }),
      generateNewcomer(1, 0, { ...base, tick: 9000 }),
      generateNewcomer(1, 0, { ...base, built: { workshop: 3 }, near: ['workshop'] }),
      generateNewcomer(2, 0, base),
    ];
    expect(new Set([a, ...variants].map((d) => JSON.stringify(d))).size).toBe(5);
    // A town full of workshops draws makers, more often than not.
    let makers = 0;
    for (let n = 0; n < 60; n++) if (generateNewcomer(1, n, { ...base, tick: n * 97, built: { workshop: 3 }, near: ['workshop'] }).job === 'workshop') makers++;
    let makersElsewhere = 0;
    for (let n = 0; n < 60; n++) if (generateNewcomer(1, n, { ...base, tick: n * 97, built: { garden: 3 }, near: ['garden'] }).job === 'workshop') makersElsewhere++;
    expect(makers).toBeGreaterThan(makersElsewhere);
    for (let n = 0; n < 60; n++) {
      const d = generateNewcomer(3, n, { ...base, tick: n * 31 });
      for (const t of TRAITS) expect(Math.abs(d.traits[t])).toBeLessThanOrEqual(1);
      for (const v of VALUES) expect(d.values[v]).toBeGreaterThanOrEqual(0);
      for (const v of VALUES) expect(d.values[v]).toBeLessThanOrEqual(1);
      if (d.traits.sociable > 0.5 && d.traits.steady < 0.1) expect(d.voice.register).toBe('chatty');
      expect(d.background).toContain(d.name);
    }
  });

  it('a newcomer arrives hoping to settle in, not with a dream already done', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(awake(2));
    sim.state.stock.timber = 50;
    sim.build('cottage', 12, 20);
    sim.runUntil(sim.state.tick + 3 * 60);
    const r = sim.resident(sim.state.order[6] as string);
    expect(r.aspiration.done).toBe(false);
    expect(r.aspiration.kind).toBe('settle');
    // Bar round 2: the first dream carries their own hope, as their trade gave it.
    expect(dreamTitle(sim.state, r)).toBeTruthy();
    expect(nextStep(sim.state, r)).toBe('Get to know the neighbours');
  });

  it('a newcomer is a resident like any other: a voice, thoughts, and in time a dream', { timeout: 180_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    const n = new Narrator(sim);
    sim.runUntil(awake(2));
    sim.state.stock.timber = 50;
    sim.build('cottage', 12, 20);
    sim.runDays(10);
    const id = sim.state.order[6] as string;
    expect(id).toBeTruthy();
    // They arrive with a hope of their own (settling in), not one already done.
    const first = sim.talk(id, 'hope');
    if (first) expect(first.hope?.done).toBe(false);
    expect(n.entries.some((e) => e.who.includes(id) && /"/.test(e.text))).toBe(true);
    expect(sim.resident(id).aspiration.kind).toBeTruthy();
  });
});

describe('criterion 6: a readable log', () => {
  it('the Story filter shows at most 40 lines a day over a week', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'favours');
      const n = new Narrator(sim, { stewardIsYou: true });
      sim.runDays(7);
      const story = n.entries.filter((e) => e.kind !== 'day' && e.importance !== 'minor').length;
      expect(story / 7, `seed ${seed}`).toBeLessThanOrEqual(40);
    }
  });
});

describe('criterion 4 (M3b criterion 4): talking to a resident', () => {
  it('every answer is true to state; the first talk of the day counts, the rest change nothing', { timeout: 180_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      sim.runUntil(at(6, 11));
      for (const id of sim.state.order) {
        const r = sim.resident(id);
        if (r.activity?.id === 'sleep') continue;
        const how = sim.talk(id, 'how');
        expect(how?.band).toBe(moodBand(r.mood));
        const mind = sim.talk(id, 'mind');
        // Bar round 2: an answer keeps one feeling per subject, so the comparison is with the reconciled list.
        const top = reconcile({ question: 'mind', topics: topOfMind(sim.state, r, 3).slice(0, 2).map((t, rank) => ({ key: t.key, ...(t.about ? { about: t.about } : {}), vars: t.vars, rank })) }).topics ?? [];
        expect(mind?.topics?.map((t) => t.key)).toEqual(top.map((t) => t.key));
        for (const other of sim.state.order.filter((o) => o !== id)) {
          const a = sim.talk(id, 'opinion', `r:${other}`);
          expect(Math.sign(a?.value ?? 0)).toBe(Math.sign(feelingAbout(r, `r:${other}`, sim.state.tick)));
          // Bar round 4: someone known well and not liked is "cool", not "no view".
          const band = feelingBand(feelingAbout(r, `r:${other}`, sim.state.tick));
          expect(a?.band).toBe(band === 'neutral' && (r.rel[other]?.familiarity ?? 0) >= 0.5 ? 'cool' : band);
        }
        const me = sim.talk(id, 'me');
        expect(me?.band).toBe(feelingBand(r.rel.steward?.affinity ?? 0));
        const hope = sim.talk(id, 'hope');
        expect(hope?.hope?.done).toBe(r.aspiration.done);
      }
    }
  });

  it("talking can't be farmed, and replays the same", { timeout: 60_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(awake(3));
    const r = sim.resident('ada');
    const company0 = r.needs.company;
    const counted: boolean[] = [];
    sim.on((e) => {
      if (e.type === 'talk') counted.push(e.counted);
    });
    sim.talk('ada', 'how');
    const company1 = r.needs.company;
    for (let i = 0; i < 5; i++) sim.talk('ada', 'how');
    expect(company1).toBeGreaterThan(company0);
    expect(r.needs.company).toBe(company1);
    expect(counted).toEqual([true, false, false, false, false, false]);
    // Talks and favours in the command log replay to the same town.
    const run = () => {
      const s = runScenario('quiet', 2, 'none');
      s.schedule([
        { at: awake(2), kind: 'talk', who: 'fen', question: 'how' },
        { at: awake(2) + 5, kind: 'favour', who: 'marlow', favour: 'timber' },
        { at: awake(3), kind: 'talk', who: 'ada', question: 'opinion', about: 'r:fen' },
      ]);
      s.runDays(5);
      return JSON.stringify(s.state);
    };
    expect(run()).toBe(run());
  });
});

describe('playtest fix: green around a home', () => {
  it('a flower bed right beside a home satisfies a wish for more green, wherever along the home it is', () => {
    for (const [dx, dy] of [
      [2, 0],
      [-1, 1],
      [1, 2],
      [0, -1],
    ] as Array<[number, number]>) {
      const sim = runScenario('quiet', 1, 'none');
      sim.state.stock.timber = 50;
      const ada = sim.resident('ada');
      const home = sim.state.buildings.find((b) => b.id === ada.homeId) as { x: number; y: number };
      expect(assess(sim.state, ada, 'more_green').met).toBe(false);
      sim.build('flowerbed', home.x + dx, home.y + dy);
      expect(assess(sim.state, ada, 'more_green').met, `flower bed at ${dx},${dy} from the cottage`).toBe(true);
    }
  });
});
