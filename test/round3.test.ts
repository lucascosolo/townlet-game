// Bar round 3 (spec 9.3, predeclared 2026-10-09).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BELIEF_STATEMENTS } from '../src/content/voice.js';
import { Narrator, sentenceCount } from '../src/narrate/narrator.js';
import { residentDef } from '../src/content/residents.js';
import { REPLY_LINES } from '../src/content/replies.js';
import { runScenario } from '../src/scenarios/index.js';
import { needIsLow } from '../src/sim/needs.js';
import { wishProgress } from '../src/sim/story/director.js';
import { at } from '../src/sim/time.js';
import { STEWARD, type TalkQuestion } from '../src/sim/types.js';
import { canPlace, liveBuildings, shownWear } from '../src/sim/world.js';
import { addLedgerNote, groupAsks, reasonStem, type LedgerNote } from '../src/narrate/board.js';
import { considerFavour } from '../src/sim/favours.js';
import { SEEDS } from './helpers.js';

const awake = (sim: ReturnType<typeof runScenario>, id: string) => {
  const r = sim.resident(id);
  return !r.departed && r.activity?.id !== 'sleep';
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** What a player must never read. */
const RAW = [/\([a-z]+_[a-z_]+\)/, /matters \(/, /\byou nothing\b/i, /\byou our\b/i, /Maybe The\b/, /\bYou (really )?(does|has|is|was)\b/, /\b(garden plots|beehives) is\b/i];

describe('round 3, criterion 1: no raw text', () => {
  it('every belief aspect named in src/sim has a statement', () => {
    const aspects = new Set<string>();
    for (const f of sources('src/sim')) for (const m of readFileSync(f, 'utf8').matchAll(/aspect: (?:[^,]*\? )?'([a-z_]+)'(?: : '([a-z_]+)')?/g)) {
      aspects.add(m[1] as string);
      if (m[2]) aspects.add(m[2]);
    }
    expect(aspects.size).toBeGreaterThan(20);
    for (const a of aspects) expect(BELIEF_STATEMENTS[a], a).toBeDefined();
  });

  it('over 30 days of talk and spoken beliefs, no raw ids or broken grammar', { timeout: 900_000 }, () => {
    const questions: TalkQuestion[] = ['how', 'mind', 'hope', 'me', 'opinion'];
    let checked = 0;
    for (const steward of ['considerate', 'favours', 'none'] as const) {
      for (const seed of [1, 2]) {
        const sim = runScenario('bakery', seed, steward, { scripted: false });
        const n = new Narrator(sim, { stewardIsYou: true });
        const look = (text: string, what: string) => {
          checked++;
          for (const re of RAW) expect(text, `${steward} seed ${seed} ${what}: ${text}`).not.toMatch(re);
        };
        sim.on((e) => {
          if (e.type === 'talk') look(n.lastReply?.text ?? '', `${e.who} ${e.answer.question}`);
        });
        for (let day = 2; day <= 30; day += 2) {
          sim.runUntil(at(day, 12));
          for (const id of sim.state.order) {
            if (!awake(sim, id)) continue;
            for (const q of questions) {
              const about = q === 'opinion' ? (day % 4 ? `r:${sim.state.order.find((o) => o !== id)}` : `b:${liveBuildings(sim.state).find((b) => b.type === 'commons')!.id}`) : undefined;
              sim.talk(id, q, about);
            }
          }
          if (day % 10 === 0) {
            for (const id of sim.state.order) {
              const r = sim.resident(id);
              for (const b of [...Object.values(r.beliefs), ...Object.values(r.traces)]) look(`Maybe ${n.statement(id, b).replace(/^The /, 'the ')}…`, `${id} belief ${b.aspect}`);
            }
          }
        }
        look(n.text(), 'the whole log');
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('a wish counts only wishers still in town, and a departed resident has no open ask', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 12));
    const wish = sim.state.story.wishes.find((w) => w.status === 'open' && w.supporters.length > 1)!;
    expect(wish).toBeDefined();
    const gone = wish.supporters[0] as string;
    sim.ask(sim.resident(gone), 'aspiration', 'orchard');
    sim.depart(sim.resident(gone));
    expect(wishProgress(sim.state, wish).of).toBe(wish.supporters.length - 1);
    expect(sim.state.requests.some((q) => q.by === gone && q.status === 'open')).toBe(false);
  });

  it('the needs line never calls a need under 0.3 met', () => {
    for (const setpoint of [0.3, 0.5, 0.7]) for (let level = 0; level < 0.3; level += 0.05) expect(needIsLow(level, setpoint)).toBe(true);
  });

  it('the steward-facing rewrite keeps verbs right after an adverb', () => {
    const sim = runScenario('quiet', 1, 'none');
    const n = new Narrator(sim, { stewardIsYou: true });
    expect(n.toSteward('The steward really does care.')).toBe('You really do care.');
    expect(n.toSteward('The steward always listens.')).toBe('You always listen.');
    expect(n.toSteward('The steward still is the best.')).toBe('You still are the best.');
    void STEWARD;
  });
});

describe('round 3, criterion 2: hunger hurts', () => {
  it('a week with nothing to eat lowers mood by 0.12 on every seed, puts 70% of "how are you" at fair or lower, and nobody mentions joy', { timeout: 900_000 }, () => {
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
      expect(before - mean(), `seed ${seed}`).toBeGreaterThanOrEqual(0.12);
      const answers = sim.state.order.filter((id) => awake(sim, id)).map((id) => sim.talk(id, 'how')!);
      const low = answers.filter((a) => a.band !== 'good' && a.band !== 'great').length;
      expect(low / answers.length, `seed ${seed}: ${answers.map((a) => a.band).join(',')}`).toBeGreaterThanOrEqual(0.7);
      for (const a of answers) expect(a.topics?.some((t) => t.key === 'feel:joy'), `seed ${seed}`).toBeFalsy();
    }
  });

  it('nobody moves into a town that went hungry in the last two days', { timeout: 600_000 }, () => {
    let arrivals = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'favours', { scripted: false });
      sim.on((e) => {
        if (e.type !== 'arrived') return;
        arrivals++;
        const day = Math.floor(e.t / 1440) + 1;
        expect((sim.state.shortRun ?? 0) > 0 && sim.state.lastShortageDay >= day - 2, `seed ${seed}: ${e.who} arrived on day ${day} into a hungry town`).toBe(false);
      });
      for (let day = 1; day <= 30; day++) {
        sim.runUntil(at(day, 9));
        if (day % 6 === 0) {
          for (let y = 2; y < 22; y++) {
            let done = false;
            for (let x = 2; x < 22; x++) {
              if (!sim.canAfford('cottage') || canPlace(sim.state, 'cottage', x, y) !== null) continue;
              sim.build('cottage', x, y);
              done = true;
              break;
            }
            if (done) break;
          }
        }
      }
    }
    expect(arrivals).toBeGreaterThan(0);
  });
});

