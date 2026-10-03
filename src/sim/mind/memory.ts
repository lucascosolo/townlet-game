// Salience-gated episodic memory and overnight consolidation (spec 4.2.3), after the
// complementary-learning-systems shape brain-sim uses: a fast daytime buffer, traces that
// persist a few nights, and slow beliefs written only during sleep. Unrehearsed beliefs decay.

import { clamp, unit } from '../needs.js';
import type {
  Belief,
  BeliefSource,
  Emotion,
  EmotionKind,
  Episode,
  ResidentDef,
  ResidentState,
  SubjectId,
} from '../types.js';
import type { MindContext, Perception } from './mind.js';

export const TRACE_DECAY = 0.7;
export const FORM_THRESHOLD = 0.9;
export const BELIEF_DECAY = 0.96;
export const BELIEF_FLOOR = 0.12;
export const MAX_EPISODES = 40;
export const MAX_BELIEFS = 24;
const MAX_SOURCES = 6;
const MAX_EMOTIONS = 8;

function isGone(ctx: MindContext, subject: SubjectId): boolean {
  if (!subject.startsWith('b:')) return false;
  const id = Number(subject.slice(2));
  return ctx.state.buildings.find((b) => b.id === id)?.removed ?? false;
}

export const beliefKey = (subject: SubjectId, aspect: string) => `${subject}|${aspect}`;

export function salienceThreshold(def: ResidentDef): number {
  return 0.12 + 0.08 * unit(def.traits.steady);
}

/** Excitable residents feel things more; steady ones less. */
export function personalityGain(def: ResidentDef): number {
  return 1 - 0.3 * def.traits.steady;
}

export function appraise(def: ResidentDef, p: Perception): number {
  let intensity = p.base * personalityGain(def);
  if (p.relevance && p.relevance.length > 0) {
    const avg = p.relevance.reduce((s, v) => s + def.values[v], 0) / p.relevance.length;
    intensity *= 0.6 + 0.8 * avg;
  }
  return intensity;
}

function emotionFor(subject: SubjectId, aspect: string, valence: number): EmotionKind {
  if (aspect === 'lost_place') return 'grief';
  if (aspect === 'my_workplace') return 'pride';
  if (valence < 0) return 'annoyance';
  if (subject === 'steward' || subject.startsWith('r:')) return 'gratitude';
  return 'joy';
}

export function addEmotion(r: ResidentState, e: Emotion): void {
  const same = r.emotions.find((x) => x.kind === e.kind && x.target === e.target);
  if (same) {
    same.intensity = Math.min(1, same.intensity + e.intensity * 0.5);
    same.tick = e.tick;
  } else {
    r.emotions.push(e);
  }
  r.emotions.sort((a, b) => b.intensity - a.intensity);
  r.emotions.length = Math.min(r.emotions.length, MAX_EMOTIONS);
}

/** Hourly emotion decay, half-life about six hours. */
export function decayEmotions(r: ResidentState): void {
  const f = Math.pow(0.5, 1 / 6);
  for (const e of r.emotions) e.intensity *= f;
  r.emotions = r.emotions.filter((e) => e.intensity >= 0.05);
}

export function emotionBalance(r: ResidentState): number {
  let b = 0;
  for (const e of r.emotions) b += e.kind === 'joy' || e.kind === 'gratitude' || e.kind === 'pride' ? e.intensity : -e.intensity;
  return clamp(b, -1, 1);
}

/** Appraise, gate, buffer. Recalled rehearsal bypasses the gate: it is already a memory. */
export function perceive(ctx: MindContext, r: ResidentState, p: Perception): Episode | null {
  const def = ctx.def(r.id);
  const intensity = appraise(def, p);
  if (p.source !== 'recalled' && intensity < salienceThreshold(def)) return null;
  const ep: Episode = {
    id: ctx.state.nextEpisodeId++,
    tick: ctx.tick,
    subject: p.subject,
    aspect: p.aspect,
    valence: p.valence,
    intensity,
    source: p.source,
    note: p.note,
    ...(p.from !== undefined ? { from: p.from } : {}),
    ...(p.placeId !== undefined ? { placeId: p.placeId } : {}),
  };
  r.buffer.push(ep);
  if (p.source !== 'recalled') {
    addEmotion(r, {
      kind: emotionFor(p.subject, p.aspect, p.valence),
      target: p.subject,
      intensity: clamp(intensity * Math.abs(p.valence)),
      tick: ctx.tick,
    });
    ctx.emit({ t: ctx.tick, type: 'perceived', who: r.id, episode: ep });
  }
  return ep;
}

/** Net feeling about a subject across all beliefs about it, [-1, 1]. */
export function opinion(r: ResidentState, subject: SubjectId): number {
  let s = 0;
  for (const b of Object.values(r.beliefs)) if (b.subject === subject) s += b.valence * b.strength;
  return clamp(s, -1, 1);
}

/** Opinion plus half the weight of feelings still forming, for losses that come before a belief settles. */
export function attachment(r: ResidentState, subject: SubjectId): number {
  let s = opinion(r, subject);
  for (const t of Object.values(r.traces)) if (t.subject === subject) s += 0.5 * t.evidence;
  return clamp(s, -1, 1);
}

export function beliefsAbout(r: ResidentState, subject: SubjectId): Belief[] {
  return Object.values(r.beliefs).filter((b) => b.subject === subject);
}

function sourceOf(ep: Episode): BeliefSource {
  return {
    tick: ep.tick,
    kind: ep.source,
    note: ep.note,
    weight: Math.round(ep.valence * ep.intensity * 100) / 100,
    ...(ep.from !== undefined ? { from: ep.from } : {}),
  };
}

