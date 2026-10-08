import type { Scenario } from '../sim/sim.js';
import { Simulation } from '../sim/sim.js';
import { at } from '../sim/time.js';
import { bakeryScenario, quietScenario } from './bakery.js';
import { attachSteward, type StewardPolicy } from './steward.js';

export interface NamedScenario {
  scenario: Scenario;
  /** The stand-in steward for this scenario, unless overridden. */
  steward: StewardPolicy;
}

/**
 * A town that is badly looked after: the bakery goes up beside Ada's cottage, the places people
 * love are taken away one by one, and nobody answers requests or proposals.
 */
export const neglectScenario: Scenario = {
  ...bakeryScenario,
  name: 'neglect',
  commands: [
    { at: at(2, 8), kind: 'build', type: 'bakery', x: 5, y: 8 },
    { at: at(4, 10), kind: 'remove', x: 7, y: 12 }, // the old oak
    { at: at(6, 10), kind: 'remove', x: 11, y: 14 }, // the teahouse
    { at: at(8, 10), kind: 'remove', x: 17, y: 8 }, // the bench
    { at: at(10, 10), kind: 'remove', x: 13, y: 9 }, // the flower bed
    { at: at(12, 10), kind: 'remove', x: 10, y: 10 }, // the commons
  ],
};

/** The same town, with nothing taken away and a steward who listens. */
export const caringScenario: Scenario = { ...bakeryScenario, name: 'caring', commands: [{ at: at(2, 8), kind: 'build', type: 'bakery', x: 5, y: 8 }] };

export const SCENARIOS: Record<string, NamedScenario> = {
  bakery: { scenario: bakeryScenario, steward: 'considerate' },
  quiet: { scenario: quietScenario, steward: 'considerate' },
  neglect: { scenario: neglectScenario, steward: 'neglectful' },
  caring: { scenario: caringScenario, steward: 'considerate' },
};

export function scenario(name: string): Scenario {
  return named(name).scenario;
}

function named(name: string): NamedScenario {
  const s = SCENARIOS[name];
  if (!s) throw new Error(`unknown scenario "${name}"; known: ${Object.keys(SCENARIOS).join(', ')}`);
  return s;
}

/** A simulation of a named scenario with its stand-in steward attached. */
export function runScenario(name: string, seed: number, steward?: StewardPolicy, opts: { scripted?: boolean } = {}): Simulation {
  const s = named(name);
  // In the browser the player is the steward, so a scenario's scripted steward commands are left out (bar round 1).
  const sim = Simulation.fromScenario(opts.scripted === false ? { ...s.scenario, commands: [] } : s.scenario, seed);
  attachSteward(sim, steward ?? s.steward);
  return sim;
}
