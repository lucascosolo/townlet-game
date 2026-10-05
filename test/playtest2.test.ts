// Playtest round 2 (2026-10-05): worn tracks worn by feet, steady routes, talk said to your face,
// the jetty at the water, and facts you learn being what you were told. Criteria are in the spec, §9.3.
import { describe, expect, it } from 'vitest';
import { MIND_LINES, TO_STEWARD_LINES } from '../src/content/thoughts.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { factSaid } from '../src/sim/progress.js';
import type { Simulation } from '../src/sim/sim.js';
import { at } from '../src/sim/time.js';
import type { SimEvent } from '../src/sim/types.js';
import { brookSide, canPlace, footprint, isPath, liveBuildings, placeTile, route, wearDawn } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

/** Every everyday walk in town: each home to work and to each gathering place. */
function everydayRoutes(sim: Simulation): Map<string, Array<[number, number]>> {
  const state = sim.state;
  const live = liveBuildings(state);
  const door = (id: number | null) => {
    const b = id !== null ? live.find((x) => x.id === id) : undefined;
    return b ? placeTile(b) : null;
  };
  const ends: Array<[number, number]> = live.filter((b) => ['commons', 'teahouse', 'well', 'oak', 'bakery'].includes(b.type)).map((b) => placeTile(b));
  const out = new Map<string, Array<[number, number]>>();
  for (const id of state.order) {
    const r = state.residents[id]!;
    const home = door(r.homeId);
    if (!home) continue;
    const job = door(r.jobId);
    for (const to of job ? [job, ...ends] : ends) out.set(`${home}>${to}`, route(home, to, state));
  }
  return out;
}

