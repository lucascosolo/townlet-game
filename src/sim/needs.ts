// Needs as homeostats (spec 4.2.1). Each need has a personal setpoint; discomfort is the
// distance from it. Company can also overshoot: a crowd satisfies a sociable resident and
// overwhelms a reserved one.

import type { ActivityId, Need, NeedMap, QualityMap, ResidentDef } from './types.js';

/** Map a bipolar trait in [-1, 1] to [0, 1]. */
export const unit = (t: number) => (t + 1) / 2;
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function setpointsFor(def: ResidentDef): NeedMap {
  const s = unit(def.traits.sociable);
  return {
    rest: 0.75,
    food: 0.7,
    comfort: 0.6 + 0.1 * unit(def.traits.tidy),
    company: 0.3 + 0.4 * s,
    purpose: 0.45 + 0.2 * unit(def.traits.steady) + 0.1 * def.values.craft,
    delight: 0.45 + 0.3 * unit(def.traits.curious),
  };
}

/** How much a resident likes each ambient quality, in roughly [-1, 1]. */
export function ambientPrefs(def: ResidentDef): QualityMap {
  const v = def.values;
  return {
    noise: -0.2 - 0.8 * v.quiet - (def.quirks.includes('light_sleeper') ? 0.1 : 0),
    bustle: 0.5 * def.traits.sociable - 0.5 * v.quiet + 0.3 * v.prosperity,
    green: 0.2 + 0.7 * v.nature,
    scent: 0.2 + 0.4 * v.beauty,
    water: 0.1 + 0.6 * v.nature,
  };
}

export function prefScore(prefs: QualityMap, amb: QualityMap): number {
  return prefs.noise * amb.noise + prefs.bustle * amb.bustle + prefs.green * amb.green + prefs.scent * amb.scent + prefs.water * amb.water;
}

/** Night noise above this wakes or unsettles a sleeper. */
export function sleepNoiseThreshold(def: ResidentDef): number {
  return def.quirks.includes('light_sleeper') ? 0.2 : 0.45;
}

/** Shortfall below the setpoint, as a fraction of it: 0 when satisfied, 1 when empty. */
export function urgency(level: number, setpoint: number): number {
  return clamp((setpoint - level) / setpoint);
}

/** Discomfort from too much company, scaled by how reserved the resident is. */
export function companyOvershoot(level: number, setpoint: number, def: ResidentDef): number {
  const over = level - (setpoint + 0.2);
  return over > 0 ? over * (1 - unit(def.traits.sociable)) * 2 : 0;
}

// Hunger weighs most (bar round 2: a week of thin suppers barely moved mood).
const MOOD_WEIGHTS: NeedMap = { rest: 1.2, food: 2.5, comfort: 1, company: 1, purpose: 0.7, delight: 0.7 };

export function needsWellbeing(needs: NeedMap, setpoints: NeedMap, def: ResidentDef): number {
  let total = 0;
  let wsum = 0;
  for (const n of Object.keys(MOOD_WEIGHTS) as Need[]) {
    let d = urgency(needs[n], setpoints[n]);
    if (n === 'company') d += companyOvershoot(needs.company, setpoints.company, def);
    total += MOOD_WEIGHTS[n] * clamp(d);
    wsum += MOOD_WEIGHTS[n];
  }
  return 1 - total / wsum;
}

/** Per-hour drift of each need while awake. */
export const BASE_DECAY: NeedMap = {
  rest: -0.045,
  food: -0.055,
  comfort: -0.02,
  company: -0.035,
  purpose: -0.025,
  delight: -0.03,
};

/** Per-hour effect of each activity, added to the base drift. */
export const ACTIVITY_EFFECTS: Record<ActivityId, Partial<NeedMap>> = {
  sleep: { rest: 0.185, food: 0.03, comfort: 0.05, company: 0.02, purpose: 0.015, delight: 0.015 },
  eat: { food: 1.2, comfort: 0.05 },
  work: { purpose: 0.16, rest: -0.02 },
  socialize: { company: 0.22, delight: 0.06 },
  stroll: { delight: 0.16, comfort: 0.04, purpose: 0.02 },
  rest: { comfort: 0.15, rest: 0.05, delight: 0.02 },
  forage: { purpose: 0.1, rest: -0.03, delight: 0.04 },
};

/** A need shown as low: under six tenths of what they want, or under 0.3 whatever they want (bar round 3: "all met" mid-famine). */
export function needIsLow(level: number, setpoint: number): boolean {
  // Bar round 5: the same line as "On their mind" (urgency over 0.35), so the page never says
  // "Hungry" above "Needs · all met".
  return level < setpoint * 0.65 || level < 0.3;
}
