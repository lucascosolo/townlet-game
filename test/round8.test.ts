// Bar round 8 (spec 9.3, predeclared 2026-10-10): a second fortnight with something to decide,
// apologies that are earned, a talk panel that says what it means, minds that blame the right
// thing, asks and the tray that agree, and less repetition.
import { describe, expect, it } from 'vitest';
import { buildingDef } from '../src/content/buildings.js';
import { RESIDENTS, residentDef } from '../src/content/residents.js';
import { residentReport } from '../src/inspect/inspector.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { assess } from '../src/sim/asks.js';
import { nextFact } from '../src/sim/progress.js';
import { applyReply, offersFor, WE_LL_SEE_GAIN } from '../src/sim/replies.js';
import type { Simulation } from '../src/sim/sim.js';
import { SURPLUS_SPOILS, storesDawn } from '../src/sim/stores.js';
import { at, dayOf, TICKS_PER_DAY } from '../src/sim/time.js';
import { STEWARD, type TalkQuestion } from '../src/sim/types.js';
import { canPlace, liveBuildings } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

const here = (sim: Simulation) => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
const awake = (sim: Simulation, id: string) => !sim.resident(id).departed && sim.resident(id).activity?.id !== 'sleep';

function place(sim: Simulation, type: string, near?: [number, number]): number {
  sim.state.stock.timber = Math.max(sim.state.stock.timber, 100);
  const spots: Array<[number, number]> = [];
  for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) spots.push([x, y]);
  if (near) spots.sort((a, b) => Math.hypot(a[0] - near[0], a[1] - near[1]) - Math.hypot(b[0] - near[0], b[1] - near[1]));
  for (const [x, y] of spots) if (canPlace(sim.state, type, x, y) === null) return sim.build(type, x, y).id;
  throw new Error(`nowhere for ${type}`);
}

const stewardNotes = (r: ReturnType<Simulation['resident']>) => [...Object.values(r.beliefs), ...Object.values(r.traces)].filter((b) => b.subject === STEWARD).flatMap((b) => b.sources.map((s) => s.note));

describe('round 8, criterion 1: a second fortnight with something to decide', () => {
  it('a granary over its winter target loses some of the surplus each dawn, never what is below the target', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const target = sim.state.stores?.target ?? 50;
    const host = { state: sim.state, emitEvent: () => {} } as never;
    sim.state.granary = target + 100;
    storesDawn(host);
    expect(sim.state.granary).toBeCloseTo(target + 100 * (1 - SURPLUS_SPOILS), 6);
    sim.state.granary = target - 5;
    storesDawn(host);
    expect(sim.state.granary).toBe(target - 5);
  });

  it('considerate, 30 days: a cottage is asked for, newcomers come on three seeds of five, and no two hold the same dream', { timeout: 3_600_000 }, () => {
    let arrivedSeeds = 0;
    let asked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      let arrived = 0;
      sim.on((e) => {
        if (e.type === 'arrived') arrived++;
      });
      for (let day = 1; day <= 30; day++) {
        sim.runUntil(at(day, 7));
        // A template dream has a subject; a newcomer's own "settle in" has none and is everyone's first.
        const dreams = here(sim).filter((r) => !r.aspiration.done && r.aspiration.kind && r.aspiration.subject).map((r) => `${r.aspiration.kind}|${r.aspiration.subject}`);
        expect(new Set(dreams).size, `seed ${seed} day ${day}: ${dreams.join(', ')}`).toBe(dreams.length);
      }
      if (sim.state.requests.some((q) => q.kind === 'home_for_kin')) asked++;
      if (arrived > 0) arrivedSeeds++;
    }
    expect(asked).toBeGreaterThan(0);
    expect(arrivedSeeds).toBeGreaterThanOrEqual(3);
  });
});

