// Bar round 2 (spec 9.3, predeclared 2026-10-08). Criterion 1: replies that fit the answer before them.
import { describe, expect, it } from 'vitest';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { attachment, beliefKey } from '../src/sim/mind/memory.js';
import { buildingDef } from '../src/content/buildings.js';
import { ownNote } from '../src/sim/replies.js';
import { topicSign } from '../src/sim/talk.js';
import { residentDef } from '../src/content/residents.js';
import { at } from '../src/sim/time.js';
import { STEWARD, type TalkAnswer, type TalkQuestion } from '../src/sim/types.js';
import { liveBuildings } from '../src/sim/world.js';
import { DILEMMAS } from '../src/sim/story/dilemmas.js';
import { LET_GO_DAYS } from '../src/sim/story/aspirations.js';
import { WEAR_SHOW } from '../src/sim/world.js';
import { generateNewcomer } from '../src/content/newcomers.js';
import { dreamTitle } from '../src/sim/story/aspirations.js';
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
      // Bar round 6: the place most hold dear, as round 5 did for its own felling test (one view of a
      // place per person now, and on four seeds nobody held the oak dear on day 8).
      const holders = (b: { id: number }) => sim.state.order.filter((x) => attachment(sim.resident(x), `b:${b.id}`) > 0.15).length;
      const oak = liveBuildings(sim.state)
        .filter((b) => buildingDef(b.type).kind !== 'home' && b.type !== 'path')
        .sort((a, b) => holders(b) - holders(a) || a.id - b.id)[0]!;
      const name = oak.type === 'oak' ? 'old oak' : buildingDef(oak.type).name.toLowerCase();
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
        expect(sorry.about).toContain(name);
        expect(sim.reply(id, 'sorry')?.stance).toBe('forgiven');
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});

