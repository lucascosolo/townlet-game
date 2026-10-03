// StructuredMind: option B in spec 4.6.1, "brain-inspired, not brain-simulated".
// Utility choice over a routine skeleton, appraisal into salience-gated memory, gossip,
// and overnight consolidation.

import { buildingDef } from '../../content/buildings.js';
import { between, chance, intBetween, rand } from '../rng.js';
import {
  ACTIVITY_EFFECTS,
  ambientPrefs,
  clamp,
  companyOvershoot,
  prefScore,
  unit,
  urgency,
} from '../needs.js';
import { inWindow, minuteOf, nextAt } from '../time.js';
import type { ActivityId, ActivityState, ExchangeKind, Need, ResidentState, SimState } from '../types.js';
import { NEEDS } from '../types.js';
import { ambientAt, liveBuildings, placeTile, walkDistance } from '../world.js';
import type { Mind, MindContext, Perception, Setting } from './mind.js';
import { addEmotion, beliefsAbout, consolidate, opinion, perceive } from './memory.js';
import { nightlyRelationships, rel } from './relationships.js';
import { aspirationPull } from '../story/aspirations.js';
import { gatheringPull } from '../story/director.js';

export function presentAt(state: SimState, placeId: number, except?: string): ResidentState[] {
  return state.order
    .map((id) => state.residents[id] as ResidentState)
    .filter((o) => !o.departed && o.id !== except && (o.at === placeId || o.pending?.placeId === placeId));
}

function isOpen(ctx: MindContext, placeId: number, activity: ActivityId, minute: number): boolean {
  const b = ctx.state.buildings.find((x) => x.id === placeId);
  if (!b || b.removed) return false;
  const def = buildingDef(b.type);
  if (def.open && !inWindow(minute, def.open[0], def.open[1])) return false;
  // Workplaces serve food only while someone is working there (bread while the ovens run).
  if (activity === 'eat' && def.kind === 'work' && !ctx.worked.has(placeId)) return false;
  return true;
}

interface Candidate {
  activity: ActivityId;
  placeId: number;
  score: number;
}

const MILD_ASPECTS = new Set(['good_times', 'peaceful_spot', 'smells_lovely']);

/**
 * The most newsworthy thing r could tell other, and how newsworthy it is. News the listener
 * already shares is dull; complaints and opinions about people travel further than
 * contentment about places.
 */
export function gossipTopic(r: ResidentState, other: ResidentState, tick: number): { key: string; score: number } | null {
  let best: { key: string; score: number } | null = null;
  for (const [key, b] of Object.entries(r.beliefs)) {
    if (b.strength < 0.3 || b.subject === `r:${other.id}`) continue;
    const last = r.told[`${other.id}|${key}`];
    if (last !== undefined && tick - last < 1440) continue;
    let score = Math.abs(b.valence) * b.strength;
    if (b.subject === 'steward' || b.subject.startsWith('r:')) score *= 1.2;
    if (b.valence < 0) score *= 1.2;
    if (MILD_ASPECTS.has(b.aspect)) score *= 0.35;
    const theirs = opinion(other, b.subject);
    if (Math.abs(theirs) > 0.2 && Math.sign(theirs) === Math.sign(b.valence)) score *= 0.3;
    if (!best || score > best.score) best = { key, score };
  }
  return best;
}

/** A place both remember fondly, other than where they are standing, not recently reminisced about. */
export function sharedFondPlace(r: ResidentState, o: ResidentState, here: number | null, tick: number): string | null {
  for (const b of Object.values(r.beliefs)) {
    // Places, and things the town lived through together.
    if (!(b.subject.startsWith('b:') || b.subject.startsWith('m:')) || b.valence <= 0 || b.strength < 0.3) continue;
    if (here !== null && b.subject === `b:${here}`) continue;
    const last = r.told[`reminisce|${o.id}|${b.subject}`];
    if (last !== undefined && tick - last < 3 * 1440) continue;
    if (opinion(o, b.subject) > 0.15) return b.subject;
  }
  return null;
}

