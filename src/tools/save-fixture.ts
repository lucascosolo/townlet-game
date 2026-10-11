// Writes a save fixture for test/saves.test.ts: a bakery town played for a month the way a player
// plays it (a few buildings, talks, replies and a favour), saved with its snapshot. One is written
// for each release that changes the sim, so the loader is tested on real saves from older builds:
//   npx tsx src/tools/save-fixture.ts [name]   -> test/fixtures/saves/<name>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../../web/src/game.js';
import { saveData } from '../../web/src/save.js';
import { at } from '../sim/time.js';
import { canPlace } from '../sim/world.js';
import { simVersion } from './sim-version.js';

const name = process.argv[2] ?? `${new Date().toISOString().slice(0, 10)}-bakery-2-day30`;
const game = new Game({ scenario: 'bakery', seed: 2, steward: 'none', scripted: false });

/** The first free spot for a building, scanning from the top left. */
function spot(type: string): [number, number] | null {
  const s = game.sim.state;
  for (let y = 1; y < s.height - 1; y++) for (let x = 1; x < s.width - 1; x++) if (canPlace(s, type, x, y) === null) return [x, y];
  return null;
}

game.runTicks(at(2, 9));
for (const [day, type] of [
  [2, 'garden'],
  [6, 'well'],
  [12, 'commons'],
] as const) {
  game.runTicks(at(day, 10) - game.sim.tick);
  const p = spot(type);
  if (p) game.command({ kind: 'build', type, x: p[0], y: p[1] });
}
for (let day = 3; day <= 28; day += 3) {
  game.runTicks(at(day, 12) - game.sim.tick);
  const id = game.sim.state.order[day % game.sim.state.order.length] as string;
  if (game.sim.resident(id).departed) continue;
  game.command({ kind: 'talk', who: id, question: 'how' });
  game.command({ kind: 'reply', who: id, reply: 'agree' });
  if (day === 12) game.command({ kind: 'favour', who: id, favour: 'visit', other: game.sim.state.order[0] as string });
}
game.runTicks(at(30, 10) - game.sim.tick);
const data = { ...saveData(game, new Date('2026-10-11T12:00:00Z')), simVersion: simVersion() };
const dir = join('test', 'fixtures', 'saves');
mkdirSync(dir, { recursive: true });
const json = JSON.stringify(data);
writeFileSync(join(dir, `${name}.json`), json);
console.log(`${name}: tick ${data.tick}, ${data.commands.length} commands, ${data.snapshot?.buildings.length} buildings, ${(json.length / 1024).toFixed(0)} KB, sim ${data.simVersion}`);
