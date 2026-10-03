// The M1 "radio play": run a scenario and print what happened as text.
//   npm run radio -- --scenario bakery --seed 1 --days 12 [--verbose]
import { Narrator } from '../narrate/narrator.js';
import { scenario } from '../scenarios/index.js';
import { Simulation } from '../sim/sim.js';
import { num, parseArgs, str } from './args.js';

const args = parseArgs(process.argv.slice(2));
const name = str(args, 'scenario', 'bakery');
const seed = num(args, 'seed', 1);
const days = num(args, 'days', 12);

const sim = Simulation.fromScenario(scenario(name), seed);
const narrator = new Narrator(sim, { verbose: args.verbose === true });
sim.runDays(days);
console.log(`Townlet radio play: scenario "${name}", seed ${seed}, ${days} days`);
console.log(narrator.text());
