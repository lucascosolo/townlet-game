// Inspect residents after a run.
//   npm run inspect -- --scenario bakery --seed 1 --days 8 --resident ada
//   npm run inspect -- --days 8                # town summary plus every resident
import { inspectResident, townSummary } from '../inspect/inspector.js';
import { scenario } from '../scenarios/index.js';
import { Simulation } from '../sim/sim.js';
import { num, parseArgs, str } from './args.js';

const args = parseArgs(process.argv.slice(2));
const sim = Simulation.fromScenario(scenario(str(args, 'scenario', 'bakery')), num(args, 'seed', 1));
sim.runDays(num(args, 'days', 8));
const who = str(args, 'resident', '');
console.log(townSummary(sim));
for (const id of who ? [who] : sim.state.order) {
  console.log('\n' + '-'.repeat(72));
  console.log(inspectResident(sim, id));
}
