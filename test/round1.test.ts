// Bar round 1 criteria 1–4 (spec 9.3, predeclared 2026-10-08): consequence, the fan club,
// talking back, and answers that aren't stitched. Each test names its criterion.
import { describe, expect, it } from 'vitest';
import { residentDef } from '../src/content/residents.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { beliefKey } from '../src/sim/mind/memory.js';
import { dilemmaDef, stanceScore } from '../src/sim/story/dilemmas.js';
import { offersFor } from '../src/sim/replies.js';
import type { Simulation } from '../src/sim/sim.js';
import { at } from '../src/sim/time.js';
import { STEWARD, type SimEvent, type TalkAnswer, type TalkQuestion } from '../src/sim/types.js';
import { canPlace, liveBuildings } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

const meanMood = (sim: Simulation) => {
  const rs = sim.state.order.map((id) => sim.state.residents[id]!).filter((r) => !r.departed);
  return rs.reduce((s, r) => s + r.mood, 0) / rs.length;
};
const awake = (sim: Simulation, id: string) => {
  const r = sim.state.residents[id]!;
  return !r.departed && !(r.activity?.id === 'sleep' && r.at === r.homeId);
};
/** A free spot for `type` next to a home, if any. */
function beside(sim: Simulation, homeId: number, type: string): [number, number] | null {
  const home = liveBuildings(sim.state).find((b) => b.id === homeId)!;
  for (let y = home.y - 1; y <= home.y + 2; y++) for (let x = home.x - 1; x <= home.x + 2; x++) if (canPlace(sim.state, type, x, y) === null) return [x, y];
  return null;
}

describe('round 1, criterion 1: consequence', () => {
  it('a considerate steward’s town is at least 0.15 happier than a neglected one on day 21', { timeout: 600_000 }, () => {
    let gap = 0;
    for (const seed of SEEDS) {
      const a = runScenario('quiet', seed, 'considerate');
      const b = runScenario('quiet', seed, 'none');
      a.runUntil(at(21, 20));
      b.runUntil(at(21, 20));
      gap += meanMood(a) - meanMood(b);
    }
    expect(gap / SEEDS.length).toBeGreaterThanOrEqual(0.15);
  });

  it('neglect: someone is thinking of leaving by day 14 on 3 of 5 seeds, and no more than 2 leave by day 21', { timeout: 600_000 }, () => {
    let early = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      let thinking = false;
      let left = 0;
      sim.on((e) => {
        if (e.type === 'thinking_of_leaving' && e.t <= at(14, 23)) thinking = true;
        if (e.type === 'left_town') left++;
      });
      sim.runUntil(at(21, 23));
      if (thinking) early++;
      expect(left, `seed ${seed} departures`).toBeLessThanOrEqual(2);
    }
    expect(early).toBeGreaterThanOrEqual(3);
  });

  it('recoverable: answering their asks and talking daily turns a leaver round within 5 days on 3 of 5 seeds', { timeout: 600_000 }, () => {
    let saved = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      let who: string | null = null;
      sim.on((e) => {
        if (e.type === 'thinking_of_leaving' && !who) who = e.who;
      });
      while (!who && sim.tick < at(20, 0)) sim.runUntil(sim.tick + 1440);
      if (!who) continue;
      const id = who as string;
      const start = sim.tick;
      let stayed = false;
      sim.on((e) => {
        if (e.type === 'decided_to_stay' && e.who === id) stayed = true;
      });
      sim.state.stock.timber = 100;
      for (let d = 0; d < 5 && !stayed; d++) {
        // Answer whatever they ask for, in the morning.
        sim.runUntil(start + d * 1440 + 180);
        for (const q of sim.state.requests) {
          if (q.by !== id || q.status !== 'open') continue;
          const want = q.kind === 'quieter_home' ? null : q.kind === 'more_green' || q.kind === 'somewhere_to_sit' ? 'flowerbed' : q.kind === 'workplace' ? (q.wants ?? 'garden') : q.kind === 'more_food' ? 'garden' : q.kind === 'place_to_gather' ? 'bench' : q.wants ?? null;
          if (!want) continue;
          const spot = beside(sim, sim.resident(id).homeId, want);
          if (spot) sim.build(want, spot[0], spot[1]);
        }
        sim.runUntil(start + d * 1440 + 600);
        if (awake(sim, id)) {
          sim.talk(id, 'me');
          sim.reply(id, 'sorry');
        }
      }
      sim.runUntil(start + 5 * 1440 + 500);
      if (stayed || !sim.resident(id).leaving) saved++;
    }
    expect(saved).toBeGreaterThanOrEqual(3);
  });

  it('home counts: a hedge and a flower bed beside every home lift mean mood by 0.04 on day 7', { timeout: 300_000 }, () => {
    let gap = 0;
    for (const seed of SEEDS) {
      const bare = runScenario('quiet', seed, 'none');
      const green = runScenario('quiet', seed, 'none');
      green.state.stock.timber = 100;
      for (const id of green.state.order) {
        const home = green.resident(id).homeId;
        const h = beside(green, home, 'hedge');
        if (h) green.build('hedge', h[0], h[1]);
        const f = beside(green, home, 'flowerbed');
        if (f) green.build('flowerbed', f[0], f[1]);
      }
      bare.runUntil(at(7, 20));
      green.runUntil(at(7, 20));
      gap += meanMood(green) - meanMood(bare);
    }
    expect(gap / SEEDS.length).toBeGreaterThanOrEqual(0.04);
  });
});

