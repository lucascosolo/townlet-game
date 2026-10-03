// Soak runner (spec 8.3): simulate many seeds for a long stretch with a randomly building
// steward, and flag degenerate towns. Exit code 1 if any run is flagged.
//   npm run soak -- --seeds 10 --days 28
import { soak } from '../soak/soak.js';
import { num, parseArgs, str } from './args.js';

const args = parseArgs(process.argv.slice(2));
const seeds = num(args, 'seeds', 10);
const days = num(args, 'days', 28);
const scenarioName = str(args, 'scenario', 'quiet');
const started = Date.now();
const report = soak({ scenario: scenarioName, seeds, days, firstSeed: num(args, 'first-seed', 1) });
console.log(report.text);
console.log(`\n${seeds} runs x ${days} days in ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exitCode = report.flagged ? 1 : 0;
