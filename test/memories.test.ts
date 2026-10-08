// Memories in conversation (spec 9.3, predeclared 2026-10-08). Each test names its criterion.
import { describe, expect, it } from 'vitest';
import { RECALL_LINES } from '../src/content/recall.js';
import { residentDef } from '../src/content/residents.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { RETELL_GAP, retellable, storyKey } from '../src/sim/recall.js';
import type { Simulation } from '../src/sim/sim.js';
import { at, TICKS_PER_DAY } from '../src/sim/time.js';
import type { Register, SimEvent, TalkAnswer } from '../src/sim/types.js';
import { SEEDS } from './helpers.js';

type Talk = Extract<SimEvent, { type: 'talk' }>;

/** Ask everyone "What do you think of me?" at noon every day from day 2 to day 15, noting who could have remembered something. */
function askDaily(sim: Simulation, onTalk: (t: Talk, eligible: boolean) => void = () => {}): Array<{ talk: Talk; eligible: boolean }> {
  const out: Array<{ talk: Talk; eligible: boolean }> = [];
  let pending: boolean[] = [];
  sim.on((e) => {
    if (e.type !== 'talk') return;
    const eligible = pending.shift() ?? false;
    out.push({ talk: e, eligible });
    // Checked as it is said, while the memory is still held.
    onTalk(e, eligible);
  });
  for (let day = 2; day <= 15; day++) {
    sim.runUntil(at(day, 12));
    for (const id of sim.state.order) {
      const r = sim.state.residents[id]!;
      if (r.departed || (r.activity?.id === 'sleep' && r.at === r.homeId)) continue;
      const told = r.recalled ?? {};
      pending.push(retellable(r, sim.tick).some((ep) => ep.subject === 'steward' && !(told[storyKey(ep)] !== undefined && sim.tick - (told[storyKey(ep)] as number) < RETELL_GAP)));
      sim.talk(id, 'me');
    }
    pending = [];
  }
  return out;
}

