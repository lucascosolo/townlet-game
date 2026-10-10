// Bar round 5 (spec 9.3, predeclared 2026-10-09): standing earned, replies that land by what was
// said, the board's quiet line, raw lines, opinions that agree with their holder, less sameness,
// economy pacing.
import { describe, expect, it } from 'vitest';
import { buildingDef } from '../src/content/buildings.js';
import { REPLY_LINES } from '../src/content/replies.js';
import { residentDef } from '../src/content/residents.js';
import { generateNewcomer } from '../src/content/newcomers.js';
import { quietLine, townWorries } from '../src/narrate/board.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { beliefKey } from '../src/sim/mind/memory.js';
import { needIsLow } from '../src/sim/needs.js';
import { factValue } from '../src/sim/progress.js';
import { applyReply, offersFor, TALK_WARMTH_WEEK, type ReplyOffer } from '../src/sim/replies.js';
import type { Simulation } from '../src/sim/sim.js';
import { dreamBuildings, dreamTitle } from '../src/sim/story/aspirations.js';
import { at, dayOf } from '../src/sim/time.js';
import { STEWARD, type TalkAnswer, type TalkQuestion } from '../src/sim/types.js';
import { liveBuildings } from '../src/sim/world.js';
import { mindTopics } from '../src/sim/mind/thoughts.js';
import { SEEDS } from './helpers.js';

const here = (sim: Simulation) => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
const awake = (sim: Simulation, id: string) => !sim.resident(id).departed && sim.resident(id).activity?.id !== 'sleep';