describe('round 8, criterion 2: apologies must be earned', () => {
  it('the day after a loss every answer offers a sorry for it, and it is "not yet"; below zero a sorry is "we\'ll see" and moves standing 0.01 at most', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 10));
    const r = here(sim).find((x) => x.jobId !== null)!;
    const job = sim.state.buildings.find((b) => b.id === r.jobId)!;
    sim.remove(job.x, job.y);
    // They take it in when they see it.
    while (r.hurtAt === undefined && sim.state.tick < at(4, 20)) sim.runUntil(sim.state.tick + 30);
    while (!awake(sim, r.id)) sim.runUntil(sim.state.tick + 30);
    expect(sim.state.tick - r.hurtAt!).toBeLessThan(TICKS_PER_DAY);
    for (const q of ['how', 'mind', 'hope', 'me'] as TalkQuestion[]) {
      const a = sim.talk(r.id, q)!;
      expect(offersFor(r, a, sim.state.tick).some((o) => o.kind === 'sorry'), `${q}`).toBe(true);
    }
    const res = sim.reply(r.id, 'sorry');
    expect(res?.stance).toBe('too_soon');

    const sim2 = runScenario('quiet', 2, 'none');
    sim2.runUntil(at(5, 12));
    const o = here(sim2).find((x) => awake(sim2, x.id))!;
    o.rel[STEWARD]!.affinity = -0.2;
    const before = o.rel[STEWARD]!.affinity;
    const out = applyReply(sim2.state, o, 'sorry', [{ kind: 'sorry', aspect: 'ignores_me', about: 'kept me waiting' }], () => {});
    expect(out?.stance).toBe('we_ll_see');
    expect(o.rel[STEWARD]!.affinity - before).toBeLessThanOrEqual(WE_LL_SEE_GAIN + 1e-9);
  });

  it('nobody who lost a workplace in the last fortnight "thinks the world of you" (standing above 0.5)', { timeout: 600_000 }, () => {
    const sim = runScenario('quiet', 1, 'considerate');
    sim.runUntil(at(3, 10));
    const r = here(sim).find((x) => x.jobId !== null)!;
    const job = sim.state.buildings.find((b) => b.id === r.jobId)!;
    sim.remove(job.x, job.y);
    while (r.hurtAt === undefined && sim.state.tick < at(4, 20)) sim.runUntil(sim.state.tick + 30);
    const lost = r.hurtAt!;
    // However well they are treated meanwhile, standing is held at 0.5 for the fortnight.
    for (let h = 1; h < 14 * 24; h++) {
      sim.runUntil(lost + h * 60);
      r.rel[STEWARD]!.affinity = 0.95;
      sim.runUntil(sim.state.tick + 1);
      expect(r.rel[STEWARD]!.affinity, `hour ${h}`).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe('round 8, criterion 3: the talk panel says what it means', () => {
  it('after a favour the last answer offers no replies; "the best of it" names no activity and no placeless spot; repeats of how and mind are not "As I told you"', { timeout: 600_000 }, () => {
    const sim = runScenario('quiet', 1, 'considerate');
    const n = new Narrator(sim, { stewardIsYou: true });
    sim.runUntil(at(4, 11));
    const r = here(sim).find((x) => awake(sim, x.id))!;
    sim.talk(r.id, 'how');
    expect(r.lastAnswer?.replied).toBe(false);
    sim.askFavour(r.id, 'timber');
    expect(r.lastAnswer?.replied).toBe(true);

    const clause = (aspect: string, note: string, subject = 'r:bram') => n.memoryClause('ada', { subject: subject as never, aspect, note }, true);
    for (const act of ['chat', 'tease', 'reminisce', 'compliment', 'share meal']) expect(clause('good_times', `${act} with Bram`, 'b:1')).not.toMatch(new RegExp(`^${act} with`, 'i'));
    const bench = liveBuildings(sim.state).find((b) => buildingDef(b.type).kind !== 'home')!;
    expect(clause('peaceful_spot', 'a lovely spot', `b:${bench.id}`)).toContain(n.subjectName(`b:${bench.id}`));

    const repeats: string[] = [];
    for (let day = 5; day <= 20; day++) {
      sim.runUntil(at(day, 12));
      for (const x of here(sim)) {
        if (!awake(sim, x.id)) continue;
        for (const q of ['how', 'mind'] as TalkQuestion[]) {
          if (!sim.talk(x.id, q)) continue;
          repeats.push(n.lastReply?.text ?? '');
        }
      }
    }
    for (const t of repeats) expect(t).not.toMatch(/^As I told you/);
  });

  it('30 days, three stewards, both towns: partners keep their pronouns, names keep their capitals, no tic before "of course"', { timeout: 3_600_000 }, () => {
    const names = [...RESIDENTS.map((d) => d.name), 'Pip'];
    const lowered = new RegExp(`(?:^|[,:] )(${names.map((x) => x.toLowerCase()).join('|')})\\b(?! (?:with|of))`);
    for (const scenario of ['quiet', 'bakery']) {
      for (const steward of ['considerate', 'favours', 'none'] as const) {
        const sim = runScenario(scenario, 1, steward);
        const n = new Narrator(sim, { stewardIsYou: true });
        const quotes: string[] = [];
        let turn = 0;
        const qs: TalkQuestion[] = ['how', 'mind', 'hope'];
        for (let day = 2; day <= 30; day++) {
          sim.runUntil(at(day, 12));
          for (const r of here(sim)) {
            if (!awake(sim, r.id)) continue;
            if (sim.talk(r.id, qs[turn++ % qs.length]!)) quotes.push(n.lastReply?.text ?? '');
          }
        }
        const tag = `${scenario} ${steward}`;
        for (const e of n.entries) {
          const m = /Fen asks (\w+), gruffly, whether (\w+)/.exec(e.text);
          if (m) {
            const def = RESIDENTS.find((d) => d.name === m[1]);
            if (def) expect(m[2], `${tag}: ${e.text}`).toBe(def.pronouns.subj);
          }
          for (const q of e.text.match(/"[^"]+"/g) ?? []) {
            expect(q, `${tag}: ${e.text}`).not.toMatch(/\w, of course\b/);
            expect(q, `${tag}: ${e.text}`).not.toMatch(lowered);
          }
        }
        for (const q of quotes) {
          expect(q, tag).not.toMatch(/\w, of course\b/);
          expect(q, tag).not.toMatch(lowered);
        }
      }
    }
  });

  it('"what\'s on your mind" about a lost place offers a sorry', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 10));
    const r = here(sim).find((x) => x.jobId !== null)!;
    const job = sim.state.buildings.find((b) => b.id === r.jobId)!;
    sim.remove(job.x, job.y);
    while (r.hurtAt === undefined && sim.state.tick < at(4, 20)) sim.runUntil(sim.state.tick + 30);
    let checked = 0;
    for (let i = 0; i < 8; i++) {
      const a = sim.talk(r.id, 'mind');
      // Judged as if the day in which every answer offers a sorry were past.
      if (a?.topics?.some((t) => t.about === `b:${job.id}` && t.key === 'feel:grief')) {
        expect(offersFor(r, a, r.hurtAt! + 2 * TICKS_PER_DAY).some((o) => o.kind === 'sorry')).toBe(true);
        checked++;
      }
      sim.runUntil(sim.state.tick + 60);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('round 8, criterion 4: minds blame the right thing', () => {
  it('noise from their own workplace at night raises no grievance against you', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 12));
    const r = here(sim)[0]!;
    const home = sim.state.buildings.find((b) => b.id === r.homeId)!;
    const loud = 'bakery';
    const id = place(sim, loud, [home.x, home.y]);
    r.jobId = id;
    sim.state.story.extraShifts.push([id, sim.state.tick, at(6, 6)]);
    sim.runUntil(at(5, 8));
    const name = buildingDef(loud).name.toLowerCase();
    expect(r.disturbedBy, 'the bakery did wake them').toContain(id);
    expect(stewardNotes(r)).not.toContain(`put the ${name} there`);
  });

  it('the morning after losing their workplace, "how are you" is fair or lower and names it', { timeout: 600_000 }, () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      sim.runUntil(at(3, 15));
      const r = here(sim).find((x) => x.jobId !== null)!;
      const job = sim.state.buildings.find((b) => b.id === r.jobId)!;
      const name = buildingDef(job.type).name.toLowerCase();
      sim.remove(job.x, job.y);
      while (r.hurtAt === undefined && sim.state.tick < at(5, 20)) sim.runUntil(sim.state.tick + 30);
      if (r.hurtAt === undefined) continue;
      sim.runUntil(at(dayOf(r.hurtAt) + 1, 10));
      if (!awake(sim, r.id)) continue;
      const a = sim.talk(r.id, 'how')!;
      expect(['fair', 'low', 'bad'], `seed ${seed}`).toContain(a.band);
      expect((n.lastReply?.text ?? '').toLowerCase(), `seed ${seed}`).toContain(name);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('in 30-day runs no page lists a forming view of a place against a settled or stronger one, and no dream is learned once done', { timeout: 3_600_000 }, () => {
    for (const steward of ['considerate', 'favours', 'none'] as const) {
      const sim = runScenario('quiet', 1, steward);
      const n = new Narrator(sim, { stewardIsYou: true });
      for (let day = 5; day <= 30; day += 5) {
        sim.runUntil(at(day, 12));
        for (const r of here(sim)) {
          const rep = residentReport(sim, r.id, n);
          for (const f of rep.forming) {
            if (!f.subject.startsWith('b:')) continue;
            const settled = Object.values(r.beliefs).filter((b) => b.subject === f.subject);
            for (const b of settled) expect(Math.sign(b.valence), `${steward} day ${day} ${r.id}: ${f.statement}`).toBe(Math.sign(f.evidence));
            for (const g of rep.forming) if (g.subject === f.subject) expect(Math.sign(g.evidence), `${steward} day ${day} ${r.id}`).toBe(Math.sign(f.evidence));
          }
          if (r.aspiration.done) expect(nextFact(sim.state, r.id, 'hope')).not.toBe('dream');
        }
      }
    }
  });
});

describe('round 8, criterion 5: asks and the tray agree', () => {
  it('a well answers "another place to gather"; a third building of a kind is named by where it stands', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const r = here(sim)[0]!;
    const since = sim.state.tick;
    place(sim, 'well');
    expect(assess(sim.state, r, 'place_to_gather', since).met).toBe(true);

    const n = new Narrator(sim, { stewardIsYou: true });
    const homes = here(sim).map((x) => sim.state.buildings.find((b) => b.id === x.homeId)!);
    // Wells: decor (benches, hedges) is never numbered at all.
    const wells = homes.slice(0, 3).map((h) => place(sim, 'well', [h.x, h.y]));
    const names = wells.map((id) => n.subjectName(`b:${id}`));
    expect(new Set(names).size).toBe(3);
    for (const x of names) expect(x).not.toMatch(/\b(third|second|first)\b/);
  });
});

describe('round 8, criterion 6: less repetition', () => {
  it('"What\'s been the best of it?" daily for 30 days: "the whole valley turned out" in a fifth at most, and no kind of memory twice in a week', { timeout: 1_800_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      let total = 0;
      let whole = 0;
      let kinds = 0;
      // Audit 2026-10-10: every wording of "everyone turned out" counts (round 8 added three), and the
      // kind of each memory is read from what was said, not from the narrator's own record.
      const WHOLE = /whole valley turned out|everyone came out for|we were all together for|whole town gathered for/;
      const saidKinds = new Map<string, Array<{ t: number; aspect: string }>>();
      for (let day = 2; day <= 30; day++) {
        sim.runUntil(at(day, 12));
        for (const r of here(sim)) {
          const said = n.bestOfWeek(r.id);
          total++;
          if (WHOLE.test(said)) whole++;
          if (said === 'the quiet, mostly') continue;
          const since = sim.state.tick - 7 * TICKS_PER_DAY;
          const ep = [...r.episodes, ...r.buffer].find((e) => e.tick >= since && e.valence > 0 && n.memoryClause(r.id, e, true) === said);
          if (!ep) continue;
          kinds++;
          const before = (saidKinds.get(r.id) ?? []).filter((x) => sim.state.tick - x.t < 7 * TICKS_PER_DAY);
          expect(before.map((x) => x.aspect), `seed ${seed} day ${dayOf(sim.state.tick)} ${r.id}: ${said}`).not.toContain(ep.aspect);
          saidKinds.set(r.id, [...before, { t: sim.state.tick, aspect: ep.aspect }]);
        }
      }
      expect(kinds, `seed ${seed}`).toBeGreaterThan(20);
      expect(whole / total, `seed ${seed}`).toBeLessThanOrEqual(0.2);
    }
  });
});