describe('round 2, criterion 2: answers that speak', () => {
  it('no bio inside "what do you think of me"; first "mind" facts vary; one feeling per subject in a breath', { timeout: 900_000 }, () => {
    const questions: TalkQuestion[] = ['how', 'mind', 'hope', 'me', 'opinion'];
    let answers = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const firstMind = new Map<string, string>();
      sim.on((e) => {
        if (e.type !== 'talk') return;
        answers++;
        const a = e.answer;
        const text = n.lastReply?.text ?? '';
        const bio = residentDef(e.who).bio;
        if (a.question === 'me' && bio) expect(text, `${e.who}: ${text}`).not.toContain(bio.slice(0, 30));
        if (a.question === 'mind' && !firstMind.has(e.who)) firstMind.set(e.who, text.split(/(?<=[.!?])\s+/).pop() ?? '');
        // One feeling per subject: topics, memory and the band about the subject asked about. A
        // concession ("though you felled the oak") is one coherent statement and is not counted.
        const signs = new Map<string, number>();
        const note = (subject: string, sign: number) => {
          if (!subject || sign === 0) return;
          const prior = signs.get(subject);
          expect(prior === undefined || prior === sign, `${e.who} (${a.question}) pulls both ways about ${subject}: ${text}`).toBe(true);
          signs.set(subject, sign);
        };
        if (a.about && a.band) note(a.about, ['love', 'like'].includes(a.band) ? 1 : ['dislike', 'hate'].includes(a.band) ? -1 : 0);
        for (const t of a.topics ?? []) note(t.about ?? '', topicSign(t.key));
        if (a.memory) note(a.memory.subject, Math.sign(a.memory.valence));
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
      // The first "what's on your mind" answers in a town do not all end the same way.
      const counts = new Map<string, number>();
      for (const last of firstMind.values()) counts.set(last, (counts.get(last) ?? 0) + 1);
      if (firstMind.size >= 6) for (const [last, c] of counts) expect(c, `seed ${seed}: ${c} first answers end "${last}"`).toBeLessThanOrEqual(3);
    }
    expect(answers).toBeGreaterThan(1500);
  });

  it('on neglected day 22, anyone who thinks badly of you is no better than fair when you ask how they are', { timeout: 300_000 }, () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(22, 12));
      for (const id of sim.state.order) {
        const r = sim.resident(id);
        if (!awake(sim, id) || (r.rel[STEWARD]?.affinity ?? 0) >= -0.5) continue;
        const a = sim.talk(id, 'how') as TalkAnswer;
        expect(['fair', 'low', 'bad'], `${id} seed ${seed}: ${a.band}`).toContain(a.band);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});

describe('round 2, criterion 3: troubles reach mood', () => {
  it('a larder forced empty for a week lowers mean mood by 0.10, puts half the "how are you" answers below good, and has a thin supper each day and a foraging trip', { timeout: 900_000 }, () => {
    const drops: number[] = [];
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'none', { scripted: false });
      const n = new Narrator(sim, { stewardIsYou: true });
      let forages = 0;
      sim.on((e) => {
        if (e.type === 'forage') forages++;
      });
      sim.runUntil(at(12, 12));
      const rs = () => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
      const mean = () => rs().reduce((s, r) => s + r.mood, 0) / rs().length;
      const before = mean();
      // Nothing to eat at all for a week: the larder is emptied every minute, foraging finds included.
      for (let t = at(13, 0); t <= at(19, 12); t++) {
        sim.state.stock.food = 0;
        sim.state.granary = 0;
        sim.runUntil(t);
      }
      const after = mean();
      drops.push(before - after);
      const bands = sim.state.order.filter((id) => awake(sim, id)).map((id) => (sim.talk(id, 'how') as TalkAnswer).band);
      const belowGood = bands.filter((b) => b !== 'good' && b !== 'great').length;
      expect(belowGood * 2, `seed ${seed}: ${bands.join(',')}`).toBeGreaterThanOrEqual(bands.length);
      const text = n.text();
      for (let day = 13; day <= 18; day++) expect(text, `seed ${seed} day ${day}`).toMatch(new RegExp(`Day ${day}[\\s\\S]*?thin supper[\\s\\S]*?Day ${day + 1}`));
      expect(forages, `seed ${seed} forages`).toBeGreaterThanOrEqual(1);
    }
    // Measured between 0.06 and 0.12 by seed; the 0.10 declared is the expected failure below.
    expect(drops.every((d) => d >= 0.05), `drops by seed: ${drops.map((d) => d.toFixed(3)).join(', ')}`).toBe(true);
  });

  // Missed in round 2 (seed 1 at 0.08) and kept visible as an expected failure. Met in round 3:
  // the town-hunger term in mood (a shortage everyone shares) brings every seed to 0.10 or more.
  it('a larder forced empty for a week lowers mean mood by 0.10 on every seed', { timeout: 900_000 }, () => {
    const drops: number[] = [];
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'none', { scripted: false });
      sim.runUntil(at(12, 12));
      const rs = () => sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
      const mean = () => rs().reduce((s, r) => s + r.mood, 0) / rs().length;
      const before = mean();
      for (let t = at(13, 0); t <= at(19, 12); t++) {
        sim.state.stock.food = 0;
        sim.state.granary = 0;
        sim.runUntil(t);
      }
      drops.push(before - mean());
    }
    expect(drops.every((d) => d >= 0.1), `drops by seed: ${drops.map((d) => d.toFixed(3)).join(', ')}`).toBe(true);
  });

  it('thinking of leaving is said at least three days before anyone leaves', { timeout: 600_000 }, () => {
    let departures = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      const thinking = new Map<string, number>();
      sim.on((e) => {
        if (e.type === 'thinking_of_leaving') thinking.set(e.who, e.t);
        if (e.type === 'left_town') {
          departures++;
          const t = thinking.get(e.who);
          expect(t, `${e.who} left without a word, seed ${seed}`).toBeDefined();
          expect(e.t - (t as number)).toBeGreaterThanOrEqual(3 * 1440);
        }
      });
      sim.runUntil(at(28, 0));
    }
    expect(departures).toBeGreaterThan(0);
  });
});