describe('round 1, criterion 2: the fan club', () => {
  it('one flower bed on day 1 leaves everyone below "thinks the world of you" on day 2', () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(1, 9));
      const spot = beside(sim, sim.resident('ada').homeId, 'flowerbed')!;
      sim.build('flowerbed', spot[0], spot[1]);
      sim.runUntil(at(2, 12));
      for (const id of sim.state.order) expect(sim.resident(id).rel[STEWARD]!.affinity, `${id} seed ${seed}`).toBeLessThan(0.7);
    }
  });

  it('felling the old oak on day 5 costs at least 1.5 times what the flower bed earned', { timeout: 300_000 }, () => {
    let up = 0;
    let down = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(1, 9));
      const before1 = sim.state.order.map((id) => sim.resident(id).rel[STEWARD]!.affinity);
      const spot = beside(sim, sim.resident('ada').homeId, 'flowerbed')!;
      sim.build('flowerbed', spot[0], spot[1]);
      sim.runUntil(at(3, 9));
      const after1 = sim.state.order.map((id) => sim.resident(id).rel[STEWARD]!.affinity);
      up += after1.reduce((s, v, i) => s + Math.max(0, v - (before1[i] as number)), 0) / after1.length;
      sim.runUntil(at(5, 9));
      const before2 = sim.state.order.map((id) => sim.resident(id).rel[STEWARD]!.affinity);
      const oak = liveBuildings(sim.state).find((b) => b.type === 'oak')!;
      sim.remove(oak.x, oak.y);
      sim.runUntil(at(7, 9));
      const after2 = sim.state.order.map((id) => sim.resident(id).rel[STEWARD]!.affinity);
      down += after2.reduce((s, v, i) => s + Math.max(0, (before2[i] as number) - v), 0) / after2.length;
    }
    expect(down).toBeGreaterThanOrEqual(1.5 * up);
  });

  it('a lapsed proposal relieves its opponents and disappoints its supporters', { timeout: 300_000 }, () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      let closed: Extract<SimEvent, { type: 'dilemma_closed' }> | null = null;
      sim.on((e) => {
        if (e.type === 'dilemma_closed' && e.dilemma.status === 'lapsed' && !closed) closed = e;
      });
      sim.runUntil(at(21, 0));
      if (!closed) continue;
      const ev = closed as Extract<SimEvent, { type: 'dilemma_closed' }>;
      for (const rx of ev.reactions) {
        if (rx.who === ev.dilemma.proposer) continue;
        const score = stanceScore(sim.resident(rx.who), dilemmaDef(ev.dilemma.type));
        if (score > 0.3) expect(rx.valence, `${rx.who} backed it`).toBeLessThan(0);
        if (score < -0.3) expect(rx.valence, `${rx.who} opposed it`).toBeGreaterThanOrEqual(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('"you listen" is the stated reason in at most half of 20 days of "think of me" answers', { timeout: 300_000 }, () => {
    let answers = 0;
    let listens = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      sim.on((e) => {
        if (e.type !== 'talk' || e.answer.question !== 'me') return;
        answers++;
        if (e.answer.because?.aspect === 'listens_to_me') listens++;
      });
      for (let day = 2; day <= 21; day++) {
        sim.runUntil(at(day, 12));
        for (const id of sim.state.order) if (awake(sim, id)) sim.talk(id, 'me');
      }
    }
    expect(answers).toBeGreaterThan(100);
    expect(listens / answers).toBeLessThanOrEqual(0.5);
  });
});

