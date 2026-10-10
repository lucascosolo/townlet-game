// Regression tests for the defects found in the audit of 2026-10-10 (the last two days of rounds,
// e247e13 onwards). Each test is one defect, named after what went wrong.
import { describe, expect, it } from 'vitest';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario, scenario } from '../src/scenarios/index.js';
import { assess } from '../src/sim/asks.js';
import { progressOf } from '../src/sim/progress.js';
import { applyReply } from '../src/sim/replies.js';
import { Simulation } from '../src/sim/sim.js';
import { currentStage } from '../src/sim/story/aspirations.js';
import { at, dayOf, TICKS_PER_DAY } from '../src/sim/time.js';
import { STEWARD } from '../src/sim/types.js';
import { canPlace, liveBuildings } from '../src/sim/world.js';

describe('audit 2026-10-10', { timeout: 300_000 }, () => {
  it('two removes of the same building in one tick (a double click) are not an error, and the save replays', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 10));
    const b = liveBuildings(sim.state).find((x) => x.type === 'bench' || x.type === 'flowerbed' || x.type === 'hedge' || x.type === 'oak')!;
    const cmds = [
      { at: sim.state.tick, kind: 'remove' as const, x: b.x, y: b.y },
      { at: sim.state.tick, kind: 'remove' as const, x: b.x, y: b.y },
    ];
    sim.schedule(cmds as never);
    expect(() => sim.runUntil(at(2, 12))).not.toThrow();
    expect(sim.state.buildings.find((x) => x.id === b.id)!.removed).toBe(true);
  });

  it('a starving resident sent foraging comes back with food', () => {
    const sim = Simulation.fromScenario({ ...scenario('bakery'), commands: [] }, 7);
    sim.runUntil(at(2, 8, 50));
    const r = sim.resident('ada');
    r.needs.food = 0.1;
    let done = false;
    sim.on((e) => {
      if (e.type === 'forage' && e.who === 'ada') done = true;
    });
    for (let i = 0; i < 6 * 60 && !done; i++) {
      sim.state.stock.food = 0;
      sim.state.granary = 0;
      sim.step();
    }
    expect(done).toBe(true);
  });

  it('a dream step that is the steward\'s gift is never thanked for when nothing was built', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(8, 6));
    const r = sim.resident('ada');
    r.gaveUpUntil = sim.state.tick + 7 * TICKS_PER_DAY;
    for (const q of sim.state.requests) if (q.by === 'ada' && q.status === 'open') q.status = 'resolved';
    sim.runUntil(at(30, 7));
    const thanked = [...r.buffer, ...r.episodes].filter((e) => e.aspect === 'granted_wish' && /orchard/.test(e.note));
    const orchard = sim.state.buildings.some((b) => b.type === 'orchard' && !b.removed);
    if (!orchard) expect(thanked).toEqual([]);
  });

  it('a dream whose place is taken away is let go, not waited on for weeks', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 12));
    const r = sim.resident('fen');
    const jetty = sim.state.buildings.find((b) => b.type === 'jetty' && !b.removed)!;
    r.aspiration = { ...r.aspiration, stage: 1, since: sim.state.tick, minutes: 0, done: false, partner: 'juniper' };
    sim.remove(jetty.x, jetty.y);
    sim.runUntil(at(14, 7));
    expect(r.aspiration.done || currentStage(sim.state, r)?.place !== 'jetty').toBe(true);
  });

  it('Ada with no friend left does not crash on her first step', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 12));
    const r = sim.resident('ada');
    r.aspiration = { ...r.aspiration, stage: 0, since: sim.state.tick, minutes: 0, done: false };
    for (const x of Object.values(r.rel)) {
      x.tags = x.tags.filter((t) => t !== 'friend');
      x.affinity = Math.min(x.affinity, 0.1);
    }
    expect(() => sim.runUntil(at(9, 7))).not.toThrow();
    expect(Object.keys(r.rel)).not.toContain('undefined');
  });

  it('a sorry chip never names "telling the steward about it"', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 10));
    const oak = liveBuildings(sim.state).find((b) => b.type === 'oak') ?? liveBuildings(sim.state).find((b) => b.type === 'bench')!;
    sim.remove(oak.x, oak.y);
    let offered = 0;
    for (let d = 2; d < 8; d++) {
      for (let h = 9; h < 19; h += 3) {
        sim.runUntil(at(d, h));
        for (const id of sim.state.order) {
          const r = sim.resident(id);
          if (!sim.talk(id, 'me')) continue;
          const sorry = r.lastAnswer?.offers.find((o) => o.kind === 'sorry');
          if (!sorry) continue;
          offered++;
          expect(sorry.about ?? '').not.toMatch(/told the steward/);
        }
      }
    }
    expect(offered).toBeGreaterThan(0);
  });

  it('a sorry for a grievance forgiven in the last week is "enough", not more standing', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 10));
    const r = sim.resident('bram');
    r.forgiven = { still_waiting: sim.state.tick - 4 * TICKS_PER_DAY };
    r.sorryFor = { still_waiting: sim.state.tick - 4 * TICKS_PER_DAY };
    r.rel[STEWARD]!.affinity = 0.3;
    const before = r.rel[STEWARD]!.affinity;
    const res = applyReply(sim.state, r, 'sorry', [{ kind: 'sorry', aspect: 'still_waiting', about: 'kept me waiting' }], () => {});
    expect(res?.stance).toBe('enough');
    expect(r.rel[STEWARD]!.affinity).toBe(before);
  });

  it('giving up on the steward happens once for the same lapses, and nothing is asked meanwhile', () => {
    const sim = runScenario('bakery', 2, 'none');
    sim.runUntil(14 * 1440 + 6 * 60);
    for (const id of sim.state.order) {
      const r = sim.resident(id);
      if (!r.departed) r.gaveUpUntil = sim.tick + 7 * 1440;
    }
    const posted: string[] = [];
    sim.on((e) => {
      if (e.type === 'request_posted') posted.push(`${e.request.by} ${e.request.kind}`);
    });
    sim.runDays(6);
    expect(posted).toEqual([]);
    const gaveUp = new Map<string, number[]>();
    const sim2 = runScenario('quiet', 3, 'none');
    sim2.on((e) => {
      if (e.type === 'gave_up') gaveUp.set(e.who, [...(gaveUp.get(e.who) ?? []), dayOf(e.t)]);
    });
    sim2.runUntil(at(30, 0));
    for (const [who, days] of gaveUp) {
      for (let i = 1; i < days.length; i++) {
        const lapses = sim2.state.requests.filter((q) => q.by === who && q.status === 'lapsed' && q.kind !== 'home_for_kin' && (q.closedTick ?? 0) > at(days[i - 1]!, 0) && (q.closedTick ?? 0) <= at(days[i]!, 23)).length;
        expect(lapses, `${who} gave up on days ${days.join(', ')}`).toBeGreaterThan(0);
      }
    }
  });

  it('a clone taken mid-day runs on exactly as the original', () => {
    for (const t of [at(3, 12), at(3, 7, 30)]) {
      const a = Simulation.fromScenario(scenario('bakery'), 11);
      a.runUntil(t);
      const b = a.clone();
      a.runDays(2);
      b.runDays(2);
      expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    }
  });

  it('words said to your face read right', () => {
    const sim = runScenario('quiet', 1, 'none');
    const n = new Narrator(sim, { stewardIsYou: true });
    expect(n.toSteward("The steward's choices leave me cold.")).toBe('Your choices leave me cold.');
    expect(n.toSteward("the steward isn't kind")).toBe("You aren't kind");
    expect(n.toSteward('the steward always listened')).toBe('You always listened');
  });

  it('a cottage asked for someone\'s kin is not answered by someone leaving', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(3, 12));
    const since = sim.state.tick;
    const leaver = sim.state.order.map((id) => sim.resident(id)).find((r) => !r.departed)!;
    leaver.departed = true;
    const asker = sim.state.order.map((id) => sim.resident(id)).find((r) => !r.departed)!;
    expect(assess(sim.state, asker, 'home_for_kin', since).met).toBe(false);
    sim.state.stock.timber = 100;
    for (let y = 2; y < 30; y++) {
      const x = [...Array(28).keys()].map((i) => i + 2).find((xx) => canPlace(sim.state, 'cottage', xx, y) === null);
      if (x !== undefined) {
        sim.build('cottage', x, y);
        break;
      }
    }
    expect(assess(sim.state, asker, 'home_for_kin', since).met).toBe(true);
  });

  it('reading someone\'s page is not meeting them', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(2, 10));
    const before = { ...progressOf(sim.state) };
    const goalsBefore = JSON.stringify(before.goals ?? []);
    sim.schedule([{ at: sim.state.tick, kind: 'look', who: 'ada' } as never]);
    sim.flushCommands();
    expect(JSON.stringify(progressOf(sim.state).goals ?? [])).toBe(goalsBefore);
  });
});