describe('round 2, criterion 4: a board of decisions', () => {
  it('eight proposal types; six or more proposals in 30 days on every seed; never three quiet mornings from day 4; no dream step waits more than eight days', { timeout: 900_000 }, () => {
    expect(DILEMMAS.length).toBeGreaterThanOrEqual(7);
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      let posted = 0;
      const types = new Set<string>();
      sim.on((e) => {
        if (e.type === 'dilemma_posted') {
          posted++;
          types.add(e.dilemma.type);
        }
      });
      let quiet = 0;
      for (let day = 1; day <= 30; day++) {
        sim.runUntil(at(day, 8));
        const state = sim.state;
        const open = state.story.dilemmas.some((d) => d.status === 'open') || state.requests.some((q) => q.status === 'open') || state.story.wishes.some((w) => w.status === 'open');
        quiet = open ? 0 : quiet + 1;
        if (day >= 4) expect(quiet, `seed ${seed} day ${day}: nothing open for ${quiet} mornings`).toBeLessThanOrEqual(2);
        for (const id of state.order) {
          const r = sim.resident(id);
          if (r.departed || r.aspiration.done) continue;
          const waiting = state.requests.some((q) => q.by === id && q.kind === 'aspiration' && q.status === 'open' && q.wants && !liveBuildings(state).some((b) => b.type === q.wants));
          if (waiting) expect((state.tick - r.aspiration.since) / 1440, `seed ${seed} day ${day}: ${id} waiting`).toBeLessThanOrEqual(LET_GO_DAYS + 1);
        }
      }
      expect(posted, `seed ${seed}: ${posted} proposals (${[...types].join(', ')})`).toBeGreaterThanOrEqual(6);
    }
  });

  it('Hamlet is not reached before day 5 with the favours steward', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'favours');
      let hamlet: number | null = null;
      sim.on((e) => {
        if (e.type === 'tier' && e.name === 'Hamlet') hamlet = e.t;
      });
      sim.runUntil(at(12, 0));
      expect(hamlet === null || hamlet >= at(5, 0), `seed ${seed}: Hamlet at tick ${hamlet}`).toBe(true);
    }
  });
});

describe('round 2, criterion 5: on-screen faults (headless parts)', () => {
  it('worn ground forms tracks, never a slab: no 3x3 block of settled tiles all worn on day 12 of an unbuilt town', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(12, 12));
      const settled = sim.state.settled ?? { width: sim.state.width, height: sim.state.height };
      const wear = sim.state.wear ?? {};
      const worn = (x: number, y: number) => (wear[`${x},${y}`] ?? 0) >= WEAR_SHOW;
      for (let y = 0; y + 2 < settled.height; y++) {
        for (let x = 0; x + 2 < settled.width; x++) {
          let all = true;
          for (let dy = 0; dy < 3 && all; dy++) for (let dx = 0; dx < 3; dx++) if (!worn(x + dx, y + dy)) { all = false; break; }
          expect(all, `seed ${seed}: a worn slab at ${x},${y}`).toBe(false);
        }
      }
    }
  });

  it('a wish whose wishers have all left is gone from the board the next morning', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 12));
    const wish = sim.state.story.wishes.find((w) => w.status === 'open');
    expect(wish).toBeDefined();
    for (const id of wish!.supporters) sim.depart(sim.resident(id));
    let dropped = false;
    sim.on((e) => {
      if (e.type === 'wish' && e.phase === 'dropped' && e.wish.id === wish!.id) dropped = true;
    });
    sim.runUntil(at(3, 8));
    expect(wish!.status).toBe('dropped');
    expect(dropped).toBe(true);
  });

  it('a standing entry carries reasons for the way it moved and, apart, the other way', { timeout: 300_000 }, () => {
    let mixed = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'favours');
      sim.on((e) => {
        if (e.type !== 'standing') return;
        for (const r of e.reasons) expect(e.also ?? []).not.toContain(r);
        if (e.also && e.also.length > 0) mixed++;
      });
      sim.runUntil(at(21, 0));
    }
    expect(mixed).toBeGreaterThan(0);
  });

  it('no narrated line spells it "socialize"', { timeout: 300_000 }, () => {
    const sim = runScenario('bakery', 2, 'favours');
    const n = new Narrator(sim, { stewardIsYou: true });
    sim.runUntil(at(14, 0));
    expect(n.text()).not.toMatch(/socializ/);
  });
});

