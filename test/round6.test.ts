// Bar round 6 (spec 9.3, predeclared 2026-10-09): a rescue counts, grievances in the first person,
// minds that agree with themselves, a dream's building grieved, raw lines, less repetition,
// explain for decisions, worn ground as tracks.
import { describe, expect, it } from 'vitest';
import { replySaid } from '../src/content/replies.js';
import { residentDef } from '../src/content/residents.js';
import { MIND_LINES } from '../src/content/thoughts.js';
import { TIMBER_FROM } from '../src/narrate/board.js';
import { Narrator, sentenceCount } from '../src/narrate/narrator.js';
import { PAGE_AGAINST, residentReport } from '../src/inspect/inspector.js';
import { runScenario } from '../src/scenarios/index.js';
import { ASK_LAPSE_DAYS } from '../src/sim/asks.js';
import { TASTE_ASPECTS } from '../src/sim/mind/memory.js';
import { NOTHING_SAID } from '../src/sim/progress.js';
import { offersFor } from '../src/sim/replies.js';
import type { Simulation } from '../src/sim/sim.js';
import { STORES_WHY } from '../src/sim/stores.js';
import { FIRST_STEP_DAYS, currentStage } from '../src/sim/story/aspirations.js';
import { CROSS_AT, STEWARD_LOVE } from '../src/sim/talk.js';
import { at, dayOf } from '../src/sim/time.js';
import { STEWARD, type TalkAnswer, type TalkQuestion } from '../src/sim/types.js';
import { canPlace, liveBuildings, shownWear } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

const here = (sim: Simulation) => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
const awake = (sim: Simulation, id: string) => !sim.resident(id).departed && sim.resident(id).activity?.id !== 'sleep';

/** Build a type on the first open spot, with the timber found for it. */
function place(sim: Simulation, type: string): number {
  sim.state.stock.timber = 100;
  for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) if (canPlace(sim.state, type, x, y) === null) return sim.build(type, x, y).id;
  throw new Error(`nowhere for ${type}`);
}

/** Every note about the steward a resident holds, settled, forming or remembered. */
function stewardNotes(sim: Simulation): string[] {
  const out: string[] = [];
  for (const r of here(sim)) {
    for (const b of Object.values(r.beliefs)) if (b.subject === STEWARD) out.push(...b.sources.map((s) => s.note));
    for (const t of Object.values(r.traces)) if (t.subject === STEWARD) out.push(...t.sources.map((s) => s.note));
    for (const e of r.episodes) if (e.subject === STEWARD) out.push(e.note);
  }
  return out.filter(Boolean);
}

const THIRD = /\b(him|her|them|his|their)\b/;

describe('round 6, criterion 1: a rescue counts', () => {
  it('building a food place after a famine closes every food ask as met, whatever the larder', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 6));
    sim.state.stock.food = 0;
    sim.state.lastShortageDay = 3;
    sim.runUntil(at(4, 9));
    sim.state.stock.food = 0;
    const asks = sim.state.requests.filter((q) => q.kind === 'more_food' && q.status === 'open');
    expect(asks.length).toBeGreaterThan(0);
    place(sim, 'bakery');
    sim.state.stock.food = 0;
    sim.runUntil(at(5, 9));
    for (const q of asks) expect(q.status, `${q.by}`).toBe('fulfilled');
    expect(stewardNotes(sim).some((n) => /never got me a fuller larder/.test(n))).toBe(false);
    expect(ASK_LAPSE_DAYS.more_food).toBe(7);
  });

  it('timber is under 5 at dawn on at most 2 of days 2 to 13 with a considerate steward, quiet and bakery', { timeout: 900_000 }, () => {
    for (const scenario of ['quiet', 'bakery']) {
      for (const seed of SEEDS) {
        const sim = runScenario(scenario, seed, 'considerate');
        let low = 0;
        sim.on((e) => {
          if (e.type === 'dawn' && e.day >= 2 && e.day <= 13 && sim.state.stock.timber < 5) low++;
        });
        sim.runUntil(at(14, 0));
        expect(low, `${scenario} seed ${seed}`).toBeLessThanOrEqual(2);
      }
    }
    expect(TIMBER_FROM).toMatch(/woodlot/);
    expect(TIMBER_FROM).toMatch(/favour/);
  });
});