describe('round 5, criterion 1: standing earned', () => {
  it('with a considerate steward, at most half think the world of you on day 30, and standing spreads by 0.4', { timeout: 900_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      sim.runUntil(at(30, 12));
      const s = here(sim).map((r) => r.rel[STEWARD]?.affinity ?? 0);
      expect(s.filter((v) => v > 0.8).length * 2, `seed ${seed}: ${s.map((v) => v.toFixed(2)).join(' ')}`).toBeLessThanOrEqual(s.length);
      expect(Math.max(...s) - Math.min(...s), `seed ${seed}: ${s.map((v) => v.toFixed(2)).join(' ')}`).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('twenty friendly replies in a week add at most the weekly cap; a late sorry to someone who has given up on you is words', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const r = sim.resident('ada');
    const a0 = r.rel[STEWARD]!.affinity;
    const offers: ReplyOffer[] = [{ kind: 'agree', tone: 'view' }];
    for (let i = 0; i < 20; i++) {
      sim.state.tick += 300;
      applyReply(sim.state, r, 'agree', offers, () => {});
    }
    expect(r.rel[STEWARD]!.affinity - a0).toBeLessThanOrEqual(TALK_WARMTH_WEEK + 1e-9);
    // Below -0.5, a sorry for something four days old.
    r.rel[STEWARD]!.affinity = -0.7;
    const k = beliefKey(STEWARD, 'ignores_me');
    r.beliefs[k] = { subject: STEWARD, aspect: 'ignores_me', valence: -0.7, strength: 0.6, formedTick: sim.state.tick - 6 * 1440, reinforcedTick: sim.state.tick - 4 * 1440, sources: [{ tick: sim.state.tick - 4 * 1440, kind: 'witnessed', note: 'never got me a bench' }] } as never;
    const res = applyReply(sim.state, r, 'sorry', [{ kind: 'sorry', aspect: 'ignores_me', about: 'never got me a bench' }], () => {});
    expect(res?.stance).toBe('cheap');
  });
});

describe('round 5, criterion 2: replies land by what was said', () => {
  it('"You don\'t seem it" is no longer asked of someone well (round 7); doubting a pause has its own pool; leaving offers no other subject; no tic on a response', { timeout: 900_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const r = sim.resident('ada');
    r.mood = 0.85;
    // Bar round 7 moved this: to someone who is well the challenge is "What's been the best of it?" ("You don't seem it" was denied 18 of 18 and led nowhere).
    expect(applyReply(sim.state, r, 'disagree', [{ kind: 'disagree', tone: 'mood', well: true }], () => {})?.stance).toBe('best_of');
    r.mood = 0.5;
    expect(applyReply(sim.state, r, 'disagree', [{ kind: 'disagree', tone: 'mood', well: false }], () => {})?.stance).toBe('seen');
    expect(applyReply(sim.state, r, 'disagree', [{ kind: 'disagree', tone: 'hope', rest: true }], () => {})?.stance).toBe('nudged');
    expect(REPLY_LINES.nudged).toBeDefined();
    const nudged = new Set(Object.values(REPLY_LINES.nudged).flat());
    for (const l of Object.values(REPLY_LINES.bristled).flat()) expect(nudged.has(l)).toBe(false);
    // An answer about leaving: chips name you or nothing.
    const leaving: TalkAnswer = { question: 'mind', topics: [{ key: 'leaving', vars: {}, rank: 0 }, { key: 'festival_soon', about: 'b:1', vars: { label: 'Midsummer Lanterns' }, rank: 1 }] };
    for (const o of offersFor(r, leaving, sim.state.tick)) if (o.about && o.kind !== 'sorry' && o.kind !== 'explain') expect(o.about).toBe(STEWARD);
    // No tic on a response, over 20 days of replies.
    for (const seed of SEEDS.slice(0, 2)) {
      const s2 = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(s2, { stewardIsYou: true });
      const qs: TalkQuestion[] = ['how', 'mind', 'hope', 'me'];
      let turn = 0;
      s2.on((e) => {
        if (e.type === 'talk') {
          const kinds = s2.resident(e.who).lastAnswer?.offers.map((o) => o.kind) ?? [];
          if (kinds.length) s2.reply(e.who, kinds[turn++ % kinds.length]!);
        }
        if (e.type === 'reply') {
          const words = n.lastReply?.text ?? '';
          for (const tic of residentDef(e.who).voice.tics) {
            const lines = Object.values(REPLY_LINES[e.stance] ?? {}).flat();
            if (lines.some((l) => l.toLowerCase().includes(tic.toLowerCase()))) continue;
            expect(words.toLowerCase().startsWith(tic.toLowerCase()), `${e.who}: "${words}"`).toBe(false);
          }
        }
      });
      for (let day = 2; day <= 21; day++) {
        s2.runUntil(at(day, 12));
        for (const id of s2.state.order) if (awake(s2, id)) for (const q of qs) s2.talk(id, q);
      }
    }
  });
});

describe('round 5, criteria 4 and 8: the board and the stores', () => {
  it('never "nothing needs you" while something is open; the granary feeding the town is a worry; spring keeps a third', { timeout: 900_000 }, () => {
    const sim = runScenario('quiet', 1, 'considerate');
    sim.runUntil(at(5, 8));
    const open = sim.state.requests.some((q) => q.status === 'open') || sim.state.story.dilemmas.some((d) => d.status === 'open');
    if (open) expect(quietLine(sim.state, 0, 3)).not.toMatch(/Nothing needs you/);
    for (const q of sim.state.requests) if (q.status === 'open') q.status = 'resolved';
    for (const d of sim.state.story.dilemmas) if (d.status === 'open') d.status = 'lapsed' as never;
    expect(quietLine(sim.state, 0, 3)).toMatch(/Nothing needs you/);
    // The granary feeding the town.
    sim.state.stock.food = 1;
    sim.state.granary = 80;
    expect(townWorries(sim.state).some((w) => /granary/.test(w))).toBe(true);
  });

  it('timber is under 5 at dawn on at most 4 of days 2 to 13 with a considerate steward', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      let low = 0;
      sim.on((e) => {
        if (e.type === 'dawn' && e.day >= 2 && e.day <= 13 && sim.state.stock.timber < 5) low++;
      });
      sim.runUntil(at(14, 0));
      expect(low, `seed ${seed}`).toBeLessThanOrEqual(4);
    }
  });

  it('at the first morning of spring the granary keeps a third', { timeout: 900_000 }, () => {
    const sim = runScenario('quiet', 1, 'considerate');
    let before = 0;
    let after = -1;
    sim.on((e) => {
      if (e.type === 'stores' && e.phase === 'feast') after = sim.state.granary ?? 0;
    });
    // Up to the evening before spring, then the feast.
    sim.runUntil(at(28 * 4, 20));
    before = sim.state.granary ?? 0;
    sim.runUntil(at(28 * 4 + 1, 12));
    if (before >= 3) {
      expect(after, 'a feast happened').toBeGreaterThanOrEqual(0);
      expect(after).toBeGreaterThanOrEqual(Math.floor(before / 3) - 1);
    }
  });
});

