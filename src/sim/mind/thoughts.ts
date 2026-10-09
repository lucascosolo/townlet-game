// What is on a resident's mind (M3a, "talk that honestly relays their mind state"). Topics are
// drawn only from the resident's actual state and ranked by how much each matters right now.
// Thoughts and everyday chat are chosen from the top three, never invented.

import { buildingDef } from '../../content/buildings.js';
import { residentDef } from '../../content/residents.js';
import { companyOvershoot, urgency } from '../needs.js';
import { TICKS_PER_DAY, dayOf } from '../time.js';
import { weighted, type RngHolder } from '../rng.js';
import { NEEDS, STEWARD, type MindMention, type ResidentState, type SimState, type SubjectId } from '../types.js';
import { nextStep } from '../story/aspirations.js';

export interface MindTopic {
  /** What kind of thing it is: "need:food", "feel:annoyance", "dream", "grudge"... */
  key: string;
  /** Who or what it is about, if anyone. */
  about?: SubjectId;
  /** How much it matters right now. */
  weight: number;
  /** Words the lines can use. */
  vars: Record<string, string>;
  /** Why it is on their mind, for the journal. */
  reason: string;
}

const NAME = (id: string) => residentDef(id).name;

function subjectWord(state: SimState, s: SubjectId): string {
  if (s === STEWARD) return 'the steward';
  if (s.startsWith('r:')) return NAME(s.slice(2));
  if (s.startsWith('m:')) return state.story.memories.find((m) => m.id === Number(s.slice(2)))?.label ?? 'that day';
  const b = state.buildings.find((x) => x.id === Number(s.slice(2)));
  return b ? (b.type === 'oak' ? 'the old oak' : `the ${buildingDef(b.type).name.toLowerCase()}`) : 'that place';
}

/** "win the town over with his bread" -> "... with my bread". */
export function firstPerson(step: string): string {
  return step.replace(/\b(his|her|their)\b/g, 'my');
}

/** Everything on a resident's mind, most pressing first. */
export function mindTopics(state: SimState, r: ResidentState): MindTopic[] {
  const def = residentDef(r.id);
  const tick = state.tick;
  const topics: MindTopic[] = [];

  if (r.leaving) topics.push({ key: 'leaving', weight: 1.2, vars: {}, reason: `thinking of leaving since day ${r.leaving.sinceDay}` });

  for (const n of NEEDS) {
    const u = urgency(r.needs[n], r.setpoints[n]);
    // A resident with a job who still feels idle wants something of their own, not "a job".
    if (u > 0.35) topics.push({ key: n === 'purpose' && r.jobId !== null ? 'need:purpose_job' : `need:${n}`, weight: 1.2 * u, vars: {}, reason: `${n} is running ${u > 0.7 ? 'very ' : ''}low` });
  }
  const crowd = companyOvershoot(r.needs.company, r.setpoints.company, def);
  if (crowd > 0.1) topics.push({ key: 'need:crowded', weight: 0.8 + crowd, vars: {}, reason: 'too much company for their liking' });

  for (const e of r.emotions) {
    if (e.intensity < 0.15) continue;
    const about = e.target;
    topics.push({
      key: `feel:${e.kind}`,
      ...(about ? { about } : {}),
      weight: 1.4 * e.intensity,
      vars: { x: about ? subjectWord(state, about) : '' },
      reason: `${e.intensity > 0.6 ? 'strong ' : ''}${e.kind}${about ? ` about ${subjectWord(state, about)}` : ''}`,
    });
  }

  const step = nextStep(state, r);
  if (step) {
    const fresh = tick - r.aspiration.since < TICKS_PER_DAY;
    const waiting = state.requests.some((q) => q.by === r.id && q.kind === 'aspiration' && q.status === 'open');
    topics.push({ key: waiting ? 'dream:waiting' : 'dream', weight: 0.45 + (fresh ? 0.3 : 0) + (waiting ? 0.25 : 0), vars: { next: firstPerson(step.charAt(0).toLowerCase() + step.slice(1)) }, reason: waiting ? 'waiting on you' : 'what they are working towards' });
  }

  const festival = state.story.gatherings.find((g) => g.kind === 'festival' && g.from > tick && g.from - tick < TICKS_PER_DAY);
  if (festival) topics.push({ key: 'festival_soon', weight: 0.35 + 0.4 * def.values.community, vars: { label: festival.label }, reason: `${festival.label} is coming` });

  const w = state.story.weather;
  if (w.kind !== 'clear' && tick < w.until) topics.push({ key: `weather:${w.kind}`, weight: w.kind === 'storm' ? 0.7 : 0.3, vars: {}, reason: `the ${w.kind}` });

  // People: a friend not seen for a while, a fresh grudge.
  for (const [id, x] of Object.entries(r.rel)) {
    if (id === STEWARD || state.residents[id]?.departed) continue;
    if (x.tags.includes('friend') && tick - x.lastContact > TICKS_PER_DAY) {
      topics.push({ key: 'miss_friend', about: `r:${id}`, weight: 0.25 + 0.35 * x.affinity, vars: { x: NAME(id) }, reason: `hasn't seen ${NAME(id)} since day ${dayOf(Math.max(0, x.lastContact))}` });
    }
    if (x.lastArgue >= 0 && tick - x.lastArgue < 2 * TICKS_PER_DAY) {
      topics.push({ key: 'grudge', about: `r:${id}`, weight: 0.7, vars: { x: NAME(id) }, reason: `an argument with ${NAME(id)} on day ${dayOf(x.lastArgue)}` });
    } else if (x.tags.includes('rival')) {
      topics.push({ key: 'grudge', about: `r:${id}`, weight: 0.4, vars: { x: NAME(id) }, reason: `not getting on with ${NAME(id)}` });
    }
  }

  // The steward is on their mind when their view has moved lately, not just because it is high
  // (review: a quarter of everything said was about the steward, mostly settled praise).
  const standing = r.rel.steward?.affinity ?? 0;
  const moved = standing - (r.standingLog?.[0] ?? 0);
  if (Math.abs(standing) > 0.35 && Math.abs(moved) > 0.08) {
    topics.push({ key: standing > 0 ? 'steward:+' : 'steward:-', about: STEWARD, weight: 0.12 + 0.12 * Math.abs(standing) + 1.2 * Math.abs(moved), vars: {}, reason: standing > 0 ? 'how the steward has treated them' : 'how the steward has let them down' });
  }

  // Something you did to them in the last two days is on their mind whatever they think of you
  // overall (bar round 2): the day after you felled their oak, that is what they bring up.
  const fresh = freshGrievance(r, tick);
  if (fresh) topics.push({ key: 'steward:fresh', about: STEWARD, weight: 0.6 + 0.4 * fresh.weight, vars: { x: fresh.note, aspect: fresh.aspect }, reason: `what the steward did: ${fresh.note}` });

  // A belief formed in the last two days is still news to them.
  for (const b of Object.values(r.beliefs)) {
    // Their view of the steward has its own topic.
    if (tick - b.formedTick > 2 * TICKS_PER_DAY || b.subject === STEWARD) continue;
    const person = b.subject.startsWith('r:');
    topics.push({ key: `belief${person ? '_person' : ''}:${b.valence >= 0 ? '+' : '-'}`, about: b.subject, weight: 0.4 + 0.3 * b.strength, vars: { x: subjectWord(state, b.subject), aspect: b.aspect }, reason: `newly decided something about ${subjectWord(state, b.subject)}` });
  }

  if (state.stock.food < 3) topics.push({ key: 'larder', weight: 0.65, vars: {}, reason: 'the larder is nearly empty' });

  topics.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  return topics;
}

