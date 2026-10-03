// Headless soak runs: many seeds over long stretches, with a steward who builds and removes
// things at random, checked for the degenerate states listed in spec 8.3.

import { buildingDef } from '../content/buildings.js';
import { scenario as getScenario } from '../scenarios/index.js';
import { attachSteward } from '../scenarios/steward.js';
import { chance, deriveSeed, intBetween, pick, type RngHolder } from '../sim/rng.js';
import { Simulation } from '../sim/sim.js';
import { TICKS_PER_DAY, at } from '../sim/time.js';
import { NEEDS, type SimEvent } from '../sim/types.js';
import { canPlace, liveBuildings } from '../sim/world.js';

export interface SoakOptions {
  scenario: string;
  seeds: number;
  days: number;
  firstSeed?: number;
}

export interface RunMetrics {
  seed: number;
  departures: number;
  leavingThoughts: number;
  meanMood: number;
  minDisposition: number;
  friendPairs: number;
  rivalPairs: number;
  pairs: number;
  notablePerDay: number;
  exchangesPerDay: number;
  beliefsPerResident: number;
  stewardBuilds: number;
  stewardRemovals: number;
  arguments: number;
  storyEvents: number;
  /** Share of all socialising minutes spent at the single busiest place. */
  busiestShare: number;
  /** Smallest gap between two negative story events, in hours (Infinity if fewer than two). */
  minNegativeGapHours: number;
  flags: string[];
}

const NOTABLE = new Set<SimEvent['type']>([
  'belief_formed',
  'belief_flipped',
  'request_posted',
  'request_closed',
  'relationship',
  'grief',
  'thinking_of_leaving',
  'decided_to_stay',
  'left_town',
]);
const NOTABLE_EXCHANGES = new Set(['argue', 'comfort', 'apologize', 'reminisce', 'share_opinion']);
const STEWARD_BUILDS = ['bench', 'flowerbed', 'hedge', 'garden', 'workshop', 'teahouse', 'bakery'];

/** The window at the end of the run that the degeneracy checks look at. */
const WINDOW_DAYS = 7;

