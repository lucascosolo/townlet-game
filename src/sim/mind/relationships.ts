// Directed relationships (spec 4.2.5). The steward is a node like any resident.

import { clamp } from '../needs.js';
import { STEWARD, TRAITS, VALUES, type Relationship, type RelTag, type ResidentDef, type ResidentState } from '../types.js';
import type { MindContext } from './mind.js';
import { opinion } from './memory.js';

/** The most a single night's dealings with the steward can move standing, each way. */
/**
 * Bar round 2: good news moves standing two thirds as far as it did (0.3), so nobody thinks the
 * world of you by day 3; a kindness lands twice as hard on someone thinking of leaving, so the
 * window to turn them round stays open.
 */
export const STEWARD_NIGHT_CAP = { good: 0.2, bad: 0.6 } as const;

export function newRelationship(): Relationship {
  return { affinity: 0.1, familiarity: 0.3, trust: 0.4, lastContact: -1, lastArgue: -1, tags: [] };
}

/** How well two personalities fit, [0, 1]: half trait similarity, half shared values. */
export function compatibility(a: ResidentDef, b: ResidentDef): number {
  const td = TRAITS.reduce((s, t) => s + Math.abs(a.traits[t] - b.traits[t]), 0) / (TRAITS.length * 2);
  const vd = VALUES.reduce((s, v) => s + Math.abs(a.values[v] - b.values[v]), 0) / VALUES.length;
  return 1 - 0.5 * td - 0.5 * vd;
}

/**
 * Scale for affinity gained from pleasant exchanges. Well-matched pairs warm quickly; poorly
 * matched pairs barely warm, or cool slightly, however often they chat.
 */
export function warmth(a: ResidentDef, b: ResidentDef): number {
  return (compatibility(a, b) - 0.55) * 3;
}

export function rel(r: ResidentState, other: string): Relationship {
  let x = r.rel[other];
  if (!x) r.rel[other] = x = newRelationship();
  return x;
}

export function adjust(
  r: ResidentState,
  other: string,
  d: { affinity?: number; familiarity?: number; trust?: number },
  tick?: number,
): void {
  const x = rel(r, other);
  if (d.affinity) x.affinity = clamp(x.affinity + d.affinity, -1, 1);
  if (d.familiarity) x.familiarity = clamp(x.familiarity + d.familiarity);
  if (d.trust) x.trust = clamp(x.trust + d.trust);
  if (tick !== undefined) x.lastContact = tick;
}

/** Tags with hysteresis: a tag is gained at one threshold and lost only well below it. */
function tagsFor(x: Relationship): RelTag[] {
  const had = (t: RelTag) => x.tags.includes(t);
  const tags: RelTag[] = [];
  const margin = (t: RelTag) => (had(t) ? 0.08 : 0);
  if (x.affinity >= 0.45 - margin('friend') && x.familiarity >= 0.45 - margin('friend')) tags.push('friend');
  if (x.affinity >= 0.7 - margin('close_friend') && x.familiarity >= 0.7 - margin('close_friend')) tags.push('close_friend');
  if (x.affinity <= -0.35 + margin('rival') && x.familiarity >= 0.3 - margin('rival')) tags.push('rival');
  return tags;
}

/**
 * Overnight relationship drift: beliefs about a person pull affinity toward them, affinity
 * relaxes toward neutral, familiarity fades without contact. The steward's affinity and trust
 * follow the resident's opinion of the steward.
 */
export function nightlyRelationships(ctx: MindContext, r: ResidentState, stewardEvidence = 0): void {
  for (const [other, x] of Object.entries(r.rel)) {
    if (other === STEWARD) {
      // The steward's standing: today's dealings move it directly; settled beliefs lean on it;
      // with nothing happening it relaxes slowly back toward a mild default.
      // Bar round 1: a night's evidence is capped, bad news weighing twice as much as good, so one
      // answered ask no longer makes a devotee overnight and a felled oak costs more than a bed of
      // flowers earns; and standing relaxes faster when nothing happens.
      const op = opinion(r, STEWARD);
      // The first week, trust is earned more slowly still (bar round 3: "you have earned my trust" on day 2).
      const firstWeek = ctx.tick < 7 * 1440;
      const ev = clamp(stewardEvidence, -STEWARD_NIGHT_CAP.bad, (firstWeek ? 0.14 : STEWARD_NIGHT_CAP.good) * (r.leaving ? 2 : 1));
      x.affinity = clamp(x.affinity + 0.05 * (0.2 - x.affinity) + 0.5 * ev + 0.03 * op, -1, 1);
      x.trust = clamp(x.trust + 0.04 * (0.5 - x.trust) + 0.3 * ev + 0.02 * op);
      continue;
    }
    // Left alone, affinity settles toward how well the two fit: kindred spirits warm, poor
    // matches cool a little. Beliefs about the person push on top of that.
    const baseline = (compatibility(ctx.def(r.id), ctx.def(other)) - 0.6) * 1.5;
    // A grudge doesn't fade overnight: for a week after words, nothing warms them back up on its
    // own (M4: arguments were smoothed away so fast that rivalries almost never formed).
    const sore = x.lastArgue >= 0 && ctx.tick - x.lastArgue < 7 * 1440;
    const drift = 0.03 * (baseline - x.affinity);
    x.affinity = clamp(x.affinity + (sore ? Math.min(0, drift) : drift) + 0.06 * opinion(r, `r:${other}`), -1, 1);
    if (x.lastContact < ctx.tick - 1440) x.familiarity *= 0.99;
    const tags = tagsFor(x);
    const added = tags.filter((t) => !x.tags.includes(t));
    const removed = x.tags.filter((t) => !tags.includes(t));
    if (added.length || removed.length) {
      x.tags = tags;
      ctx.emit({ t: ctx.tick, type: 'relationship', who: r.id, other, added, removed });
    }
  }
}