describe('memories in conversation', () => {
  const runs = () => SEEDS.flatMap((seed) => (['bakery', 'quiet'] as const).map((sc) => ({ seed, sc, sim: runScenario(sc, seed, 'considerate') })));

  it('criteria 1, 2 and 4: memories come up, are true, and are not retold within three days', { timeout: 300_000 }, () => {
    let eligible = 0;
    let withMemory = 0;
    let mentioned = 0;
    for (const { sim } of runs()) {
      const n = new Narrator(sim, { stewardIsYou: true });
      const lastTold = new Map<string, number>();
      askDaily(sim, (talk, could) => {
        const m = talk.answer.memory;
        if (could) {
          eligible++;
          if (m) withMemory++;
        }
        if (!m) return;
        mentioned++;
        const r = sim.state.residents[talk.who]!;
        // Criterion 2: a real episode they lived through, same subject, kind and feeling.
        const ep = r.episodes.find((x) => x.id === m.episodeId);
        expect(ep, `${talk.who} remembers episode ${m.episodeId}`).toBeDefined();
        expect(ep!.source).toBe('witnessed');
        expect(ep!.subject).toBe(m.subject);
        expect(ep!.aspect).toBe(m.aspect);
        expect(Math.sign(ep!.valence)).toBe(Math.sign(m.valence));
        expect(talk.t - ep!.tick).toBeGreaterThanOrEqual(TICKS_PER_DAY);
        // The reply carries its time phrase.
        expect(n.whenSaid(m.tick, talk.t)).toMatch(/^(yesterday|(two|three|four|five|six) days ago|last week|back in the (spring|summer|autumn|winter)|last (spring|summer|autumn|winter))$/);
        // Criterion 4: not the same memory again within three days (checked by story, which is stricter).
        const k = `${talk.who}|${storyKey(m)}`;
        const last = lastTold.get(k);
        if (last !== undefined) expect(talk.t - last, `${k} retold too soon`).toBeGreaterThanOrEqual(RETELL_GAP);
        lastTold.set(k, talk.t);
      });
    }
    expect(eligible).toBeGreaterThan(50);
    expect(withMemory / eligible).toBeGreaterThanOrEqual(0.6);
    expect(mentioned).toBeGreaterThan(50);
  });

  it('criterion 2: the time phrase matches the age', () => {
    const sim = runScenario('quiet', 1, 'none');
    const n = new Narrator(sim);
    const now = at(30, 12);
    expect(n.whenSaid(at(29, 9), now)).toBe('yesterday');
    expect(n.whenSaid(at(28, 9), now)).toBe('two days ago');
    expect(n.whenSaid(at(24, 9), now)).toBe('six days ago');
    expect(n.whenSaid(at(23, 9), now)).toBe('last week');
    expect(n.whenSaid(at(17, 9), now)).toBe('last week');
    // Day 30 is in the second year (28-day years): day 10 was last summer.
    expect(n.whenSaid(at(10, 9), now)).toBe('last summer');
    expect(n.whenSaid(at(2, 9), at(20, 12))).toBe('back in the spring');
  });

  it('criterion 3: memories fit the question', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'considerate');
      sim.runUntil(at(8, 12));
      for (const id of sim.state.order) {
        const r = sim.state.residents[id]!;
        if (r.departed || (r.activity?.id === 'sleep' && r.at === r.homeId)) continue;
        const me = sim.talk(id, 'me') as TalkAnswer;
        if (me.memory) expect(me.memory.subject).toBe('steward');
        const hope = sim.talk(id, 'hope') as TalkAnswer;
        expect(hope.memory).toBeUndefined();
        for (const other of sim.state.order) {
          if (other === id) continue;
          const a = sim.talk(id, 'opinion', `r:${other}`) as TalkAnswer;
          if (a.memory) expect(a.memory.subject).toBe(`r:${other}`);
        }
      }
    }
  });

  it('criterion 5: remembering keeps a memory alive', { timeout: 300_000 }, () => {
    let stronger = 0;
    let compared = 0;
    for (const seed of SEEDS) {
      const asked = runScenario('bakery', seed, 'considerate');
      asked.runUntil(at(3, 8));
      const quiet = asked.clone();
      // In the asked town, someone is asked about you every day; the twin is never asked.
      const recalled = new Map<string, number>();
      asked.on((e) => {
        if (e.type === 'talk' && e.answer.memory && e.answer.memory.valence > 0) {
          const k = `${e.who}|${e.answer.memory.subject}|${e.answer.memory.aspect}`;
          recalled.set(k, (recalled.get(k) ?? 0) + 1);
        }
      });
      for (let day = 3; day <= 13; day++) {
        asked.runUntil(at(day, 12));
        quiet.runUntil(at(day, 12));
        for (const id of asked.state.order) {
          const r = asked.state.residents[id]!;
          if (!r.departed && !(r.activity?.id === 'sleep' && r.at === r.homeId)) asked.talk(id, 'me');
        }
      }
      asked.runUntil(at(14, 8));
      quiet.runUntil(at(14, 8));
      // The kindness told most often that is a belief in either twin, and that belief in each.
      // (Corrected 2026-10-08 after the first run: the most-told memory was sometimes still an
      // unformed trace in both twins, 0 against 0, which says nothing about the belief.)
      const beliefIn = (sim: Simulation, k: string) => {
        const [who, subject, aspect] = k.split('|') as [string, string, string];
        return sim.state.residents[who]!.beliefs[`${subject}|${aspect}`]?.strength;
      };
      const top = [...recalled].sort((a, b) => b[1] - a[1]).find(([k]) => beliefIn(asked, k) !== undefined || beliefIn(quiet, k) !== undefined);
      if (!top) continue;
      const [who, subject, aspect] = top[0].split('|') as [string, string, string];
      const key = `${subject}|${aspect}`;
      const a = asked.state.residents[who]!.beliefs[key]?.strength ?? 0;
      const q = quiet.state.residents[who]!.beliefs[key]?.strength ?? 0;
      compared++;
      if (a > q) stronger++;
    }
    expect(compared).toBe(SEEDS.length);
    expect(stronger).toBeGreaterThanOrEqual(4);
  });

  it('criterion 6: every kind of memory, in every register, reads right', { timeout: 600_000 }, () => {
    const registers: Register[] = ['plain', 'formal', 'warm', 'chatty', 'dreamy'];
    let checked = 0;
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      const sim = runScenario(seed % 2 ? 'bakery' : 'quiet', seed, seed === 5 ? 'none' : 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      for (let day = 4; day <= 28; day += 4) {
        sim.runUntil(at(day, 12));
        for (const id of sim.state.order) {
          const r = sim.state.residents[id]!;
          const p = residentDef(id).pronouns;
          for (const ep of retellable(r, sim.tick)) {
            kinds.add(ep.aspect);
            const clause = n.memoryClause(id, ep, true);
            expect(clause, `${id} ${ep.aspect} "${ep.note}"`).not.toMatch(/\{|\}|undefined|NaN|  /);
            // First person: their own pronouns have become "me" / "I".
            expect(clause, `${id} ${ep.aspect} "${ep.note}"`).not.toMatch(new RegExp(`\\b(for|helped|help|woke|after) ${p.obj}\\b`));
            expect(clause).not.toMatch(new RegExp(`\\b${p.subj} (was|were)\\b`));
            if (ep.subject === 'steward') {
              expect(clause).toMatch(/\byou\b/);
              expect(clause).not.toMatch(/the steward/);
            }
            for (const reg of registers) {
              for (const t of [...(RECALL_LINES.good[reg] ?? []), ...(RECALL_LINES.bad[reg] ?? [])]) {
                const line = t.replace('{clause}', clause).replace('{when}', n.whenSaid(ep.tick));
                expect(line).not.toMatch(/\{|\}|undefined/);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(15);
    expect(checked).toBeGreaterThan(1000);
  });

  it('replays the same: memories told depend only on the logged talks', { timeout: 60_000 }, () => {
    const play = () => {
      const sim = runScenario('bakery', 2, 'considerate');
      sim.schedule([3, 4, 5, 6].flatMap((d) => ['ada', 'bram', 'fen'].map((who) => ({ at: at(d, 12), kind: 'talk' as const, who, question: 'me' as const }))));
      const told: string[] = [];
      sim.on((e) => {
        if (e.type === 'talk') told.push(`${e.who}:${e.answer.memory?.episodeId ?? '-'}`);
      });
      sim.runUntil(at(7, 0));
      return told.join(',');
    };
    expect(play()).toBe(play());
  });
});