export function soakRun(scenarioName: string, seed: number, days: number): RunMetrics {
  const sim = Simulation.fromScenario({ ...getScenario(scenarioName), commands: [] }, seed);
  attachSteward(sim, 'random');
  const steward: RngHolder = { rng: deriveSeed(seed, 'soak-steward') };
  const windowStart = Math.max(0, (days - WINDOW_DAYS) * TICKS_PER_DAY);
  let notable = 0;
  let exchanges = 0;
  let departures = 0;
  let leavingThoughts = 0;
  let builds = 0;
  let removals = 0;
  let argumentsCount = 0;
  let storyEvents = 0;
  const socialMinutes = new Map<number, number>();
  const lastExchangeOf = new Map<string, number>();
  sim.on((e) => {
    if (e.type === 'exchange') {
      lastExchangeOf.set(e.a, e.t);
      lastExchangeOf.set(e.b, e.t);
    }
    if (e.t < windowStart) return;
    if (NOTABLE.has(e.type) || (e.type === 'exchange' && NOTABLE_EXCHANGES.has(e.kind))) notable++;
    if (e.type === 'exchange') exchanges++;
  });
  sim.on((e) => {
    if (e.type === 'left_town') departures++;
    if (e.type === 'thinking_of_leaving') leavingThoughts++;
    if (e.type === 'exchange' && e.kind === 'argue') argumentsCount++;
    if (e.type === 'story' || e.type === 'gathering' || e.type === 'dilemma_posted') storyEvents++;
  });

  const crisisHours = new Map<string, number>();
  const awakeHours = new Map<string, number>();
  let moodSum = 0;
  let moodN = 0;
  let minDisposition = 1;
  const flags: string[] = [];

  for (let day = 1; day <= days; day++) {
    // Every few days the steward builds something somewhere; now and then removes something.
    if (day % 3 === 0) {
      sim.runUntil(at(day, 10));
      const type = pick(steward, STEWARD_BUILDS);
      const [w, h] = buildingDef(type).size;
      for (let tries = 0; tries < 40; tries++) {
        // Within the settled valley (and any land cleared next to it is left to the residents' own story).
        const area = sim.state.settled ?? sim.state;
        const x = intBetween(steward, 0, area.width - w);
        const y = intBetween(steward, 0, area.height - h);
        if (canPlace(sim.state, type, x, y) === null && sim.canAfford(type)) {
          sim.build(type, x, y);
          builds++;
          break;
        }
      }
      if (chance(steward, 0.25)) {
        const removable = liveBuildings(sim.state).filter((b) => {
          const k = buildingDef(b.type).kind;
          return b.type !== 'wild' && (k === 'decor' || k === 'nature' || k === 'social');
        });
        if (removable.length > 0) {
          const b = pick(steward, removable);
          sim.remove(b.x, b.y);
          removals++;
        }
      }
    }
    while (sim.tick < day * TICKS_PER_DAY) {
      sim.runUntil(Math.min(sim.tick + 60, day * TICKS_PER_DAY));
      if (sim.tick < windowStart) continue;
      for (const id of sim.state.order) {
        const r = sim.resident(id);
        if (r.departed) continue;
        if (r.activity?.id === 'socialize' && r.at !== null) socialMinutes.set(r.at, (socialMinutes.get(r.at) ?? 0) + 60);
        for (const n of NEEDS) {
          if (!Number.isFinite(r.needs[n])) flags.push(`NaN need ${n} for ${id}`);
        }
        if (!Number.isFinite(r.mood)) flags.push(`NaN mood for ${id}`);
        moodSum += r.mood;
        moodN++;
        minDisposition = Math.min(minDisposition, r.disposition);
        if (r.activity?.id === 'sleep') continue;
        awakeHours.set(id, (awakeHours.get(id) ?? 0) + 1);
        if (NEEDS.some((n) => r.needs[n] < 0.1)) crisisHours.set(id, (crisisHours.get(id) ?? 0) + 1);
      }
    }
  }

  const active = sim.state.order.filter((id) => !sim.resident(id).departed);
  let friends = 0;
  let rivals = 0;
  let pairs = 0;
  let beliefs = 0;
  for (const id of active) {
    const r = sim.resident(id);
    beliefs += Object.keys(r.beliefs).length;
    for (const other of active) {
      if (other === id) continue;
      pairs++;
      const x = r.rel[other];
      if (!x) continue;
      if (!Number.isFinite(x.affinity) || !Number.isFinite(x.trust)) flags.push(`NaN relationship ${id}->${other}`);
      if (x.tags.includes('friend')) friends++;
      if (x.tags.includes('rival')) rivals++;
    }
    const crisis = (crisisHours.get(id) ?? 0) / Math.max(1, awakeHours.get(id) ?? 0);
    if (crisis > 0.25) flags.push(`${id} spent ${(crisis * 100).toFixed(0)}% of waking hours with a need below 0.1`);
    const last = lastExchangeOf.get(id);
    if (last === undefined || last < windowStart) flags.push(`${id} has spoken to nobody in the last ${WINDOW_DAYS} days`);
  }
  const windowDays = Math.min(days, WINDOW_DAYS);
  const notablePerDay = notable / windowDays;
  if (pairs > 0 && friends / pairs > 0.85) flags.push(`everyone is friends (${friends}/${pairs} directed pairs)`);
  if (days >= 14 && friends === 0) flags.push('no friendships at all');
  if (pairs > 0 && rivals / pairs > 0.25) flags.push(`the town is at odds (${rivals}/${pairs} directed pairs are rivals)`);
  if (notablePerDay < 1) flags.push(`story density ${notablePerDay.toFixed(1)} notable events/day in the last week`);
  if (departures > sim.state.order.length / 3) flags.push(`${departures} of ${sim.state.order.length} residents left`);
  const meanMood = moodN > 0 ? moodSum / moodN : 0;
  if (meanMood < 0.4) flags.push(`mean mood ${meanMood.toFixed(2)} is miserable`);
  const bad = sim.state.story.history.filter((h) => h.tone === 'bad').map((h) => h.tick);
  let minGap = Infinity;
  for (let i = 1; i < bad.length; i++) minGap = Math.min(minGap, ((bad[i] as number) - (bad[i - 1] as number)) / 60);
  if (minGap < 48) flags.push(`two negative story events ${minGap.toFixed(0)} hours apart`);
  const socialTotal = [...socialMinutes.values()].reduce((a, b) => a + b, 0);
  const busiestShare = socialTotal > 0 ? Math.max(...socialMinutes.values()) / socialTotal : 0;

  return {
    seed,
    departures,
    leavingThoughts,
    meanMood,
    minDisposition,
    friendPairs: friends,
    rivalPairs: rivals,
    pairs,
    notablePerDay,
    exchangesPerDay: exchanges / windowDays,
    beliefsPerResident: active.length > 0 ? beliefs / active.length : 0,
    stewardBuilds: builds,
    stewardRemovals: removals,
    arguments: argumentsCount,
    storyEvents,
    busiestShare,
    minNegativeGapHours: minGap,
    flags: [...new Set(flags)],
  };
}

