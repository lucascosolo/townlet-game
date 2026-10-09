// Bar round 7 (spec 9.3, predeclared 2026-10-09): losses that cost, an economy that keeps asking,
// a story that agrees with itself, raw lines, talk without stock clauses, middle dream steps that move.
import { describe, expect, it } from 'vitest';
import { buildingDef } from '../src/content/buildings.js';
import { replySaid } from '../src/content/replies.js';
import { residentDef } from '../src/content/residents.js';
import { groupAsks, townWorries } from '../src/narrate/board.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { TASTE_ASPECTS, attachment } from '../src/sim/mind/memory.js';
import { unlocked, progressOf } from '../src/sim/progress.js';
import { applyReply, offersFor } from '../src/sim/replies.js';
import { FRESH_GRIEVANCE_DAYS, FRESH_GRIEVANCE_TOP, HURT_TOP, type Simulation } from '../src/sim/sim.js';
import { ASPIRATIONS, FIRST_STEP_DAYS, STEP_DAYS, currentStage } from '../src/sim/story/aspirations.js';
import { at, dayOf, seasonOf } from '../src/sim/time.js';
import { STEWARD, type Request, type TalkAnswer, type TalkQuestion } from '../src/sim/types.js';
import { canPlace, liveBuildings } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

const here = (sim: Simulation) => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
const awake = (sim: Simulation, id: string) => !sim.resident(id).departed && sim.resident(id).activity?.id !== 'sleep';
const FOUNDERS = ['ada', 'bram', 'fen', 'juniper', 'marlow', 'wren'];

function place(sim: Simulation, type: string): number {
  sim.state.stock.timber = Math.max(sim.state.stock.timber, 100);
  for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) if (canPlace(sim.state, type, x, y) === null) return sim.build(type, x, y).id;
  throw new Error(`nowhere for ${type}`);
}

describe('round 7, criterion 1: losses cost', () => {
  it('taking away a workplace is a grievance that holds standing at 0.6 for ten days; a sorry too soon is "not yet"; below -0.5 any sorry is cheap', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 10));
    const r = here(sim).find((x) => x.jobId !== null)!;
    const job = sim.state.buildings.find((b) => b.id === r.jobId)!;
    const name = buildingDef(job.type).name.toLowerCase();
    sim.resident(r.id).rel[STEWARD]!.affinity = 0.9;
    sim.remove(job.x, job.y);
    sim.runUntil(at(4, 10));
    const notes = [...Object.values(r.beliefs), ...Object.values(r.traces)].filter((b) => b.subject === STEWARD && b.aspect === 'destroyed_place').flatMap((b) => b.sources.map((s) => s.note));
    expect(notes.some((n) => n === `took away my ${name}`), notes.join('|')).toBe(true);
    expect(applyReply(sim.state, r, 'sorry', [{ kind: 'sorry', aspect: 'destroyed_place', about: `took away my ${name}` }], () => {})?.stance).toBe('too_soon');
    for (let d = 4; d <= 13; d++) {
      sim.runUntil(at(d, 18));
      expect(r.rel[STEWARD]!.affinity, `day ${d}`).toBeLessThanOrEqual(HURT_TOP + 1e-9);
    }
    // Below -0.5, a sorry is words, however fresh.
    r.rel[STEWARD]!.affinity = -0.6;
    r.hurtAt = undefined;
    expect(applyReply(sim.state, r, 'sorry', [{ kind: 'sorry', aspect: 'destroyed_place', about: `took away my ${name}` }], () => {})?.stance).toBe('cheap');
  });

  it('a wrecking steward is not adored a week later, and nobody with a fresh grievance stands above 0.85', { timeout: 1_800_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      for (let h = 1; h <= 30 * 24; h++) {
        sim.runUntil(h * 60);
        const day = dayOf(sim.state.tick);
        if (h % 24 === 10 && day === 13) {
          const holders = (b: { id: number }) => here(sim).filter((r) => attachment(r, `b:${b.id}`) > 0.15).length;
          const dear = liveBuildings(sim.state).filter((b) => buildingDef(b.type).kind !== 'home' && b.type !== 'path').sort((a, b) => holders(b) - holders(a) || a.id - b.id)[0]!;
          sim.remove(dear.x, dear.y);
        }
        if (h % 24 === 10 && day === 17) for (const b of liveBuildings(sim.state).filter((x) => !!buildingDef(x.type).produces?.food)) sim.remove(b.x, b.y);
        if (h % 24 === 10 && day === 23) {
          place(sim, 'bakery');
          place(sim, 'garden');
        }
        for (const r of here(sim)) {
          if ((r.grievedAt ?? -Infinity) > sim.state.tick - FRESH_GRIEVANCE_DAYS * 1440) expect(r.rel[STEWARD]!.affinity, `seed ${seed} day ${day} ${r.id}`).toBeLessThanOrEqual(FRESH_GRIEVANCE_TOP + 1e-9);
        }
      }
      const founders = here(sim).filter((r) => FOUNDERS.includes(r.id));
      const high = founders.filter((r) => (r.rel[STEWARD]?.affinity ?? 0) > 0.8).length;
      expect(high * 2, `seed ${seed}: ${founders.map((r) => (r.rel[STEWARD]?.affinity ?? 0).toFixed(2)).join(' ')}`).toBeLessThan(founders.length);
    }
  });
});