describe('round 6, criterion 2: grievances in the first person', () => {
  it('no note about the steward, sorry or explain chip names its holder in the third person', { timeout: 1_800_000 }, () => {
    for (const scenario of ['quiet', 'bakery']) {
      for (const steward of ['considerate', 'favours', 'none'] as const) {
        const sim = runScenario(scenario, 1, steward);
        for (const day of [10, 20, 30]) {
          sim.runUntil(at(day, 12));
          for (const note of stewardNotes(sim)) {
            expect(note, `${scenario} ${steward} day ${day}`).not.toMatch(THIRD);
            for (const kind of ['sorry', 'explain'] as const) expect(replySaid({ kind, aspect: 'ignores_me', about: note })).not.toMatch(THIRD);
          }
        }
      }
    }
  });

  it('a reload replays the commands, so an ignored ask reads "never got me" after loading', { timeout: 120_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(12, 12));
    const lapsed = stewardNotes(sim).filter((n) => /^never got /.test(n));
    expect(lapsed.length).toBeGreaterThan(0);
    for (const n of lapsed) expect(n).toMatch(/^never got me /);
    const again = runScenario('quiet', 1, 'none');
    again.runUntil(at(12, 12));
    expect(stewardNotes(again)).toEqual(stewardNotes(sim));
  });
});

describe('round 6, criterion 3: minds agree with themselves', () => {
  it('no opposite tastes of one place; top praise only above 0.6 and never conceding; cross means saying so; no "hardly know" with a memory; pages agree with standing', { timeout: 3_600_000 }, () => {
    let loves = 0;
    let crossKind = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      for (let day = 2; day <= 30; day++) {
        sim.runUntil(at(day, 12));
        for (const r of here(sim)) {
          if (!awake(sim, r.id)) continue;
          const cross = r.emotions.some((e) => e.target === STEWARD && (e.kind === 'annoyance' || e.kind === 'grief') && e.intensity >= CROSS_AT);
          const me = sim.talk(r.id, 'me');
          if (me) {
            if (me.band === 'love') {
              loves++;
              expect(me.value ?? 0, `seed ${seed} day ${day} ${r.id}`).toBeGreaterThan(STEWARD_LOVE);
              expect(me.but, `seed ${seed} day ${day} ${r.id}`).toBeUndefined();
            }
            if (cross && (me.band === 'love' || me.band === 'like')) {
              crossKind++;
              expect(me.but, `seed ${seed} day ${day} ${r.id} cross but kind`).toBeDefined();
            }
          }
          // A neighbour: someone with a shared memory is never "hardly known".
          const other = here(sim).find((x) => x.id !== r.id && [...r.episodes, ...r.buffer].some((e) => e.subject === `r:${x.id}`));
          if (other && day % 3 === 0) {
            const op = sim.talk(r.id, 'opinion', `r:${other.id}`);
            expect(op?.band, `seed ${seed} day ${day} ${r.id} on ${other.id}`).not.toBe('neutral');
          }
        }
      }
      for (const r of here(sim)) {
        const tastes = Object.values(r.beliefs).filter((b) => b.subject.startsWith('b:') && TASTE_ASPECTS.has(b.aspect));
        for (const b of tastes) for (const o of tastes) if (o.subject === b.subject) expect(Math.sign(o.valence), `seed ${seed} ${r.id} ${b.subject}: ${b.aspect} vs ${o.aspect}`).toBe(Math.sign(b.valence));
        const aff = r.rel[STEWARD]?.affinity ?? 0;
        const rep = residentReport(sim, r.id);
        const steward = rep.opinions.find((o) => o.subject === STEWARD);
        if (steward && Math.abs(aff) > PAGE_AGAINST) {
          const against = Object.values(r.beliefs).filter((x) => x.subject === STEWARD && Math.sign(x.valence) !== Math.sign(aff)).length;
          const all = Object.values(r.beliefs).filter((x) => x.subject === STEWARD).length;
          expect(steward.beliefs.length, `seed ${seed} ${r.id}`).toBe(all - against);
        }
      }
    }
    console.log(`round 6 c3: ${loves} top-band answers, ${crossKind} kind answers while cross`);
  });
});