function pushSource(list: BeliefSource[], s: BeliefSource): void {
  list.push(s);
  if (list.length > MAX_SOURCES) list.splice(0, list.length - MAX_SOURCES);
}

interface TraceAcc {
  sumV: number;
  sumI: number;
}

/**
 * Overnight consolidation. Order matters: old traces decay first, then the day's buffer is
 * added, then traces strong enough become beliefs; existing beliefs are reinforced or
 * weakened by matching evidence; beliefs with no evidence tonight decay.
 */
export function consolidate(ctx: MindContext, r: ResidentState): void {
  const tick = ctx.tick;

  // 1. Old unconsolidated evidence fades.
  for (const [k, tr] of Object.entries(r.traces)) {
    tr.evidence *= TRACE_DECAY;
    tr.sumI *= TRACE_DECAY;
    if (Math.abs(tr.evidence) < 0.05) delete r.traces[k];
  }

  // 2. Group tonight's buffer by subject and aspect.
  const tonight = new Map<string, { eps: Episode[]; acc: TraceAcc }>();
  for (const ep of r.buffer) {
    const k = beliefKey(ep.subject, ep.aspect);
    let g = tonight.get(k);
    if (!g) tonight.set(k, (g = { eps: [], acc: { sumV: 0, sumI: 0 } }));
    g.eps.push(ep);
    g.acc.sumV += ep.valence * ep.intensity;
    g.acc.sumI += ep.intensity;
  }

  const reinforced = new Set<string>();
  for (const [k, g] of tonight) {
    const first = g.eps[0] as Episode;
    const existing = r.beliefs[k];
    if (existing) {
      reinforced.add(k);
      const ev = g.acc.sumV;
      for (const ep of g.eps) pushSource(existing.sources, sourceOf(ep));
      if (Math.sign(ev) === Math.sign(existing.valence) || ev === 0) {
        existing.strength = clamp(existing.strength + (1 - existing.strength) * Math.min(1, Math.abs(ev)) * 0.5);
        existing.valence = clamp((existing.valence * existing.strength + ev) / (existing.strength + g.acc.sumI), -1, 1);
        existing.reinforcedTick = tick;
      } else {
        existing.strength -= Math.min(existing.strength, Math.abs(ev) * 0.6);
        if (existing.strength < 0.1) {
          if (Math.abs(ev) >= 0.5) {
            existing.valence = clamp(ev / Math.max(g.acc.sumI, 1e-6), -1, 1);
            existing.strength = 0.3;
            existing.formedTick = tick;
            existing.reinforcedTick = tick;
            ctx.emit({ t: tick, type: 'belief_flipped', who: r.id, belief: structuredClone(existing) });
          } else {
            delete r.beliefs[k];
            ctx.emit({ t: tick, type: 'belief_faded', who: r.id, subject: existing.subject, aspect: existing.aspect });
          }
        }
      }
      continue;
    }
    let tr = r.traces[k];
    if (!tr) r.traces[k] = tr = { subject: first.subject, aspect: first.aspect, evidence: 0, sumI: 0, sources: [] };
    tr.evidence += g.acc.sumV;
    tr.sumI += g.acc.sumI;
    for (const ep of g.eps) pushSource(tr.sources, sourceOf(ep));
  }

  // 3. Traces past the threshold become beliefs. A place that no longer exists can only be
  // mourned: other feelings about it stay as traces and fade.
  for (const [k, tr] of Object.entries(r.traces)) {
    if (Math.abs(tr.evidence) < FORM_THRESHOLD) continue;
    if (tr.aspect !== 'lost_place' && isGone(ctx, tr.subject)) continue;
    const sumI = Math.max(tr.sumI, 1e-6);
    const belief: Belief = {
      subject: tr.subject,
      aspect: tr.aspect,
      valence: clamp(tr.evidence / sumI, -1, 1),
      strength: clamp(0.3 + 0.25 * Math.abs(tr.evidence)),
      formedTick: tick,
      reinforcedTick: tick,
      sources: tr.sources.slice(),
    };
    r.beliefs[k] = belief;
    reinforced.add(k);
    delete r.traces[k];
    const hearsay = belief.sources.every((s) => s.kind === 'told');
    ctx.emit({ t: tick, type: 'belief_formed', who: r.id, belief: structuredClone(belief), hearsay });
  }

  // 4. Use it or lose it.
  for (const [k, b] of Object.entries(r.beliefs)) {
    if (reinforced.has(k)) continue;
    b.strength *= BELIEF_DECAY;
    if (b.strength < BELIEF_FLOOR) {
      delete r.beliefs[k];
      ctx.emit({ t: tick, type: 'belief_faded', who: r.id, subject: b.subject, aspect: b.aspect });
    }
  }
  const all = Object.entries(r.beliefs);
  if (all.length > MAX_BELIEFS) {
    all.sort((a, b) => a[1].strength - b[1].strength);
    for (const [k, b] of all.slice(0, all.length - MAX_BELIEFS)) {
      delete r.beliefs[k];
      ctx.emit({ t: tick, type: 'belief_faded', who: r.id, subject: b.subject, aspect: b.aspect });
    }
  }

  // 5. The day's episodes join long-term memory; the weakest and oldest are forgotten.
  for (const ep of r.buffer) if (ep.source !== 'recalled') r.episodes.push(ep);
  if (r.episodes.length > MAX_EPISODES) {
    const score = (e: Episode) => e.intensity * Math.pow(0.97, (tick - e.tick) / 1440);
    r.episodes.sort((a, b) => score(b) - score(a));
    r.episodes.length = MAX_EPISODES;
    r.episodes.sort((a, b) => a.tick - b.tick);
  }
  r.buffer = [];
}