describe('round 7, criterion 2: the economy keeps asking', () => {
  it('eating the winter stores early lowers mood and is named on the board; the fountain opens at Hamlet', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(5, 6));
    expect(seasonOf(sim.state.tick)).not.toBe('winter');
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
    const mean = (s: Simulation) => here(s).reduce((x, r) => x + r.mood, 0) / here(s).length;
    expect(mean(b) - mean(a)).toBeGreaterThanOrEqual(0.02);
    a.state.stock.food = 0;
    expect(townWorries(a.state).some((w) => /winter stores/.test(w))).toBe(true);
    progressOf(sim.state).tier = 1;
    expect(unlocked(sim.state, 'fountain')).toBe(true);
  });
});

describe('round 7, criteria 3 and 4: the story agrees with itself, and raw lines', () => {
  it('no cart for Marlow unless he goes; stay is stay; Bram feasts only at a supper; no opposite tastes; no plural "is"; no placeholder partners; no departed in a home name; one lead-in', { timeout: 3_600_000 }, () => {
    const LEAD = /\b(I must say|Honestly|you know|mind you|kind of|like|Ha!|Mm\.|ooh|hmm), (you see|I would say|thing is|the way I see it|well|simple:|because|I mean|somehow|the way I feel it)\b/i;
    for (const scenario of ['quiet', 'bakery']) {
      for (const steward of ['considerate', 'favours', 'none'] as const) {
        for (const seed of [1, 2]) {
          const sim = runScenario(scenario, seed, steward);
          const n = new Narrator(sim, { stewardIsYou: true });
          const departedOn = new Map<string, number>();
          const feasts: number[] = [];
          let stayed = false;
          sim.on((e) => {
            if (e.type === 'left_town') departedOn.set(e.who, dayOf(e.t));
            if (e.type === 'aspiration' && e.who === 'bram' && e.stage === 'feast') feasts.push(e.t);
            if (e.type === 'decided_to_stay' && e.who === 'marlow') stayed = true;
          });
          sim.runUntil(at(30, 20));
          const tag = `${scenario} ${steward} seed ${seed}`;
          for (const e of n.entries) {
            if (/climbs onto the trade cart/.test(e.text)) expect(departedOn.get('marlow'), `${tag}: ${e.text}`).toBe(dayOf(e.t));
            expect(e.text, tag).not.toMatch(/\b(garden plots|beehives) (is|was|has)\b/);
            expect(e.text, tag).not.toMatch(/\bA friend says yes\b/);
            expect(e.text, tag).not.toMatch(LEAD);
          }
          const m = sim.resident('marlow');
          if (stayed && !m.departed && !m.leaving && m.aspiration.outcome) expect(m.aspiration.outcome, tag).toBe('stay');
          for (const t of feasts) {
            const supper = sim.state.story.memories.find((x) => x.label === 'Harvest Supper' && x.tick <= t && t - x.tick < 1440);
            expect(supper, `${tag}: Bram's feast on day ${dayOf(t)}`).toBeDefined();
          }
          for (const r of here(sim)) {
            const tastes = Object.values(r.beliefs).filter((b) => b.subject.startsWith('b:') && TASTE_ASPECTS.has(b.aspect));
            for (const b of tastes) for (const o of tastes) if (o.subject === b.subject) expect(Math.sign(o.valence), `${tag} ${r.id} ${b.subject}`).toBe(Math.sign(b.valence));
          }
          for (const [who] of departedOn) {
            const home = sim.resident(who).homeId;
            expect(n.subjectName(`b:${home}`), tag).not.toContain(residentDef(who).name);
          }
        }
      }
    }
  });

  it('"the whole valley turned out" only when most of it did; work asks grouped by the building wanted; reading every page is one line a day', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const n = new Narrator(sim, { stewardIsYou: true });
    const few = { id: 900, tick: sim.state.tick - 1440, kind: 'festival' as const, label: 'a long evening at the old oak', placeId: null, attendees: ['ada', 'bram'] };
    const most = { ...few, id: 901, label: 'the lantern walk', attendees: sim.state.order.slice(0, 5) };
    sim.state.story.memories.push(few, most);
    const clause = (id: number) => n.memoryClause('ada', { subject: `m:${id}`, aspect: 'wonderful_time', note: '' }, true);
    expect(clause(900)).not.toMatch(/whole valley/);
    expect(clause(901)).toMatch(/whole valley/);
    const q = (by: string, wants: string): Request => ({ id: 1, by, kind: 'workplace', subject: `r:${by}`, postedTick: 0, status: 'open', wants });
    const groups = groupAsks([q('bram', 'bakery'), q('fen', 'jetty'), q('ada', 'garden'), q('wren', 'garden')]);
    expect(groups.length).toBe(3);
    for (const g of groups) expect(new Set(g.map((x) => x.wants)).size).toBe(1);
    const before = n.entries.length;
    for (const id of sim.state.order) sim.schedule([{ at: sim.state.tick, kind: 'look', who: id } as never]);
    sim.flushCommands();
    expect(n.entries.slice(before).filter((e) => /story on/.test(e.text)).length).toBeLessThanOrEqual(1);
  });
});

