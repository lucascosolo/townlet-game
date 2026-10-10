// Audit 2026-10-10: criteria from earlier rounds that were declared but never tested. Each test
// names the round and criterion it covers.
import { describe, expect, it } from 'vitest';
import { residentDef } from '../src/content/residents.js';
import { MIND_LINES } from '../src/content/thoughts.js';
import { ledgerLine, townWorries } from '../src/narrate/board.js';
import { importanceOf, Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { STEWARD } from '../src/sim/types.js';
import { DILEMMAS } from '../src/sim/story/dilemmas.js';
import { at, dayOf } from '../src/sim/time.js';
import { SEEDS } from './helpers.js';

const STEWARDS = ['considerate', 'favours', 'none'] as const;

describe('criteria with no test until the audit of 2026-10-10', () => {
  it('round 2, criterion 7: every thought key has at least five lines in each register it has', () => {
    for (const [key, lines] of Object.entries(MIND_LINES)) {
      for (const [register, list] of Object.entries(lines)) {
        if (!list || list.length === 0) continue;
        expect(list.length, `${key} ${register}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('round 2, criterion 4: at least eight kinds of proposal exist', () => {
    expect(new Set(DILEMMAS.map((d) => d.type)).size).toBeGreaterThanOrEqual(8);
  });

  it('round 2, criterion 3: anyone who leaves was thinking of leaving, said as a major line, at least three days before', { timeout: 1_800_000 }, () => {
    let departures = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('bakery', seed, 'none', { scripted: false });
      const thinking = new Map<string, number>();
      sim.on((e) => {
        if (e.type === 'thinking_of_leaving' && !thinking.has(e.who)) {
          thinking.set(e.who, e.t);
          expect(importanceOf(e)).toBe('major');
        }
        if (e.type === 'left_town') {
          departures++;
          const since = thinking.get(e.who);
          expect(since, `seed ${seed}: ${e.who} left on day ${dayOf(e.t)} without thinking of it`).toBeDefined();
          expect(e.t - since!, `seed ${seed}: ${e.who}`).toBeGreaterThanOrEqual(3 * 1440);
        }
      });
      sim.runUntil(at(60, 0));
    }
    expect(departures).toBeGreaterThan(0);
  });

  it('round 4, criterion 3: no board worry or season wish names someone after the morning after they left', { timeout: 1_800_000 }, () => {
    let checked = 0;
    for (const steward of ['none', 'considerate'] as const) {
      for (const seed of SEEDS) {
        const sim = runScenario('quiet', seed, steward);
        const left = new Map<string, number>();
        sim.on((e) => {
          if (e.type === 'left_town') left.set(e.who, e.t);
        });
        for (let day = 2; day <= 30; day++) {
          sim.runUntil(at(day, 9));
          for (const [who, t] of left) {
            if (dayOf(sim.state.tick) <= dayOf(t) + 1) continue;
            checked++;
            const name = residentDef(who).name;
            for (const line of townWorries(sim.state)) expect(line, `${steward} seed ${seed} day ${day}`).not.toContain(name);
            for (const w of sim.state.story.wishes) expect(w.supporters, `${steward} seed ${seed} day ${day}: ${w.label}`).not.toContain(who);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rounds 5 and 6, You tab: no line about you says "the steward" or him, her, them, his, their', { timeout: 1_800_000 }, () => {
    let lines = 0;
    for (const scenario of ['quiet', 'bakery']) {
      for (const steward of STEWARDS) {
        for (const seed of [1, 2]) {
          const sim = runScenario(scenario, seed, steward);
          const n = new Narrator(sim, { stewardIsYou: true });
          const notes: string[] = [];
          sim.on((e) => {
            if (e.type === 'standing') notes.push(ledgerLine({ day: dayOf(e.t), up: e.delta > 0, reasons: e.reasons, also: e.also ?? [] }));
          });
          sim.runUntil(at(30, 20));
          const tag = `${scenario} ${steward} seed ${seed}`;
          for (const id of sim.state.order) {
            const r = sim.resident(id);
            if (r.departed) continue;
            for (const b of Object.values(r.beliefs)) {
              if (b.subject !== STEWARD) continue;
              const said = n.toSteward(n.statement(id, b));
              lines++;
              expect(said, tag).not.toMatch(/\bthe steward\b/i);
              expect(said, tag).not.toMatch(/\b(him|her|them|his|their)\b/i);
            }
          }
          for (const note of notes) {
            const said = n.toSteward(note);
            lines++;
            expect(said, tag).not.toMatch(/\bthe steward\b/i);
            expect(said, tag).not.toMatch(/\b(him|her|them|his|their)\b/i);
          }
        }
      }
    }
    expect(lines).toBeGreaterThan(50);
  });
});
