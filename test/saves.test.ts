// Save reliability (spec 9.3, predeclared 2026-10-11): a save carries the town itself, so it loads
// under a later build; the commands it also carries replay to the same town under the sim that
// made it; and the fixtures in test/fixtures/saves, one per release that changed the sim, all load.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simVersion } from '../src/tools/sim-version.js';
import { at } from '../src/sim/time.js';
import { Game } from '../web/src/game.js';
import { isSave, loadGame, restore, saveData, type SaveData } from '../web/src/save.js';

const DIR = join('test', 'fixtures', 'saves');
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ name: f, data: JSON.parse(readFileSync(join(DIR, f), 'utf8')) as SaveData }));
const CURRENT = simVersion();
const WEEK = 7 * 1440;

const town = (g: Game): unknown => JSON.parse(JSON.stringify(g.sim.state));

describe('save reliability (predeclared 2026-10-11)', () => {
  it('there is at least one fixture, and every fixture is a save this code reads, with a snapshot', () => {
    expect(FIXTURES.length).toBeGreaterThan(0);
    for (const f of FIXTURES) {
      expect(isSave(f.data), f.name).toBe(true);
      expect(f.data.version, f.name).toBe(2);
      expect(f.data.snapshot, f.name).toBeDefined();
      expect(f.data.simVersion, f.name).toMatch(/^[0-9a-f]{10}$/);
    }
  });

  for (const f of FIXTURES) {
    it(`${f.name}: loads from its snapshot at the tick it was saved, with everyone in it, and runs on for a week`, () => {
      const { game, how } = loadGame(f.data);
      expect(how).toBe('snapshot');
      expect(game.sim.tick).toBe(f.data.tick);
      expect(game.sim.state.order).toEqual(f.data.snapshot!.order);
      expect(game.commandLog).toEqual(f.data.commands);
      game.runTicks(WEEK);
      expect(game.sim.tick).toBe(f.data.tick + WEEK);
      for (const id of f.data.snapshot!.order) expect(game.sim.resident(id), `${id} still known`).toBeDefined();
    });

    it(`${f.name}: a month's save is under 300 KB`, () => {
      expect(JSON.stringify(f.data).length).toBeLessThan(300 * 1024);
    });

    // Only a fixture made by this very sim must replay to the same place; an older one is kept to
    // prove it still loads, which is the point of keeping it.
    it.skipIf(f.data.simVersion !== CURRENT)(`${f.name}: replaying its commands under the sim that made it lands on its snapshot exactly`, { timeout: 120_000 }, () => {
      const game = new Game({ scenario: f.data.scenario, seed: f.data.seed, steward: f.data.steward, scripted: f.data.scripted ?? false });
      restore(game, f.data);
      expect(game.sim.tick).toBe(f.data.tick);
      expect(town(game)).toEqual(f.data.snapshot);
    });
  }

  it('a town loaded from a save goes on exactly as the one that was saved', { timeout: 120_000 }, () => {
    const a = new Game({ scenario: 'quiet', seed: 3, steward: 'none', scripted: false });
    a.runTicks(at(3, 9));
    a.command({ kind: 'talk', who: 'ada', question: 'how' });
    a.command({ kind: 'reply', who: 'ada', reply: 'agree' });
    a.runTicks(60);
    a.command({ kind: 'build', type: 'well', x: 20, y: 20 });
    // Saved in the very minute of a command, through JSON, as the browser does.
    const data = JSON.parse(JSON.stringify(saveData(a))) as SaveData;
    expect(data.version).toBe(2);
    const { game: b, how } = loadGame(data);
    expect(how).toBe('snapshot');
    expect(town(b)).toEqual(town(a));
    a.runTicks(3 * 1440);
    b.runTicks(3 * 1440);
    expect(town(b)).toEqual(town(a));
  });

  it('a save from before 2026-10-11 (commands only, version 1) replays to the same town', { timeout: 120_000 }, () => {
    const f = FIXTURES.find((x) => x.data.simVersion === CURRENT);
    if (!f) return;
    const { snapshot: _s, simVersion: _v, ...rest } = f.data;
    const old = { ...rest, version: 1 as const };
    const { game, how } = loadGame(old);
    expect(how).toBe('replay');
    expect(game.sim.tick).toBe(f.data.tick);
    expect(town(game)).toEqual(f.data.snapshot);
  });

  it('a snapshot the code cannot read falls back to replaying; a replay that fails falls back to the first morning', { timeout: 120_000 }, () => {
    const f = FIXTURES[0]!;
    const stale = { ...f.data, snapshot: { ...f.data.snapshot!, version: 99 as unknown as 2 } };
    expect(loadGame(stale).how).toBe('replay');
    const broken: SaveData = { ...f.data, version: 1, snapshot: undefined, commands: [null as unknown as SaveData['commands'][number]] };
    const { game, how } = loadGame(broken);
    expect(how).toBe('fresh');
    expect(game.sim.tick).toBe(0);
    expect(game.options.seed).toBe(f.data.seed);
  });
});