describe('round 7, criterion 5: talk without stock clauses', () => {
  it('no fact or memory opener more than three times a town; the well get "the best of it"; neutral views get no thanks; lapses held by three at most; forgiven means quiet for a week', { timeout: 3_600_000 }, () => {
    const OPENERS = [/^What matters to me is\b/, /^Nothing lifts me like\b/, /^I work at\b/, /^Do you know, I still smile about it\b/];
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const counts = OPENERS.map(() => 0);
      const forgivenAt = new Map<string, { aspect: string; t: number }>();
      sim.on((e) => {
        if (e.type === 'reply' && e.stance === 'forgiven' && e.aspect) forgivenAt.set(e.who, { aspect: e.aspect, t: e.t });
        if (e.type === 'dilemma_closed' && e.dilemma.status === 'lapsed') {
          const label = `never answered ${residentDef(e.dilemma.proposer).name}'s ${e.dilemma.type.replace('_', ' ')}`;
          const holders = here(sim).filter((r) => [...Object.values(r.beliefs), ...Object.values(r.traces)].some((b) => b.subject === STEWARD && b.sources.some((s) => s.note === label && s.tick === e.t)) || r.buffer.some((x) => x.note === label && x.tick === e.t));
          expect(holders.length, `seed ${seed}: ${label}`).toBeLessThanOrEqual(3);
        }
      });
      const qs: TalkQuestion[] = ['how', 'mind', 'hope', 'me'];
      let turn = 0;
      for (let day = 2; day <= 30; day++) {
        sim.runUntil(at(day, 12));
        for (const r of here(sim)) {
          if (!awake(sim, r.id)) continue;
          for (const q of [qs[turn++ % qs.length]!, qs[turn++ % qs.length]!]) {
            const a = sim.talk(r.id, q);
            if (!a) continue;
            const text = n.lastReply?.text ?? '';
            for (const s of text.split(/(?<=[.!?])\s+/)) OPENERS.forEach((re, i) => (counts[i]! += re.test(s) ? 1 : 0));
            const offers = r.lastAnswer?.offers ?? offersFor(r, a, sim.state.tick);
            if (q === 'me' && (a.band === 'neutral' || a.band === 'cool')) for (const o of offers) expect(replySaid(o), `seed ${seed} ${r.id}`).not.toBe('Thank you. That means something.');
            if (q === 'how' && (a.band === 'good' || a.band === 'great')) {
              const d = offers.find((o) => o.kind === 'disagree');
              if (d) expect(replySaid(d)).toBe("What's been the best of it?");
            }
            const f = forgivenAt.get(r.id);
            if (f && sim.state.tick - f.t < 7 * 1440 && sim.state.tick > f.t) {
              expect(a.but?.aspect, `seed ${seed} ${r.id} raised ${f.aspect} again`).not.toBe(f.aspect);
              expect(a.topics?.some((t) => t.key === 'steward:fresh' && t.vars.aspect === f.aspect), `seed ${seed} ${r.id}`).toBeFalsy();
            }
            // Reply with sorry when offered, else agree, so forgiveness happens.
            const kind = offers.find((o) => o.kind === 'sorry') ? 'sorry' : 'agree';
            sim.reply(r.id, kind);
          }
        }
      }
      counts.forEach((c, i) => expect(c, `seed ${seed}: ${OPENERS[i]}`).toBeLessThanOrEqual(3));
    }
  });

  it('"What\'s been the best of it?" is answered with something from their week', () => {
    const sim = runScenario('quiet', 1, 'considerate');
    const n = new Narrator(sim, { stewardIsYou: true });
    sim.runUntil(at(6, 12));
    const r = here(sim).find((x) => awake(sim, x.id))!;
    r.mood = 0.85;
    const res = applyReply(sim.state, r, 'disagree', [{ kind: 'disagree', tone: 'mood', well: true }], () => {});
    expect(res?.stance).toBe('best_of');
    expect(n.bestOfWeek(r.id).length).toBeGreaterThan(5);
  });
});