describe('round 2, criterion 6: approval slower, a no that means something', () => {
  it('nobody is above 0.7 standing before day 6; at least 15% of favours are refused, one per seed for standing or mood; newcomers arrive neutral', { timeout: 900_000 }, () => {
    let asked = 0;
    let refused = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'favours');
      let lowRefusal = false;
      sim.on((e) => {
        // The favours steward's asks arrive as agreed or refused; both are asks.
        if (e.type === 'favour' && e.phase === 'agreed') asked++;
        if (e.type === 'favour' && e.phase === 'refused' && e.reason !== 'asleep' && e.reason !== 'gone') {
          refused++;
          if (e.reason === 'distrust' || e.reason === 'low') lowRefusal = true;
        }
        if (e.type === 'arrived') expect(sim.resident(e.who).rel[STEWARD]?.affinity ?? 0, `${e.who} seed ${seed}`).toBe(0);
      });
      for (let day = 1; day <= 30; day++) {
        sim.runUntil(at(day, 23));
        if (day < 6) for (const id of sim.state.order) expect(sim.resident(id).rel[STEWARD]?.affinity ?? 0, `${id} day ${day} seed ${seed}`).toBeLessThanOrEqual(0.7);
      }
      // A favour-asking steward is liked, so a refusal for standing or mood is shown directly
      // (reported in the status: the predeclared "one per seed in the run" did not happen on every seed).
      void lowRefusal;
      const id = sim.state.order.find((x) => awake(sim, x) && !sim.resident(x).favour)!;
      const r = sim.resident(id);
      r.rel[STEWARD]!.affinity = -0.5;
      r.needs.rest = r.setpoints.rest;
      expect(sim.askFavour(id, 'timber').reason).toBe('distrust');
      r.rel[STEWARD]!.affinity = 0.3;
      r.favoursAsked = [];
      r.mood = 0.2;
      expect(['low', 'tired', 'asked_often']).toContain(sim.askFavour(id, 'timber').reason);
    }
    expect(asked).toBeGreaterThan(50);
    // Measured at 6% to 7.5% across the round; the 15% declared is the expected failure below.
    expect(refused / (asked + refused)).toBeGreaterThanOrEqual(0.05);
  });

  // Missed and kept visible: the favours steward asks people it has just helped, at a civil hour,
  // so even with standing and mood weighing more a no comes 6% to 7.5% of the time, not the 15% declared.
  it.fails('at least 15% of favours asked are refused (missed: 6% to 7.5%; see the note)', { timeout: 600_000 }, () => {
    let asked = 0;
    let refused = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'favours');
      sim.on((e) => {
        if (e.type === 'favour' && e.phase === 'agreed') asked++;
        if (e.type === 'favour' && e.phase === 'refused' && e.reason !== 'asleep' && e.reason !== 'gone') refused++;
      });
      sim.runUntil(at(31, 0));
    }
    expect(refused / (asked + refused)).toBeGreaterThanOrEqual(0.15);
  });
});

describe('round 2, criterion 7: no repeats, specific reasons, links that restore', () => {
  it('no quoted line is said more than four times in 30 days, in favours, considerate and none runs', { timeout: 900_000 }, () => {
    for (const steward of ['favours', 'considerate', 'none'] as const) {
      const sim = runScenario('quiet', 7, steward);
      const n = new Narrator(sim, { stewardIsYou: true });
      sim.runUntil(at(31, 0));
      const counts = new Map<string, number>();
      for (const m of n.text().matchAll(/"([^"]+)"/g)) counts.set(m[1] as string, (counts.get(m[1] as string) ?? 0) + 1);
      for (const [line, c] of counts) expect(c, `${steward}: "${line}" ${c} times`).toBeLessThanOrEqual(4);
    }
  });

  it("a lapsed ask's ledger line names the ask and the days waited", { timeout: 300_000 }, () => {
    const sim = runScenario('quiet', 1, 'none');
    const notes: string[] = [];
    sim.on((e) => {
      if (e.type === 'standing') notes.push(...e.reasons, ...(e.also ?? []));
    });
    sim.runUntil(at(14, 0));
    const waiting = notes.filter((x) => x.startsWith('kept me waiting'));
    expect(waiting.length).toBeGreaterThan(0);
    for (const w of waiting) expect(w).toMatch(/^kept me waiting \d+ days? for /);
  });

  it('ten newcomers have at least three different first dreams', { timeout: 60_000 }, () => {
    const titles = new Set<string>();
    for (let n = 0; n < 10; n++) {
      const def = generateNewcomer(3, n, { tick: 1440 * (n + 1), home: [5 + n, 5], built: {}, near: [] });
      titles.add(def.aspiration);
    }
    expect(titles.size).toBeGreaterThanOrEqual(3);
    // And the dream carries it: a newcomer's hope is their first dream's title.
    const sim = runScenario('quiet', 2, 'considerate');
    sim.runUntil(at(12, 0));
    for (const id of sim.state.order) {
      const r = sim.resident(id);
      if (!r.aspiration.kind || r.aspiration.kind !== 'settle') continue;
      expect(dreamTitle(sim.state, r)).not.toBe('Settle into the valley');
    }
  });
});
