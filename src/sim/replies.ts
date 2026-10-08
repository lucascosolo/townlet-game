// Talking back (bar round 1, 2026-10-08): after a resident answers, the steward can reply in one
// of four ways. Each reply is a logged command, lands differently depending on who is listening,
// and is remembered like anything else. Which replies are offered is a pure function of what the
// resident holds, so the same conversation replays the same.

import { residentDef } from '../content/residents.js';
import { beliefKey } from './mind/memory.js';
import { adjust } from './mind/relationships.js';
import { TICKS_PER_DAY } from './time.js';
import { STEWARD, type ResidentState, type SimState, type TalkAnswer } from './types.js';

export type ReplyKind = 'agree' | 'disagree' | 'sorry' | 'explain';

/** How the reply landed, which picks the resident's response. */
export type ReplyStance = 'warm' | 'respect' | 'sulk' | 'forgiven' | 'enough' | 'convinced' | 'unconvinced' | 'puzzled';

export interface ReplyOffer {
  kind: ReplyKind;
  /** For sorry and explain: the grievance it answers (a belief or trace key about the steward). */
  aspect?: string;
}

/** Grievances about a decision, which an explanation can answer. */
const DECISION_GRIEVANCES = new Set(['turned_me_down', 'decided_badly', 'ignores_me']);
/** A second sorry for the same thing within this long changes nothing. */
export const SORRY_GAP = 3 * TICKS_PER_DAY;

/** Everything they hold against the steward, strongest first: settled beliefs and feelings still forming. */
export function grievances(r: ResidentState, now = 0): Array<{ aspect: string; weight: number; settled: boolean; last: number }> {
  const out: Array<{ aspect: string; weight: number; settled: boolean; last: number }> = [];
  const lastOf = (sources: Array<{ tick: number }>) => sources.reduce((m, x) => Math.max(m, x.tick), -1);
  for (const b of Object.values(r.beliefs)) if (b.subject === STEWARD && b.valence < -0.1) out.push({ aspect: b.aspect, weight: b.strength * -b.valence, settled: true, last: Math.max(b.reinforcedTick, lastOf(b.sources)) });
  for (const t of Object.values(r.traces)) if (t.subject === STEWARD && t.evidence < -0.1) out.push({ aspect: t.aspect, weight: -t.evidence * 0.5, settled: false, last: lastOf(t.sources) });
  // Something that happened in the last three days comes first: a sorry is for what is fresh.
  const fresh = (g: { last: number }) => (now - g.last < 3 * TICKS_PER_DAY ? 1 : 0);
  return out.sort((a, b) => fresh(b) - fresh(a) || b.weight - a.weight);
}

/** The replies open after this answer. Agree is always open; the rest only when there is something to answer. */
export function offersFor(r: ResidentState, answer: TalkAnswer, now = 0): ReplyOffer[] {
  const offers: ReplyOffer[] = [{ kind: 'agree' }];
  const voiced = (answer.question === 'opinion' || answer.question === 'me') && answer.band !== 'neutral';
  const aboutYou = answer.topics?.some((t) => t.about === STEWARD) || answer.memory?.subject === STEWARD;
  if (voiced || aboutYou) offers.push({ kind: 'disagree' });
  const held = grievances(r, now);
  const sorry = held[0];
  if (sorry) offers.push({ kind: 'sorry', aspect: sorry.aspect });
  const decision = held.find((g) => DECISION_GRIEVANCES.has(g.aspect));
  if (decision) offers.push({ kind: 'explain', aspect: decision.aspect });
  return offers;
}

export interface ReplyResult {
  stance: ReplyStance;
  aspect?: string;
}

/** Weaken a grievance about the steward: the belief if settled, the trace if still forming. */
function soften(r: ResidentState, aspect: string, keep: number): void {
  const k = beliefKey(STEWARD, aspect);
  const b = r.beliefs[k];
  if (b) b.strength *= keep;
  const t = r.traces[k];
  if (t) {
    t.evidence *= keep;
    t.sumI *= keep;
  }
}

/**
 * Apply a reply. `perceive` records what they make of it, in their own memory, so it can be
 * retold. Returns how it landed, or null when the reply wasn't open to them.
 */
export function applyReply(
  state: SimState,
  r: ResidentState,
  kind: ReplyKind,
  offers: ReplyOffer[],
  perceive: (p: { aspect: string; valence: number; base: number; note: string }) => void,
): ReplyResult | null {
  const offer = offers.find((o) => o.kind === kind);
  if (!offer) return null;
  const def = residentDef(r.id);
  const steady = def.traits.steady > 0 || def.voice.register === 'formal' || def.voice.register === 'plain';
  const tick = state.tick;
  switch (kind) {
    case 'agree':
      adjust(r, STEWARD, { familiarity: 0.03, affinity: 0.02 }, tick);
      perceive({ aspect: 'heard_me_out', valence: 0.4, base: 0.25, note: 'heard me out' });
      return { stance: 'warm' };
    case 'disagree':
      if (steady) {
        adjust(r, STEWARD, { trust: 0.05, familiarity: 0.03 }, tick);
        perceive({ aspect: 'spoke_plainly', valence: 0.3, base: 0.3, note: 'spoke plainly to me' });
        return { stance: 'respect' };
      }
      adjust(r, STEWARD, { affinity: -0.05, familiarity: 0.02 }, tick);
      perceive({ aspect: 'argued_with_me', valence: -0.4, base: 0.35, note: 'argued with me' });
      return { stance: 'sulk' };
    case 'sorry': {
      const aspect = offer.aspect as string;
      const last = r.sorryFor?.[aspect];
      if (last !== undefined && tick - last < SORRY_GAP) return { stance: 'enough', aspect };
      (r.sorryFor ??= {})[aspect] = tick;
      // An apology clears the air: everything fresh softens most, older grievances a little.
      for (const g of grievances(r, tick)) soften(r, g.aspect, tick - g.last < 3 * TICKS_PER_DAY ? 0.6 : 0.85);
      adjust(r, STEWARD, { affinity: 0.06, trust: 0.03 }, tick);
      perceive({ aspect: 'made_amends', valence: 0.6, base: 0.5, note: 'said sorry' });
      return { stance: 'forgiven', aspect };
    }
    case 'explain': {
      const aspect = offer.aspect as string;
      const trusts = (r.rel[STEWARD]?.trust ?? 0) > 0.4;
      if (!trusts) {
        perceive({ aspect: 'excuses', valence: -0.2, base: 0.2, note: 'made excuses to me' });
        return { stance: 'unconvinced', aspect };
      }
      soften(r, aspect, 0.5);
      adjust(r, STEWARD, { trust: 0.02 }, tick);
      perceive({ aspect: 'explained', valence: 0.3, base: 0.3, note: 'explained the decision to me' });
      return { stance: 'convinced', aspect };
    }
  }
}