export const StructuredMind: Mind = {
  perceive,

  decide(ctx, r) {
    const def = ctx.def(r.id);
    const tick = ctx.tick;
    const minute = minuteOf(tick);
    const s01 = unit(def.traits.sociable);
    const prefs = ambientPrefs(def);
    const from = [r.x, r.y] as [number, number];

    // Signed need pressure: positive means "I want more of this".
    const pressure = {} as Record<Need, number>;
    for (const n of NEEDS) pressure[n] = urgency(r.needs[n], r.setpoints[n]);
    pressure.company -= companyOvershoot(r.needs.company, r.setpoints.company, def);

    const sleepTime = inWindow(minute, def.sleep, def.wake);
    const ill = r.coldUntil > tick;
    const raining = ctx.state.story.weather.kind !== 'clear' && tick < ctx.state.story.weather.until;
    const curious = unit(def.traits.curious);
    const candidates: Candidate[] = [];
    const add = (activity: ActivityId, placeId: number, routine: number) => {
      const b = ctx.state.buildings.find((x) => x.id === placeId);
      if (!b || b.removed) return;
      let score = routine;
      const fx = ACTIVITY_EFFECTS[activity];
      // Deep deficits weigh more than mild ones, so a neglected need eventually wins.
      for (const n of NEEDS) score += pressure[n] * (fx[n] ?? 0) * (4 + 9 * Math.max(0, pressure[n]));
      const tile = placeTile(b);
      if (activity !== 'sleep') {
        score += 0.6 * prefScore(prefs, ambientAt(ctx.state, tile[0], tile[1], ctx.worked));
        score += 0.4 * opinion(r, `b:${placeId}`);
        score -= 0.015 * walkDistance(from, tile);
        if (activity === 'socialize' || activity === 'stroll') {
          // Somewhere not seen for a while has a pull of its own, more so for the curious.
          const last = r.lastVisit[String(placeId)];
          const since = last === undefined ? 2 * 1440 : tick - last;
          score += 0.45 * (0.4 + curious) * Math.min(1, since / (2 * 1440));
          if (raining && buildingDef(b.type).kind !== 'social') score -= 0.6;
        }
        if (ill) score += activity === 'rest' ? 1.2 : -1.2;
      }
      if (activity === 'socialize' || (activity === 'eat' && placeId !== r.homeId)) {
        let pull = 0;
        const others = presentAt(ctx.state, placeId, r.id);
        for (const o of others) {
          const x = rel(r, o.id);
          pull += 0.4 * x.affinity + 0.1 * x.familiarity;
          // Somewhere a rival is sitting is somewhere else to be.
          if (x.tags.includes('rival')) pull -= 0.5;
        }
        score += clamp(pull, -0.5, 0.5) - 0.1 * others.length * (1 - s01);
        // Past its comfortable number a place feels crowded, to everyone.
        const comfortable = buildingDef(b.type).comfortable;
        if (comfortable !== undefined) score -= 0.3 * Math.max(0, others.length + 1 - comfortable);
      }
      score += rand(r) * 0.3;
      candidates.push({ activity, placeId, score });
    };

    add('sleep', r.homeId, sleepTime ? 3 : r.needs.rest < 0.2 ? 1 : -3);
    if (!sleepTime) {
      const mealtime = inWindow(minute, 420, 510) || inWindow(minute, 720, 810) || inWindow(minute, 1080, 1170);
      add('rest', r.homeId, 0.1 + (def.quirks.includes('homebody') ? 0.3 : 0) - (def.quirks.includes('restless') ? 0.2 : 0));
      add('eat', r.homeId, mealtime ? 0.4 : 0);
      if (r.jobId !== null) {
        const job = ctx.state.buildings.find((b) => b.id === r.jobId);
        const shift = job && !job.removed ? buildingDef(job.type).shift : undefined;
        if (shift && inWindow(minute, shift[0], shift[1] - 20)) {
          add('work', r.jobId, 1.2 + 0.4 * unit(def.traits.steady) - (def.quirks.includes('restless') ? 0.2 : 0));
        }
      }
      const evening = inWindow(minute, 17 * 60, def.sleep);
      // A dream pulls them to where it happens (or a student to their teacher).
      const pull = aspirationPull(ctx.state, r);
      if (pull) {
        for (const b of liveBuildings(ctx.state)) {
          if (b.type !== pull.type) continue;
          if (buildingDef(b.type).activities.includes('stroll')) add('stroll', b.id, pull.weight);
        }
      }
      // Festivals, visitors and markets: a reason to be somewhere now, or soon.
      for (const g of ctx.state.story.gatherings) {
        if (tick < g.from - 45 || tick >= g.until - 20) continue;
        add('socialize', g.placeId, 0.6 + gatheringPull(g, r));
      }
      for (const b of liveBuildings(ctx.state)) {
        const bd = buildingDef(b.type);
        if (bd.kind === 'home') continue;
        if (bd.activities.includes('eat') && isOpen(ctx, b.id, 'eat', minute)) add('eat', b.id, mealtime ? 0.4 : 0);
        if (bd.activities.includes('socialize') && isOpen(ctx, b.id, 'socialize', minute)) {
          add('socialize', b.id, (evening ? 0.15 + 0.3 * s01 : 0) - (def.quirks.includes('homebody') ? 0.2 : 0));
        }
        if (bd.activities.includes('stroll') && isOpen(ctx, b.id, 'stroll', minute)) {
          add('stroll', b.id, 0.1 * unit(def.traits.curious) + (def.quirks.includes('restless') ? 0.2 : 0));
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const choice = candidates[0] as Candidate;

    let until: number;
    switch (choice.activity) {
      case 'sleep':
        if (!sleepTime) return { id: 'sleep', placeId: r.homeId, until: tick + 90 }; // a nap
        return { id: 'sleep', placeId: r.homeId, until: nextAt(tick, def.wake), night: true };
      case 'work': {
        const job = ctx.state.buildings.find((b) => b.id === choice.placeId);
        const shift = buildingDef(job?.type ?? 'garden').shift ?? [0, 0];
        until = tick + ((shift[1] - minute + 1440) % 1440);
        break;
      }
      case 'eat':
        until = tick + intBetween(r, 30, 45);
        break;
      case 'socialize':
        until = tick + intBetween(r, 45, 120);
        break;
      default:
        until = tick + intBetween(r, 30, 90);
    }
    const bedtime = nextAt(tick, def.sleep);
    if (until > bedtime) until = Math.max(tick + 15, bedtime);
    return { id: choice.activity, placeId: choice.placeId, until };
  },

  wantsToInteract(ctx, r, other, setting) {
    const def = ctx.def(r.id);
    const last = r.lastExchange[other.id];
    if (last !== undefined && ctx.tick - last < 120) return false;
    const x = rel(r, other.id);
    let p = (setting === 'passing' ? 0.2 : 0.02) * (0.6 + 0.6 * unit(def.traits.sociable));
    p *= 1 + urgency(r.needs.company, r.setpoints.company);
    p *= 0.7 + 0.6 * x.familiarity;
    if (companyOvershoot(r.needs.company, r.setpoints.company, def) > 0) p *= 0.3;
    if (x.affinity < -0.2) p *= 0.6;
    return chance(r, p);
  },

  chooseExchange(ctx, r, o, setting, placeId): ExchangeKind {
    const def = ctx.def(r.id);
    const x = rel(r, o.id);
    const gen = unit(def.traits.generous);
    const s01 = unit(def.traits.sociable);
    const topic = gossipTopic(r, o, ctx.tick);
    const options: Array<[ExchangeKind, number]> = [
      ['greet', x.familiarity < 0.2 ? 2 : 0],
      ['chat', 1],
      ['share_opinion', topic && topic.score >= 0.2 ? 0.6 + topic.score * 1.5 : 0],
      ['compliment', x.affinity > 0.3 ? 0.3 + 0.4 * gen : 0],
    ];
    if (setting === 'together') {
      const recentlyArgued = x.lastArgue >= 0 && ctx.tick - x.lastArgue < 3 * 1440;
      const together = placeId !== null && o.at === placeId;
      options.push(
        ['comfort', o.mood < 0.45 && x.affinity > 0 ? 0.3 + 1.2 * gen : 0],
        ['reminisce', sharedFondPlace(r, o, placeId, ctx.tick) ? 0.4 : 0],
        ['tease', s01 > 0.6 && x.affinity > 0.25 && def.traits.steady < 0 ? 0.4 : 0],
        // After a row, a pair cools off for a few days before another can start.
        ['argue', !recentlyArgued && (x.affinity < -0.15 || (r.mood < 0.35 && def.traits.steady < 0)) ? 0.6 - x.affinity : 0],
        ['apologize', recentlyArgued && gen > 0.5 ? 2 : 0],
        ['share_meal', together && r.activity?.id === 'eat' && o.activity?.id === 'eat' ? 1.5 : 0],
      );
    }
    let total = 0;
    for (const [, w] of options) total += Math.max(0, w);
    let roll = between(r, 0, total);
    for (const [k, w] of options) {
      roll -= Math.max(0, w);
      if (roll < 0) return k;
    }
    return 'chat';
  },

  onArrive(ctx, r, placeId) {
    if (placeId === r.homeId || placeId === r.jobId) return;
    const def = ctx.def(r.id);
    const b = ctx.state.buildings.find((x) => x.id === placeId);
    if (!b || b.removed) return;
    const subject = `b:${placeId}`;
    if (!r.visitAppraised) {
      r.visitAppraised = true;
      const [tx, ty] = placeTile(b);
      const s = prefScore(ambientPrefs(def), ambientAt(ctx.state, tx, ty, ctx.worked));
      if (s > 0.35) {
        const p: Perception = {
          subject,
          aspect: 'peaceful_spot',
          valence: 0.6,
          base: 0.15 + 0.4 * s,
          source: 'witnessed',
          placeId,
          note: 'a lovely spot',
          relevance: ['nature', 'beauty'],
        };
        perceive(ctx, r, p);
      }
      const crowd = presentAt(ctx.state, placeId, r.id).length;
      if (crowd >= 3 && unit(def.traits.sociable) < 0.4) {
        perceive(ctx, r, {
          subject,
          aspect: 'too_crowded',
          valence: -0.5,
          base: 0.25,
          source: 'witnessed',
          placeId,
          note: 'too many people',
          relevance: ['quiet'],
        });
      }
    }
    // A familiar place can cue a memory.
    if (r.buffer.some((e) => e.source === 'recalled' && e.subject === subject)) return;
    for (const bel of beliefsAbout(r, subject)) {
      if (bel.strength < 0.3 || !chance(r, 0.25 * bel.strength)) continue;
      ctx.emit({ t: ctx.tick, type: 'recall', who: r.id, subject, aspect: bel.aspect, valence: bel.valence, cue: subject });
      perceive(ctx, r, {
        subject,
        aspect: bel.aspect,
        valence: bel.valence,
        base: 0.1,
        source: 'recalled',
        placeId,
        note: 'remembered',
      });
      addEmotion(r, {
        kind: bel.valence >= 0 ? 'joy' : 'annoyance',
        target: subject,
        intensity: 0.15 * bel.strength,
        tick: ctx.tick,
      });
      break;
    }
  },

  consolidate(ctx, r) {
    // Everything the steward did today, felt as one running account, before the buffer is
    // folded into beliefs. Beliefs about the steward still form when an aspect repeats.
    let stewardEvidence = 0;
    const reasons: string[] = [];
    for (const ep of r.buffer) {
      if (ep.subject !== 'steward' || ep.source === 'recalled') continue;
      stewardEvidence += ep.valence * ep.intensity;
      if (!reasons.includes(ep.note)) reasons.push(ep.note);
    }
    const before = r.rel.steward?.affinity ?? 0;
    consolidate(ctx, r);
    nightlyRelationships(ctx, r, stewardEvidence);
    // Tell the steward when someone's view of them has moved, and why.
    const delta = (r.rel.steward?.affinity ?? 0) - before;
    if (Math.abs(delta) >= 0.04 && reasons.length > 0) ctx.emit({ t: ctx.tick, type: 'standing', who: r.id, delta, reasons: reasons.slice(0, 3) });
  },
};