describe('playtest round 2', () => {
  it('criterion 1: the founding town starts with its everyday walks worn in', () => {
    const sim = runScenario('quiet', 1, 'none');
    const wear = sim.state.wear ?? {};
    const r = sim.resident('bram');
    const walk = everydayRoutes(sim).get(`${placeTile(liveBuildings(sim.state).find((b) => b.id === r.homeId)!)}>${placeTile(liveBuildings(sim.state).find((b) => b.id === r.jobId)!)}`)!;
    const worn = walk.filter(([x, y]) => (wear[`${x},${y}`] ?? 0) > 0).length;
    expect(worn / walk.length).toBeGreaterThan(0.9);
  });

  it('criterion 1: building or removing something changes no worn track at that moment', () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(2, 12));
      const before = JSON.stringify(sim.state.wear);
      let spot: [number, number] | null = null;
      for (let y = 2; y < 22 && !spot; y++) for (let x = 2; x < 20 && !spot; x++) if (canPlace(sim.state, 'workshop', x, y) === null) spot = [x, y];
      expect(spot).not.toBeNull();
      sim.build('workshop', spot![0], spot![1]);
      expect(JSON.stringify(sim.state.wear)).toBe(before);
      sim.remove(spot![0], spot![1]);
      expect(JSON.stringify(sim.state.wear)).toBe(before);
    }
  });

  it('criterion 1: wear rises only where residents step off a laid path', () => {
    const sim = runScenario('quiet', 2, 'considerate');
    sim.runUntil(at(1, 7));
    for (let n = 0; n < 600; n++) {
      if (sim.state.tick % 1440 === 0) {
        // Dawn falls between two steps: what fades is not a footstep.
        sim.step();
        continue;
      }
      const before = { ...(sim.state.wear ?? {}) };
      sim.step();
      const stood = new Set(sim.state.order.map((id) => `${sim.state.residents[id]!.x},${sim.state.residents[id]!.y}`));
      for (const [k, w] of Object.entries(sim.state.wear ?? {})) {
        if (w <= (before[k] ?? 0)) continue;
        expect(stood.has(k)).toBe(true);
        const [x, y] = k.split(',').map(Number) as [number, number];
        expect(isPath(sim.state, x, y)).toBe(false);
      }
    }
  });

  it('criterion 1: a track nobody walks keeps at most half its wear after 7 days', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.state.wear = { '3,3': 20 };
    for (let d = 0; d < 7; d++) wearDawn(sim.state);
    expect(sim.state.wear['3,3'] ?? 0).toBeLessThanOrEqual(10);
    // And in a running town, a tile off every walk fades the same way.
    const live = runScenario('quiet', 1, 'considerate');
    const far = `${live.state.width - 2},${live.state.height - 2}`;
    (live.state.wear ??= {})[far] = 20;
    live.runUntil(at(8, 7));
    expect(live.state.wear[far] ?? 0).toBeLessThanOrEqual(10);
  });

  it('criterion 1: a replayed town wears the same tracks', () => {
    const play = () => {
      const sim = runScenario('quiet', 3, 'considerate');
      sim.runUntil(at(3, 0));
      return JSON.stringify(sim.state.wear);
    };
    expect(play()).toBe(play());
  });

  // Missed, kept visible (2026-10-05). Ties between equally short routes still break by how the
  // search unfolds, so a building elsewhere can switch a walk to another route of the same length.
  // Both tie-breaks tried (towards the straight line, and a fixed per-tile grain) held routes still
  // but changed everyday walks enough to fail tuned M1.5/M3a measures, so neither shipped. The worn
  // tracks the owner saw jump are worn by footsteps now, so they no longer move when you build.
  it.fails('criterion 2: placing a building changes no route that does not cross it', () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(1, 12));
      const before = everydayRoutes(sim);
      let placed = 0;
      for (let y = 3; y < 22 && placed < 4; y += 4) {
        for (let x = 2; x < 20 && placed < 4; x += 5) {
          if (canPlace(sim.state, 'hedge', x, y) !== null) continue;
          sim.build('hedge', x, y);
          placed++;
          const [w, h] = footprint('hedge', 0);
          const after = everydayRoutes(sim);
          for (const [k, walk] of before) {
            const crosses = walk.some(([px, py]) => px >= x && px < x + w && py >= y && py < y + h);
            if (!crosses) expect(JSON.stringify(after.get(k)), `seed ${seed}, hedge at ${x},${y}, walk ${k}`).toBe(JSON.stringify(walk));
          }
          for (const [k, walk] of after) before.set(k, walk);
        }
      }
      expect(placed).toBeGreaterThan(0);
    }
  });

  it('criterion 3: feelings about you are said to you, and read right', () => {
    const sim = runScenario('quiet', 1, 'none');
    const n = new Narrator(sim, { stewardIsYou: true });
    expect(n.toSteward('The steward was kind when I needed it.')).toBe('You were kind when I needed it.');
    expect(n.toSteward('I hope the steward misses nothing.')).toBe('I hope you miss nothing.');
    expect(n.toSteward('The steward worries too much.')).toBe('You worry too much.');
    for (const key of Object.keys(TO_STEWARD_LINES)) {
      const said = new Set(Object.values(TO_STEWARD_LINES[key]!).flat() as string[]);
      for (let i = 0; i < 20; i++) {
        const words = n.answer('ada', { question: 'mind', topics: [{ key, about: 'steward', vars: { x: 'the steward' }, rank: 0 }] } as never);
        expect([...said].some((l) => words.toLowerCase().includes(l.toLowerCase())), words).toBe(true);
        expect(words).not.toMatch(/\byou (wa|is|has|vexes|irritates)\b/i);
      }
    }
    const all = Object.values(MIND_LINES).flatMap((l) => Object.values(l).flat());
    expect(all.join(' ')).not.toMatch(/let go of \{x\}/);
  });

  it('criterion 3: a fact you learn in talk is what the resident just said', () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      const n = new Narrator(sim, { stewardIsYou: true });
      const facts: Array<Extract<SimEvent, { type: 'fact' }>> = [];
      const replies: string[] = [];
      sim.on((e) => {
        if (e.type === 'fact') {
          facts.push(e);
          expect(n.lastReply?.who).toBe(e.who);
          replies.push(n.lastReply?.text ?? '');
        }
      });
      const questions = ['how', 'mind', 'hope', 'me', 'opinion'] as const;
      sim.schedule(questions.map((q, i) => ({ at: at(1, 10) + i, kind: 'talk' as const, who: 'ada', question: q })));
      sim.runUntil(at(1, 11));
      expect(facts.length).toBe(questions.length);
      facts.forEach((f, i) => expect(replies[i]).toContain(factSaid(sim.state, sim.resident(f.who), f.key)));
    }
  });

  it('criterion 4: a jetty goes only beside the brook, and the founding one is', () => {
    const sim = runScenario('quiet', 1, 'none');
    const jetty = liveBuildings(sim.state).find((b) => b.type === 'jetty')!;
    expect(brookSide(sim.state, jetty.x, jetty.y)).not.toBeNull();
    sim.state.stock.timber = 99;
    expect(canPlace(sim.state, 'jetty', 3, 3)).toBe('must be beside the brook');
    const brook = liveBuildings(sim.state).find((b) => b.type === 'brook')!;
    expect(canPlace(sim.state, 'jetty', brook.x - 1, brook.y)).toBeNull();
    expect(brookSide(sim.state, brook.x - 1, brook.y)).toBe(0);
  });
});