describe('round 5, criterion 5: no raw lines', () => {
  it('no mixed-case shouts, no "a" before a vowel or a plural, no ".." or lowercase facts, no "<plural> spoils", no "nothing was done)", no own things in the third person, no quoted looks', { timeout: 900_000 }, () => {
    for (const scenario of ['bakery', 'quiet'] as const) {
      for (const steward of ['considerate', 'favours', 'none'] as const) {
        for (const seed of SEEDS.slice(0, 3)) {
          const sim = runScenario(scenario, seed, steward, { scripted: false });
          const n = new Narrator(sim, { stewardIsYou: true });
          const reasons: string[] = [];
          sim.on((e) => {
            if (e.type === 'standing') reasons.push(...e.reasons);
          });
          sim.runUntil(at(31, 0));
          const text = n.text();
          const tag = `${scenario} ${steward} ${seed}`;
          expect(text, tag).not.toMatch(/\b[a-z][A-Z]{2,}/);
          expect(text, tag).not.toMatch(/\ba (orchard|old oak|apiary|inn)\b/i);
          expect(text, tag).not.toMatch(/\ba (garden plots|beehives)\b/i);
          // A doubled full stop, not an ellipsis ("The bakery again... I barely slept." is written so).
          expect(text, tag).not.toMatch(/[^.]\.\.(?!\.)/);
          expect(text, tag).not.toMatch(/\b(garden plots|beehives) (spoils|isn't|is)\b/i);
          expect(text, tag).not.toMatch(/"\(/);
          for (const r of here(sim)) {
            const name = residentDef(r.id).name;
            for (const ep of Object.values(r.beliefs)) for (const src of ep.sources) if (src.kind !== 'told') expect(n.memoryClause(r.id, { subject: ep.subject, aspect: ep.aspect, note: src.note ?? '' }), `${tag} ${r.id}`).not.toContain(`${name}'s`);
            for (const key of ['job', 'lifts', 'dislikes', 'quirk', 'needs', 'dream', 'values', 'friend', 'favourite']) {
              const v = factValue(sim.state, r, key);
              expect(v, `${r.id} ${key}`).toMatch(/^[A-Z]/);
              expect(v, `${r.id} ${key}`).not.toMatch(/\.\.$/);
            }
          }
          for (const x of reasons) expect(x, tag).not.toMatch(/nothing was done/);
        }
      }
    }
  });
});

describe('round 5, criterion 6: opinions agree with their holder', () => {
  it('no dislike of home, workplace or dream buildings; the needs line agrees with the mind; no turning on a lost place', { timeout: 900_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      // A place most hold dear is taken away on day 12.
      sim.runUntil(at(12, 10));
      const oak = liveBuildings(sim.state).find((b) => b.type === 'oak');
      const grieved = new Set<string>();
      sim.on((e) => {
        if (e.type === 'grief') grieved.add(e.who);
      });
      if (oak) sim.remove(oak.x, oak.y);
      for (let day = 13; day <= 30; day++) {
        sim.runUntil(at(day, 12));
        for (const r of here(sim)) {
          if (day <= 19 && oak) for (const t of mindTopics(sim.state, r)) if (grieved.has(r.id)) expect(t.key === 'belief:-' && t.about === `b:${oak.id}`, `seed ${seed} day ${day} ${r.id}`).toBe(false);
          const lowNeed = (Object.keys(r.needs) as Array<keyof typeof r.needs>).some((k) => needIsLow(r.needs[k], r.setpoints[k]));
          const needTopic = mindTopics(sim.state, r).some((t) => /^need:(rest|food|comfort|company|purpose|delight|purpose_job)$/.test(t.key));
          if (needTopic) expect(lowNeed, `seed ${seed} day ${day} ${r.id}: a need on their mind but all met`).toBe(true);
        }
      }
      for (const r of here(sim)) {
        const mine = new Set([r.homeId, r.jobId].filter((x): x is number => x !== null));
        const dreams = dreamBuildings(sim.state, r);
        for (const b of Object.values(r.beliefs)) {
          if (!b.subject.startsWith('b:') || b.valence >= 0 || b.aspect === 'lost_place') continue;
          const bl = sim.state.buildings.find((x) => `b:${x.id}` === b.subject);
          if (!bl || !['not_for_me', 'eyesore'].includes(b.aspect)) continue;
          expect(mine.has(bl.id), `seed ${seed} ${r.id} dislikes their own ${bl.type}`).toBe(false);
          expect(dreams.has(bl.type), `seed ${seed} ${r.id} dislikes their dream's ${bl.type}`).toBe(false);
        }
      }
    }
  });
});

describe('round 5, criterion 7: less sameness', () => {
  it('no lifts or dislikes fact on over half the founders; no dream title on three at once; a newcomer\'s first step done within six days; backstories vary; no whole answer twice in a fortnight', { timeout: 900_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const arrived = new Map<string, number>();
      const firstStep = new Map<string, number>();
      const answers = new Map<string, Array<{ t: number; text: string }>>();
      sim.on((e) => {
        if (e.type === 'arrived') arrived.set(e.who, e.t);
        if (e.type === 'aspiration' && e.stage === 'meet' && !firstStep.has(e.who)) firstStep.set(e.who, e.t);
        if (e.type === 'talk') {
          const text = n.lastReply?.text ?? '';
          const prior = answers.get(e.who) ?? [];
          for (const p of prior) if (e.t - p.t < 14 * 1440) expect(text, `seed ${seed} ${e.who} day ${dayOf(e.t)}`).not.toBe(p.text);
          prior.push({ t: e.t, text });
          answers.set(e.who, prior);
        }
      });
      for (let day = 2; day <= 30; day++) {
        sim.runUntil(at(day, 7));
        const titles = new Map<string, number>();
        for (const r of here(sim)) {
          if (r.aspiration.done) continue;
          const t = dreamTitle(sim.state, r);
          if (t) titles.set(t, (titles.get(t) ?? 0) + 1);
        }
        for (const [t, c] of titles) expect(c, `seed ${seed} day ${day}: "${t}"`).toBeLessThanOrEqual(2);
        sim.runUntil(at(day, 12));
        for (const id of sim.state.order) if (awake(sim, id)) for (const q of ['how', 'me'] as TalkQuestion[]) sim.talk(id, q);
      }
      for (const [who, t] of arrived) if (sim.tick - t > 6 * 1440) expect((firstStep.get(who) ?? Infinity) - t, `seed ${seed} ${who}`).toBeLessThanOrEqual(6 * 1440);
      const founders = here(sim).filter((r) => r.arrivedTick === undefined);
      for (const key of ['lifts', 'dislikes']) {
        const counts = new Map<string, number>();
        for (const r of founders) {
          const v = factValue(sim.state, r, key);
          if (/^(Not much bothers|Easy to please)/.test(v)) continue;
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        for (const [v, c] of counts) expect(c * 2, `seed ${seed}: "${v}" on ${c} of ${founders.length}`).toBeLessThanOrEqual(founders.length);
      }
    }
    // Backstories differ across seeds for the same trade.
    const pasts = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const d = generateNewcomer(seed, 0, { tick: 1440 * 9, home: [6, 6], built: { orchard: 3 }, near: ['orchard'] });
      pasts.add(d.background.split(',')[0] as string);
    }
    expect(pasts.size).toBeGreaterThanOrEqual(3);
  });
});

void buildingDef;