export function soak(opts: SoakOptions): { runs: RunMetrics[]; flagged: boolean; text: string } {
  const first = opts.firstSeed ?? 1;
  const runs: RunMetrics[] = [];
  for (let s = first; s < first + opts.seeds; s++) runs.push(soakRun(opts.scenario, s, opts.days));
  const lines: string[] = [];
  lines.push(`Soak: scenario "${opts.scenario}", ${opts.seeds} seeds x ${opts.days} days (metrics over the last ${Math.min(opts.days, WINDOW_DAYS)} days)`);
  lines.push('seed  mood  minDisp  friends  rivals  left  leaving  notable/d  talk/d  beliefs  built/removed  args  story  busiest');
  for (const m of runs) {
    lines.push(
      [
        String(m.seed).padStart(4),
        m.meanMood.toFixed(2).padStart(5),
        m.minDisposition.toFixed(2).padStart(8),
        `${m.friendPairs}/${m.pairs}`.padStart(8),
        String(m.rivalPairs).padStart(7),
        String(m.departures).padStart(5),
        String(m.leavingThoughts).padStart(8),
        m.notablePerDay.toFixed(1).padStart(10),
        m.exchangesPerDay.toFixed(1).padStart(7),
        m.beliefsPerResident.toFixed(1).padStart(8),
        `${m.stewardBuilds}/${m.stewardRemovals}`.padStart(14),
        String(m.arguments).padStart(5),
        String(m.storyEvents).padStart(6),
        `${(m.busiestShare * 100).toFixed(0)}%`.padStart(8),
      ].join(' '),
    );
  }
  const mean = (f: (m: RunMetrics) => number) => runs.reduce((s, m) => s + f(m), 0) / Math.max(1, runs.length);
  lines.push(
    `mean: rivals ${mean((m) => m.rivalPairs).toFixed(1)}/run, runs with an argument ${runs.filter((m) => m.arguments > 0).length}/${runs.length}, runs with a departure ${runs.filter((m) => m.departures > 0).length}/${runs.length}, busiest place ${(mean((m) => m.busiestShare) * 100).toFixed(0)}% of socialising`,
  );
  const flaggedRuns = runs.filter((m) => m.flags.length > 0);
  lines.push('');
  if (flaggedRuns.length === 0) lines.push('No degenerate states found.');
  for (const m of flaggedRuns) for (const f of m.flags) lines.push(`FLAG seed ${m.seed}: ${f}`);
  return { runs, flagged: flaggedRuns.length > 0, text: lines.join('\n') };
}