describe('round 7, criterion 6: middle dream steps move', () => {
  it('every step that waits on neither you nor a date is done within six days (first steps four); no step repeats its title', { timeout: 1_800_000 }, () => {
    for (const steward of ['considerate', 'none'] as const) {
      for (const seed of SEEDS) {
        const sim = runScenario('quiet', seed, steward);
        for (let h = 1; h <= 30 * 24; h++) {
          sim.runUntil(h * 60);
          for (const r of here(sim)) {
            if (r.aspiration.done) continue;
            const s = currentStage(sim.state, r);
            if (!s || s.until || s.needs || s.dated || (s.place && s.place !== 'home' && !liveBuildings(sim.state).some((b) => b.type === s.place))) continue;
            if (sim.state.requests.some((q) => q.by === r.id && q.kind === 'aspiration' && q.status === 'open')) continue;
            const limit = r.aspiration.stage === 0 ? FIRST_STEP_DAYS : STEP_DAYS;
            expect(sim.state.tick - r.aspiration.since, `${steward} seed ${seed} ${r.id} on "${s.next}"`).toBeLessThanOrEqual(limit * 1440 + 60);
          }
        }
      }
    }
    const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3));
    for (const d of Object.values(ASPIRATIONS)) {
      const title = words(d.title);
      for (const s of d.stages) {
        const next = words(s.next);
        const shared = [...next].filter((w) => title.has(w)).length;
        expect(shared / Math.max(1, next.size), `${d.who}: "${s.next}" vs "${d.title}"`).toBeLessThan(0.6);
      }
    }
  });
});

void ({} as TalkAnswer);