describe('round 6, criterion 4: a dream\'s building is grieved', () => {
  it('removing the building that answered a dream is a loss at full weight for its dreamer', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 10));
    const ada = sim.resident('ada');
    const q = sim.ask(ada, 'aspiration', 'glasshouse');
    const id = place(sim, 'glasshouse');
    sim.runUntil(at(4, 10));
    expect(q.status).toBe('fulfilled');
    const b = sim.state.buildings.find((x) => x.id === id)!;
    expect(b.dreamOf).toContain('ada');
    let grieved = false;
    sim.on((e) => {
      if (e.type === 'grief' && e.who === 'ada' && e.building === id) grieved = true;
    });
    sim.remove(b.x, b.y);
    sim.runUntil(at(5, 10));
    expect(grieved).toBe(true);
    const took = [...Object.values(ada.beliefs), ...Object.values(ada.traces)].find((x) => x.subject === STEWARD && x.aspect === 'destroyed_place');
    expect(took).toBeDefined();
    expect(ada.lostPlace?.weight).toBe(1);
  });
});

describe('round 6, criterion 6: raw lines', () => {
  it('no sentence starts with "someone"; the granary ask quotes the winter stores; dream lines name what they mean', { timeout: 1_800_000 }, () => {
    for (const scenario of ['quiet', 'bakery']) {
      for (const steward of ['considerate', 'favours', 'none'] as const) {
        for (const seed of [1, 2, 3]) {
          const sim = runScenario(scenario, seed, steward);
          const n = new Narrator(sim, { stewardIsYou: true });
          sim.runUntil(at(30, 20));
          for (const e of n.entries) expect(e.text, `${scenario} ${steward} seed ${seed}`).not.toMatch(/(^|[.!?]["“]? )someone\b/);
          for (const q of sim.state.requests) if (q.wants === 'granary') expect(q.dream, `${scenario} ${steward} seed ${seed}`).toBe(STORES_WHY);
        }
      }
    }
    for (const key of ['dream', 'dream:waiting']) {
      for (const line of Object.values(MIND_LINES[key] ?? {}).flat()) {
        const first = line.split(/[.!?](\s|$)/)[0] ?? '';
        expect(first, line).not.toMatch(/\bit\b/i);
      }
    }
  });
});

describe('round 6, criterion 8: less repetition', () => {
  it('no proposal type twice in a month; first steps done within four days unless waiting on you', { timeout: 1_800_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const posted: string[] = [];
      sim.on((e) => {
        if (e.type === 'dilemma_posted') posted.push(e.dilemma.type);
      });
      for (let h = 1; h <= 30 * 24; h++) {
        sim.runUntil(h * 60);
        for (const r of here(sim)) {
          if (r.aspiration.stage !== 0 || r.aspiration.done) continue;
          const s = currentStage(sim.state, r);
          if (!s || s.until || s.needs || (s.place && s.place !== 'home' && !liveBuildings(sim.state).some((b) => b.type === s.place))) continue;
          if (sim.state.requests.some((q) => q.by === r.id && q.kind === 'aspiration' && q.status === 'open')) continue;
          expect(sim.state.tick - r.aspiration.since, `seed ${seed} ${r.id} on "${s.next}" since day ${dayOf(r.aspiration.since)}`).toBeLessThanOrEqual(FIRST_STEP_DAYS * 1440 + 60);
        }
      }
      expect(new Set(posted).size, `seed ${seed}: ${posted.join(', ')}`).toBe(posted.length);
    }
  });

  it('answers run to three sentences, four at most and rarely; no "nothing" fact closes one; no tic before a bare subject; reasons vary', { timeout: 3_600_000 }, () => {
    let answers = 0;
    let four = 0;
    const reasons = new Map<string, number>();
    let given = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const qs: TalkQuestion[] = ['how', 'mind', 'hope', 'opinion'];
      let turn = 0;
      for (let day = 2; day <= 30; day++) {
        sim.runUntil(at(day, 12));
        for (const r of here(sim)) {
          if (!awake(sim, r.id)) continue;
          for (const q of [qs[turn++ % qs.length]!, 'me' as TalkQuestion]) {
            const about = q === 'opinion' ? (here(sim).find((x) => x.id !== r.id) ? `r:${here(sim).find((x) => x.id !== r.id)!.id}` : undefined) : undefined;
            if (!sim.talk(r.id, q, about as never)) continue;
            const text = (n.lastReply?.text ?? '').replace(/^As I told you on day \d+: /, '');
            const tics = residentDef(r.id).voice.tics;
            const count = sentenceCount(text, tics);
            answers++;
            if (count >= 4) four++;
            expect(count, `seed ${seed} day ${day} ${r.id}: "${text}"`).toBeLessThanOrEqual(4);
            for (const nothing of NOTHING_SAID) expect(text.endsWith(nothing) && count >= 2, `"${text}"`).toBe(false);
            for (const tic of tics) {
              const lead = `${tic.charAt(0).toUpperCase()}${tic.slice(1)}, `;
              if (text.startsWith(lead)) expect(text.slice(lead.length), `"${text}"`).not.toMatch(/^[^.!?]{1,40}\?/);
            }
            if (q === 'me' && n.lastReason && n.lastReason.t === sim.state.tick && n.lastReason.who === r.id && text.includes(n.lastReason.text)) {
              given++;
              reasons.set(n.lastReason.text, (reasons.get(n.lastReason.text) ?? 0) + 1);
            }
          }
        }
      }
    }
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`round 6 c8: ${four}/${answers} answers at four sentences; ${given} reasons, most often "${top?.[0]}" x${top?.[1]}`);
    expect(four * 10).toBeLessThanOrEqual(answers);
    if (top) expect(top[1] * 5, `"${top[0]}"`).toBeLessThanOrEqual(given);
  });
});