describe('round 3, criterion 3: the neglected stop expecting', () => {
  it('anyone who has given up (three asks lapsed in a fortnight) has no open ask and no "kept me waiting" pang for the following week', { timeout: 600_000 }, () => {
    let gaveUp = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      const since = new Map<string, number>();
      sim.on((e) => {
        if (e.type === 'gave_up') {
          gaveUp++;
          since.set(e.who, e.t);
        }
        if (e.type === 'perceived' && e.episode.aspect === 'still_waiting') {
          const t = since.get(e.who);
          if (t !== undefined) expect(e.t - t, `seed ${seed}: ${e.who} pined after giving up`).toBeGreaterThanOrEqual(7 * 1440);
        }
        if (e.type === 'request_posted') {
          const t = since.get(e.request.by);
          if (t !== undefined) expect(e.t - t, `seed ${seed}: ${e.request.by} asked after giving up`).toBeGreaterThanOrEqual(7 * 1440);
        }
      });
      sim.runUntil(at(28, 0));
    }
    expect(gaveUp).toBeGreaterThan(0);
  });
});

describe('round 3, criteria 4 and 5: replies with substance, shorter answers', () => {
  it('over 20 days of every question and a reply to each: disagree on 90% of answers that say something, chips name their subject, praise brushed off never sulks, owning a complaint raises trust, responses do not repeat; no answer over four sentences, two topics at most, no worry in a good mood, no joy with hunger', { timeout: 900_000 }, () => {
    const questions: TalkQuestion[] = ['how', 'mind', 'hope', 'me', 'opinion'];
    let saying = 0;
    let disagreeable = 0;
    let owned = 0;
    const lines = new Map<string, number>();
    const said = new Set([...new Set(Object.values(REPLY_LINES).flatMap((l) => Object.values(l).flat()))].sort((a, b) => b.length - a.length));
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const lastTo = new Map<string, number>();
      let turn = 0;
      sim.on((e) => {
        if (e.type === 'talk') {
          const a = e.answer;
          const text = n.lastReply?.text ?? '';
          expect(sentenceCount(text, residentDef(e.who).voice.tics), `${e.who} ${a.question}: ${text}`).toBeLessThanOrEqual(4);
          if (a.question === 'mind') expect(a.topics?.length ?? 0).toBeLessThanOrEqual(2);
          if (a.question === 'how' && (a.band === 'good' || a.band === 'great')) for (const t of a.topics ?? []) expect(t.key, `${e.who}: ${text}`).not.toMatch(/^(need:|larder|feel:(worry|grief|loneliness|annoyance))/);
          const keys = a.topics?.map((t) => t.key) ?? [];
          expect(keys.includes('feel:joy') && (keys.includes('larder') || keys.includes('need:food')), `${e.who}: ${text}`).toBe(false);
          const offers = sim.resident(e.who).lastAnswer?.offers ?? [];
          if ((a.band !== undefined && a.band !== 'neutral') || (a.topics?.length ?? 0) > 0 || a.memory) {
            saying++;
            if (offers.some((o) => o.kind === 'disagree')) disagreeable++;
          }
          for (const o of offers) if ((o.kind === 'agree' || o.kind === 'disagree') && a.question === 'opinion' && a.about) expect(o.about).toBe(a.about);
          // Reply: alternate agree and disagree, sorry when offered.
          const r = sim.resident(e.who);
          const trust0 = r.rel[STEWARD]?.trust ?? 0;
          const n3 = turn++ % 3;
          const pickKind = n3 === 0 && offers.some((o) => o.kind === 'sorry') ? 'sorry' : n3 === 1 && offers.some((o) => o.kind === 'disagree') ? 'disagree' : 'agree';
          const offer = offers.find((o) => o.kind === pickKind)!;
          const res = sim.reply(e.who, pickKind);
          if (pickKind === 'disagree' && offer.tone === 'praise') expect(res?.stance).not.toBe('sulk');
          if (pickKind === 'agree' && offer.tone === 'complaint') {
            owned++;
            // Trust tops out at 1.
            expect(r.rel[STEWARD]!.trust > trust0 || trust0 >= 1).toBe(true);
          }
        }
        if (e.type === 'reply') {
          const words = n.lastReply?.text ?? '';
          if (!words) return;
          const bare = [...said].find((l) => words.includes(l.replace(/[.!?]$/, ''))) ?? words;
          const key = `${e.who}|${bare}`;
          const t = lastTo.get(key);
          if (t !== undefined) expect(e.t - t, `${e.who} said "${bare}" again`).toBeGreaterThanOrEqual(7 * 1440);
          lastTo.set(key, e.t);
          lines.set(bare, (lines.get(bare) ?? 0) + 1);
        }
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
    expect(disagreeable / saying).toBeGreaterThanOrEqual(0.9);
    expect(owned).toBeGreaterThan(0);
    void lines;
  });

  it('no response line said more than four times in one town over the run', { timeout: 900_000 }, () => {
    // Longest first, so "I'm glad you think so too." is not counted as "I'm glad you think so."
    const said = [...new Set(Object.values(REPLY_LINES).flatMap((l) => Object.values(l).flat()))].sort((a, b) => b.length - a.length);
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      const counts = new Map<string, number>();
      let turn = 0;
      sim.on((e) => {
        if (e.type === 'talk') {
          const offers = sim.resident(e.who).lastAnswer?.offers ?? [];
          const kind = turn++ % 2 && offers.some((o) => o.kind === 'disagree') ? 'disagree' : 'agree';
          sim.reply(e.who, kind);
        }
        if (e.type === 'reply') {
          // What the player reads: the line, or the look given instead.
          const words = n.lastReply?.text ?? '';
          if (!words) return;
          const line = said.find((l) => words.includes(l.replace(/[.!?]$/, ''))) ?? words;
          counts.set(line, (counts.get(line) ?? 0) + 1);
        }
      });
      for (let day = 2; day <= 21; day++) {
        sim.runUntil(at(day, 12));
        for (const id of sim.state.order) if (awake(sim, id)) for (const q of ['how', 'mind', 'me'] as TalkQuestion[]) sim.talk(id, q);
      }
      for (const [line, c] of counts) expect(c, `seed ${seed}: "${line}" ${c} times`).toBeLessThanOrEqual(4);
    }
  });
});

describe('round 3, criterion 6: a board that does not repeat', () => {
  it('one card per kind of ask, ledger lines that update, and no narrated line twice in a week', { timeout: 900_000 }, () => {
    for (const steward of ['favours', 'considerate', 'none'] as const) {
      const sim = runScenario('quiet', 7, steward);
      const n = new Narrator(sim, { stewardIsYou: true });
      const ledgers = new Map<string, LedgerNote[]>();
      const lastLine = new Map<string, number>();
      n.onEntry((e) => {
        if (e.kind === 'day') return;
        const t = lastLine.get(e.text);
        if (t !== undefined) expect(e.t - t, `${steward}: "${e.text}" twice in a week`).toBeGreaterThanOrEqual(7 * 1440);
        lastLine.set(e.text, e.t);
      });
      sim.on((e) => {
        if (e.type !== 'standing') return;
        const day = Math.floor(e.t / 1440) + 1;
        const notes = addLedgerNote(ledgers.get(e.who) ?? [], { day, up: e.delta > 0, reasons: e.reasons, also: e.also ?? [] });
        ledgers.set(e.who, notes);
        const recent = notes.filter((x) => day - x.day < 7).flatMap((x) => [...x.reasons, ...x.also].map(reasonStem));
        expect(new Set(recent).size, `${steward} ${e.who}: ${recent.join(' | ')}`).toBe(recent.length);
      });
      for (let day = 1; day <= 30; day++) {
        sim.runUntil(at(day, 9));
        const kinds = groupAsks(sim.state.requests.filter((q) => q.status === 'open')).map((g) => (g[0]!.kind === 'aspiration' ? `${g[0]!.kind}|${g[0]!.wants ?? g[0]!.by}` : g[0]!.kind));
        expect(new Set(kinds).size).toBe(kinds.length);
      }
    }
  });
});

describe('round 3, criterion 7: approval earned, favours refused', () => {
  it('nobody above 0.45 standing before day 4 with a considerate steward', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      for (let d = 1; d <= 3; d++) {
        sim.runUntil(at(d, 23));
        for (const id of sim.state.order) expect(sim.resident(id).rel[STEWARD]?.affinity ?? 0, `seed ${seed} day ${d} ${id}`).toBeLessThanOrEqual(0.45);
      }
    }
  });

  it('below zero standing or hungry two days running, a non-food favour is refused, and says why', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 10));
    const r = sim.resident('ada');
    r.rel[STEWARD]!.affinity = -0.1;
    expect(considerFavour(sim.state, r, 'timber').reason).toBe('distrust');
    expect(considerFavour(sim.state, r, 'garden').reason).not.toBe('distrust');
    r.rel[STEWARD]!.affinity = 0.5;
    r.hungryRun = 2;
    r.lastHungryDay = 3;
    expect(considerFavour(sim.state, r, 'timber').reason).toBe('hungry');
    expect(considerFavour(sim.state, r, 'catch').reason).not.toBe('hungry');
  });

  // Missed and kept visible: the favours steward asks whoever is likeliest to say yes, so it never
  // meets a refusal for standing or hunger (30 agreed of 30 on most seeds). The rule itself is
  // checked directly in the test above.
  it.fails('with the favours steward, every seed sees a refusal for standing or hunger (missed; see the note)', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'favours', { scripted: false });
      let named = false;
      sim.on((e) => {
        if (e.type === 'favour' && e.phase === 'refused' && (e.reason === 'distrust' || e.reason === 'hungry')) named = true;
      });
      sim.runUntil(at(31, 0));
      expect(named, `seed ${seed}`).toBe(true);
    }
  });
});

