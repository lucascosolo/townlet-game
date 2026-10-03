// The M1 "radio play": run a scenario and print what happened as text.
//   npm run radio -- --scenario bakery --seed 1 --days 12 [--steward considerate] [--verbose]
import { Narrator } from '../narrate/narrator.js';
import { runScenario } from '../scenarios/index.js';
import { STEWARD_POLICIES, type StewardPolicy } from '../scenarios/steward.js';
import { num, parseArgs, str } from './args.js';

const args = parseArgs(process.argv.slice(2));
const name = str(args, 'scenario', 'bakery');
const seed = num(args, 'seed', 1);
const days = num(args, 'days', 12);

const steward = args.steward === undefined ? undefined : (str(args, 'steward', 'considerate') as StewardPolicy);
if (steward && !STEWARD_POLICIES.includes(steward)) throw new Error(`--steward must be one of ${STEWARD_POLICIES.join(', ')}`);
const sim = runScenario(name, seed, steward);
const narrator = new Narrator(sim, { verbose: args.verbose === true });
sim.runDays(days);
console.log(`Townlet radio play: scenario "${name}", seed ${seed}, ${days} days`);
console.log(narrator.text());