describe('round 1, criterion 3: talking back', () => {
  it('sorry after felling a loved place weakens the grievance by a third and is retold', { timeout: 300_000 }, () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      const n = new Narrator(sim, { stewardIsYou: true });
      sim.runUntil(at(8, 9));
      const oak = liveBuildings(sim.state).find((b) => b.type === 'oak')!;
      sim.remove(oak.x, oak.y);
      sim.runUntil(at(10, 12));
      const id = sim.state.order.find((x) => awake(sim, x) && (sim.resident(x).beliefs[beliefKey(STEWARD, 'destroyed_place')] || sim.resident(x).traces[beliefKey(STEWARD, 'destroyed_place')]));
      if (!id) continue;
      const r = sim.resident(id);
      const k = beliefKey(STEWARD, 'destroyed_place');
      const before = r.beliefs[k]?.strength ?? Math.abs(r.traces[k]?.evidence ?? 0);
      const answer = sim.talk(id, 'me') as TalkAnswer;
      expect(answer.replies).toContain('sorry');
      const res = sim.reply(id, 'sorry');
      expect(res?.stance).toBe('forgiven');
      const after = r.beliefs[k]?.strength ?? Math.abs(r.traces[k]?.evidence ?? 0);
      expect(after).toBeLessThanOrEqual(before * (2 / 3) + 1e-9);
      // Retold later.
      sim.runUntil(at(12, 12));
      if (!awake(sim, id)) sim.runUntil(at(12, 15));
      const later = sim.talk(id, 'me') as TalkAnswer;
      const mem = later.memory;
      if (mem?.aspect === 'made_amends') expect(n.memoryLine(id, mem)).toMatch(/you and I made it up/);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('push back: a steady resident’s trust rises, an unsteady one’s affinity falls', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 12));
    const steady = sim.state.order.find((id) => awake(sim, id) && residentDef(id).traits.steady > 0)!;
    const touchy = sim.state.order.find((id) => awake(sim, id) && residentDef(id).traits.steady <= 0 && !['formal', 'plain'].includes(residentDef(id).voice.register))!;
    for (const [id, kind] of [[steady, 'respect'], [touchy, 'sulk']] as const) {
      const r = sim.resident(id);
      const t0 = r.rel[STEWARD]!.trust;
      const a0 = r.rel[STEWARD]!.affinity;
      sim.talk(id, 'me');
      const res = sim.reply(id, 'disagree');
      expect(res?.stance).toBe(kind);
      if (kind === 'respect') expect(r.rel[STEWARD]!.trust).toBeGreaterThan(t0);
      else expect(r.rel[STEWARD]!.affinity).toBeLessThan(a0);
    }
  });

  it('explain after a declined proposal: the grievance weakens only when they trust you', { timeout: 300_000 }, () => {
    let convinced = 0;
    let unconvinced = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      let proposer: string | null = null;
      let type: string | null = null;
      sim.on((e) => {
        if (e.type === 'dilemma_posted' && !proposer) {
          proposer = e.dilemma.proposer;
          type = e.dilemma.type;
        }
      });
      while (!proposer && sim.tick < at(14, 0)) sim.runUntil(sim.tick + 60);
      if (!proposer || !type) continue;
      sim.decide(sim.state.story.dilemmas.find((d) => d.type === type && d.status === 'open')!.id, 'decline');
      sim.runUntil(sim.tick + 1440 + 300);
      const id = proposer as string;
      if (!awake(sim, id)) sim.runUntil(sim.tick + 240);
      const r = sim.resident(id);
      const k = beliefKey(STEWARD, 'turned_me_down');
      const strength = () => r.beliefs[k]?.strength ?? Math.abs(r.traces[k]?.evidence ?? 0);
      const before = strength();
      const trusts = r.rel[STEWARD]!.trust > 0.4;
      const answer = sim.talk(id, 'me') as TalkAnswer;
      expect(answer.replies).toContain('explain');
      const res = sim.reply(id, 'explain');
      if (trusts) {
        expect(res?.stance).toBe('convinced');
        expect(strength()).toBeLessThan(before);
        convinced++;
      } else {
        expect(res?.stance).toBe('unconvinced');
        expect(strength()).toBeGreaterThanOrEqual(before);
        unconvinced++;
      }
    }
    expect(convinced + unconvinced).toBeGreaterThanOrEqual(3);
  });

  it('sorry is offered only with a grievance, explain only after a minded decision; one reply per answer; replays the same', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(1, 10));
    const r = sim.resident('ada');
    const a = sim.talk('ada', 'how') as TalkAnswer;
    expect(a.replies).toContain('agree');
    expect(a.replies).not.toContain('sorry');
    expect(a.replies).not.toContain('explain');
    expect(sim.reply('ada', 'sorry')).toBeNull();
    expect(sim.reply('ada', 'agree')?.stance).toBe('warm');
    expect(sim.reply('ada', 'agree')).toBeNull();
    expect(offersFor(r, a).map((o) => o.kind)).toEqual(a.replies);
    const play = () => {
      const s = runScenario('quiet', 2, 'none');
      s.schedule([
        { at: at(1, 10), kind: 'talk', who: 'bram', question: 'me' },
        { at: at(1, 10), kind: 'reply', who: 'bram', reply: 'disagree' },
        { at: at(3, 10), kind: 'talk', who: 'bram', question: 'me' },
        { at: at(3, 10), kind: 'reply', who: 'bram', reply: 'agree' },
      ]);
      const seen: string[] = [];
      s.on((e) => {
        if (e.type === 'reply') seen.push(`${e.who}:${e.reply}:${e.stance}`);
      });
      s.runUntil(at(4, 0));
      return seen.join(',') + '|' + s.resident('bram').rel[STEWARD]!.affinity.toFixed(4);
    };
    expect(play()).toBe(play());
    expect(play()).toMatch(/bram:disagree:(respect|sulk),bram:agree:warm/);
  });
});