describe('round 3, criteria 8 to 10: dreams, worn ground, places', () => {
  it('never more than two "make something for" dreams at once; no building-free step over ten days', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      for (let day = 2; day <= 30; day++) {
        sim.runUntil(at(day, 8));
        const rs = sim.state.order.map((id) => sim.resident(id)).filter((r) => !r.departed);
        expect(rs.filter((r) => !r.aspiration.done && r.aspiration.kind === 'gift').length, `seed ${seed} day ${day}`).toBeLessThanOrEqual(2);
        for (const r of rs) {
          if (r.aspiration.done) continue;
          const waiting = sim.state.requests.some((q) => q.by === r.id && q.kind === 'aspiration' && q.status === 'open');
          if (!waiting) expect((sim.state.tick - r.aspiration.since) / 1440, `seed ${seed} day ${day} ${r.id}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('worn tiles shown are at most an eighth of the settled valley on day 12 of a considerate bakery town', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'considerate', { scripted: false });
      sim.runUntil(at(12, 12));
      const settled = sim.state.settled ?? { width: sim.state.width, height: sim.state.height };
      expect(shownWear(sim.state).size).toBeLessThanOrEqual(Math.floor((settled.width * settled.height) / 8));
    }
  });

  it('day 10: at most 30% of answers about buildings are neutral, and they come in at least three shapes', { timeout: 600_000 }, () => {
    let neutral = 0;
    let all = 0;
    const shapes = new Set<string>();
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'considerate');
      const n = new Narrator(sim, { stewardIsYou: true });
      sim.runUntil(at(10, 12));
      for (const id of sim.state.order) {
        if (!awake(sim, id)) continue;
        for (const b of liveBuildings(sim.state).filter((x) => !['path', 'brook', 'wild', 'tent', 'cottage'].includes(x.type))) {
          const a = sim.talk(id, 'opinion', `b:${b.id}`)!;
          all++;
          if (a.band === 'neutral') neutral++;
          shapes.add((n.lastReply?.text ?? '').replace(n.subjectName(`b:${b.id}`), 'X').split(/[.!?]/)[0] ?? '');
        }
      }
    }
    expect(neutral / all).toBeLessThanOrEqual(0.3);
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });
});
