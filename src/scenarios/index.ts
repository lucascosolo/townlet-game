import type { Scenario } from '../sim/sim.js';
import { bakeryScenario, quietScenario } from './bakery.js';

export const SCENARIOS: Record<string, Scenario> = {
  bakery: bakeryScenario,
  quiet: quietScenario,
};

export function scenario(name: string): Scenario {
  const s = SCENARIOS[name];
  if (!s) throw new Error(`unknown scenario "${name}"; known: ${Object.keys(SCENARIOS).join(', ')}`);
  return s;
}