describe('round 1, criterion 4: answers that aren’t stitched', () => {
  it('over 20 days of every question to everyone: no doubled dream, no bolted-on friend, no dislike in "think of me", no band contradictions, bios in first person, no tic twice a day', { timeout: 900_000 }, () => {
    const questions: TalkQuestion[] = ['how', 'mind', 'hope', 'me', 'opinion'];
    let answers = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const ticsToday = new Map<string, Set<string>>();
      sim.on((e) => {
        if (e.type !== 'talk') return;
        const text = n.lastReply?.text ?? '';
        answers++;
        const who = e.who;
        const a = e.answer;
        const title = a.hope?.title?.toLowerCase() ?? '';
        if (a.question === 'hope' && title.length > 8) expect(text.toLowerCase().split(title).length - 1, `${who}: ${text}`).toBeLessThanOrEqual(1);
        if (a.question === 'opinion' && !(a.about ?? '').startsWith('r:')) expect(text, `${who}: ${text}`).not.toMatch(/closest friend/);
        if (a.question === 'me') expect(text, `${who}: ${text}`).not.toMatch(/can't abide/);
        const grievance = a.topics?.some((t) => t.key === 'steward:-') || (a.memory?.subject === STEWARD && a.memory.valence < 0);
        const joy = a.topics?.some((t) => t.key === 'feel:joy');
        if (a.question === 'how' && (a.band === 'great' || a.band === 'good')) expect(grievance, `${who} ${a.band}: ${text}`).toBeFalsy();
        if (a.question === 'how' && (a.band === 'low' || a.band === 'bad')) expect(joy, `${who} ${a.band}: ${text}`).toBeFalsy();
        expect(text).not.toMatch(/let me tell you a little about myself\.?"?$/);
        if (/\b(my background|about myself)\b/i.test(text)) expect(text).toMatch(/\bI\b/);
        // Tics: at most once per resident per day.
        const key = `${who}|${Math.floor(e.t / 1440)}`;
        const set = ticsToday.get(key) ?? new Set<string>();
        for (const tic of residentDef(who).voice.tics) {
          const bare = tic.replace(/[^a-z' ]/gi, '').trim().toLowerCase();
          if (new RegExp(`(^|[.!?] )${bare.replace(/'/g, "'")}[,!.]`, 'i').test(text)) {
            expect(set.has(bare), `${who} repeats "${tic}" on day ${Math.floor(e.t / 1440) + 1}: ${text}`).toBe(false);
            set.add(bare);
          }
        }
        ticsToday.set(key, set);
      });
      for (let day = 2; day <= 21; day++) {
        sim.runUntil(at(day, 12));
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
  });
});
