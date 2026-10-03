import { describe, expect, it } from 'vitest';
import { bakeryScenario } from '../src/scenarios/bakery.js';
import { Simulation } from '../src/sim/sim.js';
import type { SimEvent } from '../src/sim/types.js';

function record(sim: Simulation): SimEvent[] {
  const events: SimEvent[] = [];
  sim.on((e) => events.push(e));
  return events;
}

describe('determinism', () => {
  it('the same seed and commands produce the same town', () => {
    const a = Simulation.fromScenario(bakeryScenario, 7);
    const b = Simulation.fromScenario(bakeryScenario, 7);
    const ea = record(a);
    const eb = record(b);
    a.runDays(4);
    b.runDays(4);
    expect(ea.length).toBeGreaterThan(100);
    expect(JSON.stringify(ea)).toBe(JSON.stringify(eb));
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('a different seed produces a different town', () => {
    const a = Simulation.fromScenario(bakeryScenario, 1);
    const b = Simulation.fromScenario(bakeryScenario, 2);
    a.runDays(2);
    b.runDays(2);
    expect(JSON.stringify(a.state)).not.toBe(JSON.stringify(b.state));
  });

  it('a clone continues exactly as the original, including scheduled commands', () => {
    const sim = Simulation.fromScenario(bakeryScenario, 3);
    sim.runDays(1);
    const twin = sim.clone();
    const ea = record(sim);
    const eb = record(twin);
    sim.runDays(2); // crosses the day-2 bakery command
    twin.runDays(2);
    expect(ea.some((e) => e.type === 'built')).toBe(true);
    expect(JSON.stringify(ea)).toBe(JSON.stringify(eb));
  });

  it('state survives a JSON round trip (saves)', () => {
    const sim = Simulation.fromScenario(bakeryScenario, 4);
    sim.runDays(3);
    const restored = new Simulation(JSON.parse(JSON.stringify(sim.state)));
    sim.runDays(1);
    restored.runDays(1);
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(sim.state));
  });
});
