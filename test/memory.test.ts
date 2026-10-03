import { describe, expect, it } from 'vitest';
import { FORM_THRESHOLD, consolidate, opinion, perceive, salienceThreshold } from '../src/sim/mind/memory.js';
import type { Perception } from '../src/sim/mind/mind.js';
import { residentDef } from '../src/content/residents.js';
import { quietScenario } from '../src/scenarios/bakery.js';
import { createState } from '../src/sim/sim.js';
import { TICKS_PER_DAY } from '../src/sim/time.js';
import { testContext } from './helpers.js';

// Matches what the sim perceives when a light sleeper is woken by night noise.
const noise: Perception = { subject: 'b:1', aspect: 'noisy_at_night', valence: -0.8, base: 0.55, source: 'witnessed', note: 'test', relevance: ['quiet'] };

function setup() {
  const state = createState(quietScenario, 1);
  const ctx = testContext(state);
  const ada = state.residents.ada!;
  return { state, ctx, ada };
}

describe('salience gate', () => {
  it('drops experiences below the resident threshold and keeps those above', () => {
    const { ctx, ada } = setup();
    const threshold = salienceThreshold(residentDef('ada'));
    expect(perceive(ctx, ada, { ...noise, base: threshold * 0.5 })).toBeNull();
    expect(perceive(ctx, ada, noise)).not.toBeNull();
    expect(ada.buffer).toHaveLength(1);
  });

  it('lets recalled rehearsal through regardless of intensity', () => {
    const { ctx, ada } = setup();
    expect(perceive(ctx, ada, { ...noise, base: 0.01, source: 'recalled' })).not.toBeNull();
  });
});

describe('overnight consolidation', () => {
  it('one moderate night leaves a trace but no belief', () => {
    const { ctx, ada } = setup();
    perceive(ctx, ada, noise);
    consolidate(ctx, ada);
    expect(ada.beliefs['b:1|noisy_at_night']).toBeUndefined();
    expect(ada.traces['b:1|noisy_at_night']!.evidence).toBeLessThan(0);
    expect(ada.buffer).toHaveLength(0);
  });

  it('repeated nights form a belief with the right sign and provenance', () => {
    const { ctx, ada } = setup();
    let formedOn = -1;
    for (let night = 1; night <= 4 && formedOn < 0; night++) {
      ctx.at(night * TICKS_PER_DAY);
      perceive(ctx, ada, noise);
      consolidate(ctx, ada);
      if (ada.beliefs['b:1|noisy_at_night']) formedOn = night;
    }
    expect(formedOn).toBeGreaterThan(1);
    expect(formedOn).toBeLessThanOrEqual(3);
    const b = ada.beliefs['b:1|noisy_at_night']!;
    expect(b.valence).toBeLessThan(0);
    expect(b.sources.length).toBe(formedOn);
    expect(ctx.events.some((e) => e.type === 'belief_formed')).toBe(true);
  });

  it('a single overwhelming experience forms a belief at once', () => {
    const { ctx, ada } = setup();
    perceive(ctx, ada, { subject: 'steward', aspect: 'listens_to_me', valence: 1, base: 1.3, source: 'witnessed', note: 'test' });
    consolidate(ctx, ada);
    expect(ada.beliefs['steward|listens_to_me']).toBeDefined();
    expect(opinion(ada, 'steward')).toBeGreaterThan(0);
  });

  it('contradicting evidence weakens a belief', () => {
    const { ctx, ada } = setup();
    for (let n = 0; n < 3; n++) {
      perceive(ctx, ada, noise);
      consolidate(ctx, ada);
    }
    const before = ada.beliefs['b:1|noisy_at_night']!.strength;
    perceive(ctx, ada, { ...noise, valence: 0.8, base: 0.6 });
    consolidate(ctx, ada);
    expect(ada.beliefs['b:1|noisy_at_night']?.strength ?? 0).toBeLessThan(before);
  });

  it('an unrehearsed belief fades', () => {
    const { ctx, ada } = setup();
    for (let n = 0; n < 3; n++) {
      perceive(ctx, ada, noise);
      consolidate(ctx, ada);
    }
    expect(ada.beliefs['b:1|noisy_at_night']).toBeDefined();
    for (let n = 0; n < 80; n++) consolidate(ctx, ada);
    expect(ada.beliefs['b:1|noisy_at_night']).toBeUndefined();
    expect(ctx.events.some((e) => e.type === 'belief_faded')).toBe(true);
  });

  it('weak traces decay away instead of accumulating forever', () => {
    const { ctx, ada } = setup();
    perceive(ctx, ada, noise);
    consolidate(ctx, ada);
    for (let n = 0; n < 15; n++) consolidate(ctx, ada);
    expect(ada.traces['b:1|noisy_at_night']).toBeUndefined();
    expect(FORM_THRESHOLD).toBeGreaterThan(0);
  });
});
