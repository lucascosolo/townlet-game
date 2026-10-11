// Usability and the "busy lane" (spec 9.3, predeclared 2026-10-11). The browser matrix is in
// e2e/devices.spec.ts; this is the headless part: what a resident says they love.
import { describe, expect, it } from 'vitest';
import { residentDef } from '../src/content/residents.js';
import { runScenario } from '../src/scenarios/index.js';
import { ambientPrefs } from '../src/sim/needs.js';
import { factValue, LIFTS_WORDS, LOVE_AT_LEAST } from '../src/sim/progress.js';
import { at } from '../src/sim/time.js';
import type { Quality } from '../src/sim/types.js';

describe('what a resident loves (predeclared 2026-10-11)', () => {
  it('criterion 7: no one loves a quality they barely feel unless it is their strongest, and the wording varies from resident to resident', { timeout: 600_000 }, () => {
    const phrasings = new Map<Quality, Set<string>>();
    let lovers = 0;
    for (const scenario of ['quiet', 'bakery']) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const sim = runScenario(scenario, seed, 'considerate');
        sim.runUntil(at(30, 12));
        for (const id of sim.state.order) {
          const r = sim.resident(id);
          const said = factValue(sim.state, r, 'lifts');
          const phrase = said.replace(/^Loves /, '');
          const q = (Object.keys(LIFTS_WORDS) as Quality[]).find((k) => LIFTS_WORDS[k].includes(phrase));
          expect(q, `${scenario} seed ${seed}: "${said}" names a quality`).toBeDefined();
          const prefs = ambientPrefs(residentDef(id)) as Record<Quality, number>;
          const strongest = (Object.keys(prefs) as Quality[]).sort((a, b) => prefs[b] - prefs[a])[0];
          expect(prefs[q!] >= LOVE_AT_LEAST || q === strongest, `${scenario} seed ${seed} ${id}: loves ${q} at ${prefs[q!].toFixed(2)}`).toBe(true);
          if (!phrasings.has(q!)) phrasings.set(q!, new Set());
          phrasings.get(q!)!.add(phrase);
          lovers++;
        }
      }
    }
    expect(lovers).toBeGreaterThan(60);
    // Bustle is what most of the cast loves most; it is not said the same way by everyone.
    expect(phrasings.get('bustle')?.size ?? 0, 'ways of saying bustle').toBeGreaterThanOrEqual(2);
  });
});