/** The top few: what a thought or a chat may draw on. */
export function topOfMind(state: SimState, r: ResidentState, n = 3): MindTopic[] {
  return mindTopics(state, r).slice(0, n);
}


/** Not voiced again for this long. */
export const THOUGHT_REPEAT = 6 * 60;

/**
 * Pick something from the top three to voice, weighted by how much it matters, skipping what
 * they voiced in the last few hours. Marks it as voiced. Null when nothing is on their mind.
 */
export function voiceTopic(state: SimState, r: ResidentState, listener?: string, rng: RngHolder = r): MindMention | null {
  const recent = (r.lastThoughts ??= {});
  const top = topOfMind(state, r, 3).map((t, rank) => ({ t, rank }));
  // Nobody tells you, to your face, what they think of you in the third person.
  const fresh = top.filter(({ t }) => state.tick - (recent[topicId(t)] ?? -Infinity) >= (t.about === STEWARD ? TICKS_PER_DAY : THOUGHT_REPEAT) && (!listener || t.about !== `r:${listener}`));
  const chosen = weighted(rng, fresh, ({ t }) => t.weight);
  if (!chosen) return null;
  recent[topicId(chosen.t)] = state.tick;
  for (const [k, v] of Object.entries(recent)) if (state.tick - v > TICKS_PER_DAY) delete recent[k];
  const { t, rank } = chosen;
  return { key: t.key, ...(t.about ? { about: t.about } : {}), vars: t.vars, rank };
}

function topicId(t: MindTopic): string {
  return t.about ? `${t.key}|${t.about}` : t.key;
}

/** The freshest bad turn the steward did them in the last two days: its note in their words, if any. */
export function freshGrievance(r: ResidentState, tick: number): { aspect: string; note: string; weight: number } | null {
  let best: { aspect: string; note: string; weight: number; tick: number } | null = null;
  const consider = (aspect: string, valence: number, sources: Array<{ tick: number; note: string; weight: number; kind?: string }>, size: number) => {
    if (valence >= 0) return;
    for (const src of sources) {
      // Telling you about it is not something you did (bar round 3: "you told you about it").
      if (tick - src.tick >= 2 * TICKS_PER_DAY || (src as { kind?: string }).kind === 'recalled') continue;
      // The one that weighs most, not merely the latest: a felled oak outweighs this morning's small pang.
      // A source's weight is signed (feeling times intensity); its size is what counts here.
      const weight = Math.min(1, size * Math.abs(src.weight));
      if (!best || weight > best.weight || (weight === best.weight && src.tick > best.tick)) best = { aspect, note: src.note, weight, tick: src.tick };
    }
  };
  for (const b of Object.values(r.beliefs)) if (b.subject === STEWARD) consider(b.aspect, b.valence, b.sources, b.strength);
  for (const t of Object.values(r.traces)) if (t.subject === STEWARD) consider(t.aspect, t.evidence, t.sources, Math.abs(t.evidence));
  return best;
}
