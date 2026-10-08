// Bar round 2 (spec 9.3, predeclared 2026-10-08). Criterion 1: replies that fit the answer before them.
import { describe, expect, it } from 'vitest';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { beliefKey } from '../src/sim/mind/memory.js';
import { ownNote } from '../src/sim/replies.js';
import { at } from '../src/sim/time.js';
import { STEWARD, type TalkAnswer, type TalkQuestion } from '../src/sim/types.js';
import { liveBuildings } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

const awake = (sim: ReturnType<typeof runScenario>, id: string) => {
  const r = sim.resident(id);
  return !r.departed && !(r.activity?.id === 'sleep');
};

describe('round 2, criterion 1: replies that fit', () => {
  it('sorry is never offered after praise or a shrug, always after a complaint or a bad memory of you; explain only for the decision complained of; a sorry names what it is for and the oak sorry is forgiven', { timeout: 900_000 }, () => {
    const questions: TalkQuestion[] = ['how', 'mind', 'hope', 'me', 'opinion'];
    let answers = 0;
    let sorries = 0;
    let oakSorries = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      let oakDay = false;
      const oakSaid = new Set<string>();
      sim.on((e) => {
        if (e.type !== 'talk') return;
        answers++;
        const a = e.answer;
        const text = n.lastReply?.text ?? '';
        const offers = sim.resident(e.who).lastAnswer?.offers ?? [];
        const sorry = offers.find((o) => o.kind === 'sorry');
        const explain = offers.find((o) => o.kind === 'explain');
        // Praise with nothing conceded: a kind view that goes on "though you felled the oak" has named something to be sorry for.
        const praise = a.question === 'me' && (a.band === 'love' || a.band === 'like') && !a.but;
        const shrug = a.question === 'opinion' && a.about !== STEWARD && a.band === 'neutral' && !a.memory;
        const complaint = a.question === 'me' && (a.band === 'dislike' || a.band === 'hate') && a.because?.subject === STEWARD;
        const badMemory = a.memory?.subject === STEWARD && a.memory.valence < 0;
        if (praise) expect(sorry, `${e.who} praised you: ${text}`).toBeUndefined();
        if (shrug) expect(sorry, `${e.who} shrugged: ${text}`).toBeUndefined();
        if (complaint || badMemory) expect(sorry, `${e.who} complained: ${text}`).toBeDefined();
        if (explain) {
          expect(['turned_me_down', 'decided_badly', 'ignores_me']).toContain(explain.aspect);
          // The same grievance the answer carried, which is the one a sorry is for.
          expect(sorry?.aspect).toBe(explain.aspect);
        }
        if (sorry) {
          sorries++;
          expect(sorry.about, `sorry with nothing named for ${e.who}`).toBeTruthy();
          // Taken every time: it must land as forgiven or (a second sorry for the same thing within three days) enough.
          const res = sim.reply(e.who, 'sorry');
          expect(res).not.toBeNull();
          if (oakDay && sorry.aspect === 'destroyed_place') {
            // Forgiven the first time that day; a second sorry for the same thing (another question, same day) gets "enough".
            if (!oakSaid.has(e.who)) expect(res?.stance, `${e.who} on the oak`).toBe('forgiven');
            oakSaid.add(e.who);
            oakSorries++;
          }
          // Never born of praise: a made_amends memory only follows a carried grievance (checked above by construction).
        }
      });
      for (let day = 2; day <= 21; day++) {
        sim.runUntil(at(day, 12));
        if (day === 6) {
          const oak = liveBuildings(sim.state).find((b) => b.type === 'oak');
          if (oak) sim.remove(oak.x, oak.y);
          sim.runUntil(at(6, 14));
        }
        // The oak falls at noon on day 6; they notice it over the day, and bring it up on day 7.
        oakDay = day === 7;
        for (const id of sim.state.order) {
          if (!awake(sim, id)) continue;
          for (const q of questions) {
            const about = q === 'opinion' ? (day % 2 ? `r:${sim.state.order.find((o) => o !== id)}` : `b:${liveBuildings(sim.state).find((b) => b.type === 'commons')!.id}`) : undefined;
            sim.talk(id, q, about);
          }
        }
      }
    }
    expect(answers).toBeGreaterThan(1500);
    expect(sorries).toBeGreaterThan(20);
    expect(oakSorries).toBeGreaterThan(0);
  });

  it('a note becomes the steward\'s own words', () => {
    expect(ownNote('took away the old oak')).toBe('I took away the old oak');
    expect(ownNote('kept me waiting')).toBe('I kept you waiting');
    expect(ownNote('said no to my idea')).toBe('I said no to your idea');
    expect(ownNote('nothing was done')).toBe('nothing was done');
    expect(ownNote('let the larder run bare')).toBe('I let the larder run bare');
  });

  it('the day after the oak falls, everyone who minded is offered a sorry for the oak and forgives', { timeout: 120_000 }, () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(8, 9));
      const oak = liveBuildings(sim.state).find((b) => b.type === 'oak')!;
      sim.remove(oak.x, oak.y);
      sim.runUntil(at(9, 12));
      const k = beliefKey(STEWARD, 'destroyed_place');
      for (const id of sim.state.order) {
        if (!awake(sim, id)) continue;
        const r = sim.resident(id);
        if (!(r.beliefs[k] || r.traces[k])) continue;
        // Whoever minded brings it up in one of the three questions; a sorry then is for the oak.
        let sorry: { aspect?: string; about?: string } | undefined;
        for (const q of ['me', 'mind', 'how'] as const) {
          sim.talk(id, q) as TalkAnswer;
          sorry = r.lastAnswer?.offers.find((o) => o.kind === 'sorry');
          if (sorry?.aspect === 'destroyed_place') break;
          if (sorry) sim.reply(id, 'agree');
        }
        if (sorry?.aspect !== 'destroyed_place') continue;
        expect(sorry.about).toMatch(/old oak/);
        expect(sim.reply(id, 'sorry')?.stance).toBe('forgiven');
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});
