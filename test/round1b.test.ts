// Bar round 1 criterion 5 (spec 9.3, predeclared 2026-10-08): rough edges, the parts a headless
// run can check. The browser parts are in e2e/round1.spec.ts.
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/content/buildings.js';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { FESTIVALS } from '../src/sim/story/director.js';
import { at } from '../src/sim/time.js';
import type { SimEvent } from '../src/sim/types.js';
import { WEAR_SHOW, liveBuildings } from '../src/sim/world.js';
import { SEEDS } from './helpers.js';

/** Type ids that are not a word in their own display name ("flowerbed" for "Flower bed"): never to appear raw. */
const RAW_IDS = Object.values(BUILDINGS)
  .filter((d) => !d.name.toLowerCase().split(/\s+/).includes(d.type))
  .map((d) => d.type);

describe('round 1, criterion 5: rough edges (headless)', () => {
  it('quantities in the log are whole numbers, no raw type ids, a/an and singulars are right, festival names keep their capitals', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario(seed % 2 ? 'bakery' : 'quiet', seed, 'favours');
      const n = new Narrator(sim, { stewardIsYou: true });
      sim.runUntil(at(21, 0));
      const text = n.text();
      // Whole numbers: no "4.8 timber".
      expect(text).not.toMatch(/\b\d+\.\d+ (timber|food)\b/);
      // Raw ids: "flowerbed", "teahouse" and the like never appear as words.
      for (const id of RAW_IDS) expect(text, id).not.toMatch(new RegExp(`\\b${id}\\b`));
      // A/an.
      expect(text).not.toMatch(/\ba (orchard|oak|apiary|inn)\b/);
      expect(text).not.toMatch(/\ban (bakery|bench|cottage|garden|teahouse|workshop|woodlot|granary|glasshouse|hedge|flower)\b/);
      expect(text).not.toMatch(/\ba garden plots\b/);
      // Capitals: a festival name never follows a tic in lower case.
      for (const f of Object.values(FESTIVALS)) expect(text, f).not.toMatch(new RegExp(`\\b${f.charAt(0).toLowerCase()}${f.slice(1)}\\b`));
    }
  });

  it('a festival is never held at a removed building', { timeout: 300_000 }, () => {
    let starts = 0;
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.on((e) => {
        if (e.type !== 'gathering' || e.phase !== 'start' || e.gathering.placeId === null) return;
        starts++;
        const b = sim.state.buildings.find((x) => x.id === e.gathering.placeId);
        expect(b && !b.removed, `${e.gathering.label} at a felled place, seed ${seed}`).toBe(true);
      });
      // Fell the oak and the teahouse the morning after the festival is planned.
      sim.runUntil(at(4, 9));
      for (const type of ['oak', 'teahouse']) {
        const b = liveBuildings(sim.state).find((x) => x.type === type);
        if (b) sim.remove(b.x, b.y);
      }
      sim.runUntil(at(28, 0));
    }
    expect(starts).toBeGreaterThan(0);
  });

  it('worn tracks: at most 30% of settled tiles show wear on day 12 in an unbuilt town', { timeout: 120_000 }, () => {
    for (const seed of SEEDS) {
      const sim = runScenario('quiet', seed, 'none');
      sim.runUntil(at(12, 12));
      const settled = sim.state.settled ?? { width: sim.state.width, height: sim.state.height };
      let shown = 0;
      for (const [k, w] of Object.entries(sim.state.wear ?? {})) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        if (x < settled.width && y < settled.height && w >= WEAR_SHOW) shown++;
      }
      expect(shown / (settled.width * settled.height), `seed ${seed}`).toBeLessThanOrEqual(0.3);
    }
  });

  it('the bakery scenario in the browser runs no scripted steward commands', () => {
    const sim = runScenario('bakery', 1, 'none', { scripted: false });
    const built: SimEvent[] = [];
    sim.on((e) => {
      if (e.type === 'built' && e.by === 'steward') built.push(e);
    });
    sim.runUntil(at(10, 0));
    expect(built).toHaveLength(0);
    expect(liveBuildings(sim.state).some((b) => b.type === 'bakery')).toBe(false);
  });
});