describe('round 6, criterion 9: explain is for decisions', () => {
  it('a lapsed ask offers sorry, not explain; a turned-down proposal offers both', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const r = sim.resident('ada');
    const lapsed: TalkAnswer = { question: 'me', about: STEWARD, band: 'like', value: 0.2, but: { aspect: 'ignores_me', note: 'never got me a fuller larder' } };
    const kinds = offersFor(r, lapsed, sim.state.tick).map((o) => o.kind);
    expect(kinds).toContain('sorry');
    expect(kinds).not.toContain('explain');
    const turned: TalkAnswer = { question: 'me', about: STEWARD, band: 'like', value: 0.2, but: { aspect: 'turned_me_down', note: 'said no to my idea' } };
    const both = offersFor(r, turned, sim.state.tick).map((o) => o.kind);
    expect(both).toContain('sorry');
    expect(both).toContain('explain');
  });
});

describe('round 6, criterion 10: worn ground', () => {
  it('at most a sixteenth of the valley worn, never a whole two-by-two block', { timeout: 1_800_000 }, () => {
    for (const [steward, days] of [['none', 21], ['considerate', 30]] as const) {
      for (const seed of SEEDS) {
        const sim = runScenario('quiet', seed, steward);
        for (let day = 3; day <= days; day += 3) {
          sim.runUntil(at(day, 18));
          const settled = sim.state.settled ?? { width: sim.state.width, height: sim.state.height };
          const worn = shownWear(sim.state);
          expect(worn.size, `${steward} seed ${seed} day ${day}`).toBeLessThanOrEqual(Math.floor((settled.width * settled.height) / 16));
          for (const k of worn.keys()) {
            const [x, y] = k.split(',').map(Number) as [number, number];
            const block = worn.has(`${x + 1},${y}`) && worn.has(`${x},${y + 1}`) && worn.has(`${x + 1},${y + 1}`);
            expect(block, `${steward} seed ${seed} day ${day} at ${k}`).toBe(false);
          }
        }
      }
    }
  });
});
