// Talking to a resident (M3b criterion 4): a few fixed questions, answered from what the
// resident actually holds. The answer is data; the narrator gives it their voice. Talking is a
// steward action: the first talk of the day is a little company for them, and a little
// acquaintance with the steward; asking again the same day changes nothing.

import { attachment, opinion } from './mind/memory.js';
import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { ambientPrefs } from './needs.js';
import { townHunger } from './hunger.js';
import { freshGrievance } from './mind/thoughts.js';
import { TICKS_PER_DAY } from './time.js';
import { rel } from './mind/relationships.js';
import { topOfMind } from './mind/thoughts.js';
import { dreamTitle, nextStep } from './story/aspirations.js';
import { STEWARD, type Belief, type ResidentState, type SimState, type SubjectId, type TalkAnswer, type TalkQuestion } from './types.js';

export function moodBand(mood: number): string {
  return mood >= 0.8 ? 'great' : mood >= 0.65 ? 'good' : mood >= 0.5 ? 'fair' : mood >= 0.35 ? 'low' : 'bad';
}

export function feelingBand(v: number): string {
  return v > 0.3 ? 'love' : v > 0.05 ? 'like' : v >= -0.05 ? 'neutral' : v >= -0.3 ? 'dislike' : 'hate';
}

/**
 * The reason behind a feeling: the strongest belief about the subject, or a trace still forming.
 * Bar round 2: the reason has the feeling's sign (no "I am grateful... you still irritate me"),
 * and something fresh (a source in the last two days) counts double, so the day after you felled
 * their oak that is what they bring up, not an old settled view.
 */
function strongestBelief(r: ResidentState, subject: SubjectId, skip: Record<string, number> = {}, sign = 0, now = 0): Pick<Belief, 'subject' | 'aspect' | 'valence'> | undefined {
  const fresh = (sources: Array<{ tick: number }>) => sources.some((x) => now - x.tick < 2 * TICKS_PER_DAY);
  const all: Array<{ subject: SubjectId; aspect: string; valence: number; weight: number }> = [
    ...Object.values(r.beliefs)
      .filter((b) => b.subject === subject)
      .map((b) => ({ subject: b.subject, aspect: b.aspect, valence: b.valence, weight: b.strength * Math.abs(b.valence) * (fresh(b.sources) ? 2 : 1) })),
    ...Object.values(r.traces)
      .filter((t) => t.subject === subject && !r.beliefs[`${t.subject}|${t.aspect}`] && Math.abs(t.evidence) > 0.1)
      .map((t) => ({ subject: t.subject, aspect: t.aspect, valence: Math.sign(t.evidence), weight: 0.5 * Math.abs(t.evidence) * (fresh(t.sources) ? 2 : 1) })),
  ]
    .filter((b) => sign === 0 || Math.sign(b.valence) === sign)
    .sort((a, b) => b.weight - a.weight);
  // One not given as the reason lately, if there is one (bar round 1: "you listen" every day).
  return all.find((b) => skip[b.aspect] === undefined) ?? all[0];
}

/** The sign a reason must have to fit a feeling: none when the feeling is neutral. */
const reasonSign = (v: number) => (v > 0.05 ? 1 : v < -0.05 ? -1 : 0);

/** How a resident feels about someone or something, for "what do you think of…": people by affinity and belief, places by belief. */
/** Where a neighbour's affinity starts to mean liking them (bar round 4). */
export const PERSON_BASELINE = 0.2;

export function feelingAbout(r: ResidentState, subject: SubjectId, now: number, state?: SimState): number {
  if (subject === STEWARD) return rel(r, STEWARD).affinity;
  if (subject.startsWith('r:')) {
    const x = r.rel[subject.slice(2)];
    // Bar round 4: measured from where acquaintance starts (0.1 to 0.2), not from zero, so someone
    // you merely tolerate does not read as "I like the way Rosa sees things".
    const v = ((x?.affinity ?? 0) - PERSON_BASELINE) * 0.7 + opinion(r, subject) * 0.3;
    // A fresh argument colours the answer, whatever the long view (review: "something went sour
    // between me and Ada" one day, "I haven't felt anything about Ada yet" the next).
    return x && x.lastArgue >= 0 && now - x.lastArgue < 2 * TICKS_PER_DAY ? Math.min(v, -0.1) : v;
  }
  // A place: what they have decided, half of what they are still deciding, and their taste for
  // what it is (bar round 3: nine in ten answers about places were "no view").
  return Math.max(-1, Math.min(1, attachment(r, subject) + (state ? taste(state, r, subject) : 0)));
}

/**
 * A first leaning about a building from what someone values: what it gives off against what they
 * like (green, quiet, bustle...), and its kind against their values. Small: a first impression
 * that experience soon outweighs. Steady across days, so the same person says the same thing.
 */
export function taste(state: SimState, r: ResidentState, subject: SubjectId): number {
  if (!subject.startsWith('b:')) return 0;
  const b = state.buildings.find((x) => `b:${x.id}` === subject);
  if (!b || b.removed) return 0;
  const def = buildingDef(b.type);
  const rd = residentDef(r.id);
  const prefs = ambientPrefs(rd);
  const e = def.emits ?? {};
  let v = 0;
  for (const q of Object.keys(e) as Array<keyof typeof prefs>) v += (e[q] ?? 0) * (prefs[q] ?? 0);
  const kindValue: Record<string, number> = { work: rd.values.craft + 0.5 * rd.values.prosperity - 0.6, social: rd.values.community - 0.4, nature: rd.values.nature - 0.3, decor: rd.values.beauty - 0.3 };
  v += 0.5 * (kindValue[def.kind] ?? 0);
  return Math.max(-0.25, Math.min(0.25, 0.4 * v));
}

/** What someone between dreams is enjoying meanwhile: a favourite place, else a friend, else the quiet (bar round 4). */
export function meanwhile(state: SimState, r: ResidentState): string {
  const fav = Object.values(r.beliefs)
    .filter((b) => b.subject.startsWith('b:') && b.valence > 0)
    .sort((a, b) => b.strength - a.strength)
    .map((b) => state.buildings.find((x) => `b:${x.id}` === b.subject && !x.removed))
    .find((b) => !!b);
  if (fav) return `the ${buildingDef(fav.type).name.toLowerCase()}`;
  const friend = Object.entries(r.rel)
    .filter(([id, x]) => id !== STEWARD && x.tags.includes('friend') && !state.residents[id]?.departed)
    .sort((a, b) => b[1].affinity - a[1].affinity)[0];
  if (friend) return `time with ${residentDef(friend[0]).name}`;
  return 'the quiet';
}

export function talkAnswer(state: SimState, r: ResidentState, question: TalkQuestion, about?: SubjectId): TalkAnswer {
  const top = topOfMind(state, r, 3).map((t, rank) => ({ key: t.key, ...(t.about ? { about: t.about } : {}), vars: t.vars, rank }));
  switch (question) {
    case 'how': {
      // Asked by someone who has let them down badly, "how are you" is no better than fair, and
      // says why (bar round 2: the page said "unhappy with you" while the mouth said "rather good spirits").
      const sour = rel(r, STEWARD).affinity < -0.5;
      // Hungry two days running, or in a town going short: no better than fair, and they say why (bar round 3).
      const day = Math.floor(state.tick / TICKS_PER_DAY) + 1;
      const hungry = ((r.hungryRun ?? 0) >= 2 && (r.lastHungryDay ?? -9) >= day - 1) || townHunger(state) >= 0.12;
      const band = moodBand(r.mood);
      const capped = (sour || hungry) && (band === 'good' || band === 'great');
      const reason = hungry ? { key: 'larder', vars: {}, rank: 0 } : { key: 'steward:-', about: STEWARD as SubjectId, vars: {}, rank: 0 };
      const rest = top.filter((t) => !(hungry && (t.key === 'feel:joy' || t.key === 'larder')));
      const topics = capped || hungry ? [reason, ...rest.slice(0, 1).map((t) => ({ ...t, rank: 1 }))].slice(0, hungry && !capped ? 1 : 2) : top.slice(0, 1);
      return {
        question,
        band: capped ? 'fair' : band,
        value: capped ? Math.min(r.mood, 0.6) : r.mood,
        topics,
        ...(r.moodArc ? { mood: { kind: r.moodArc.kind, reason: r.moodArc.reason } } : {}),
      };
    }
    case 'mind':
      // Two things at most (bar round 3: six- and ten-sentence answers).
      return { question, topics: top.slice(0, 2) };
    case 'hope':
      // Between dreams they say what they are enjoying meanwhile (bar round 4: "I did it, you know!" eight times).
      return { question, hope: { title: dreamTitle(state, r) ?? '', next: nextStep(state, r), done: r.aspiration.done, ...(r.aspiration.outcome ? { outcome: r.aspiration.outcome } : {}), ...(r.aspiration.done ? { meanwhile: meanwhile(state, r) } : {}) } };
    case 'opinion': {
      const subject = about ?? STEWARD;
      const v = feelingAbout(r, subject, state.tick, state);
      const b = strongestBelief(r, subject, {}, reasonSign(v), state.tick);
      // Someone known well and not liked is cool, not "no view" (bar round 4).
      let band = feelingBand(v);
      if (band === 'neutral' && subject.startsWith('r:') && (r.rel[subject.slice(2)]?.familiarity ?? 0) >= 0.5) band = 'cool';
      return { question, about: subject, band, value: v, ...(b ? { because: { subject: b.subject, aspect: b.aspect } } : {}) };
    }
    case 'me': {
      const v = feelingAbout(r, STEWARD, state.tick);
      const b = strongestBelief(r, STEWARD, r.cited ?? {}, reasonSign(v), state.tick);
      // A kind view still concedes a fresh wrong (bar round 2): "I think well of you, though you felled the oak".
      const fresh = reasonSign(v) >= 0 ? freshGrievance(r, state.tick) : null;
      return { question, about: STEWARD, band: feelingBand(v), value: v, ...(b ? { because: { subject: b.subject, aspect: b.aspect } } : {}), ...(fresh ? { but: { aspect: fresh.aspect, note: fresh.note } } : {}) };
    }
  }
}

/**
 * An answer agrees with itself (bar round 1): someone who says they are wonderful does not add a
 * grievance about you in the same breath, and someone low does not add joy. Drops the topics
 * that contradict the band; says whether a memory of the given feeling would fit.
 */
export function reconcile(answer: TalkAnswer): TalkAnswer {
  const band = answer.band ?? '';
  const sunny = band === 'great' || band === 'good' || band === 'love' || band === 'like';
  const dark = band === 'low' || band === 'bad' || band === 'dislike' || band === 'hate';
  if (answer.topics && (sunny || dark)) {
    answer.topics = answer.topics.filter((t) => {
      if (sunny && (t.key === 'steward:-' || t.key === 'steward:fresh' || (t.about === STEWARD && /^feel:(annoyance|grief|worry)/.test(t.key)))) return false;
      if (dark && (t.key === 'feel:joy' || t.key === 'steward:+' || (t.about === STEWARD && t.key === 'feel:gratitude'))) return false;
      return true;
    });
  }
  // Someone well does not lead with a worry, a want or the larder (bar round 3: "On top of the
  // world, me! Larder emergency!"); and joy and hunger never share an answer.
  if (answer.topics && answer.question === 'how' && sunny) answer.topics = answer.topics.filter((t) => !/^(need:|larder|feel:(worry|grief|loneliness|annoyance))/.test(t.key));
  if (answer.topics && answer.topics.some((t) => t.key === 'feel:joy') && answer.topics.some((t) => t.key === 'larder' || t.key === 'need:food')) {
    const first = answer.topics.find((t) => t.key === 'feel:joy' || t.key === 'larder' || t.key === 'need:food')!;
    answer.topics = answer.topics.filter((t) => t === first || !(t.key === 'feel:joy' || t.key === 'larder' || t.key === 'need:food'));
  }
  // One feeling per subject in one breath (bar round 2: "I am grateful to you... you still
  // irritate me"): where two topics about the same thing pull opposite ways, the higher-ranked one stays.
  if (answer.topics) {
    const seen = new Map<string, number>();
    answer.topics = answer.topics.filter((t) => {
      const sign = topicSign(t.key);
      const subject = t.about ?? '';
      if (!subject || sign === 0) return true;
      const prior = seen.get(subject);
      if (prior !== undefined && prior !== sign) return false;
      seen.set(subject, sign);
      return true;
    });
  }
  return answer;
}

/** Which way a mind topic leans about its subject, or 0 for a plain observation. */
export function topicSign(key: string): number {
  if (key === 'steward:+' || key === 'belief:+' || key === 'belief_person:+' || /^feel:(joy|gratitude|pride)/.test(key)) return 1;
  if (key === 'steward:-' || key === 'steward:fresh' || key === 'belief:-' || key === 'belief_person:-' || key === 'grudge' || /^feel:(annoyance|worry|grief|loneliness)/.test(key)) return -1;
  return 0;
}

/** Whether a memory about any subject agrees with what the answer already says about it (bar round 2). */
export function memoryAgrees(answer: TalkAnswer, memory: { subject: SubjectId; valence: number }): boolean {
  const sign = Math.sign(memory.valence);
  if (sign === 0) return true;
  for (const t of answer.topics ?? []) if (t.about === memory.subject && topicSign(t.key) !== 0 && topicSign(t.key) !== sign) return false;
  // "Bram is pleasant company" does not go on "it still weighs on me that Bram and I argued".
  if (answer.about === memory.subject && answer.band) {
    const bandSign = ['love', 'like'].includes(answer.band) ? 1 : ['dislike', 'hate'].includes(answer.band) ? -1 : 0;
    if (bandSign !== 0 && bandSign !== sign) return false;
  }
  return true;
}

/** Whether a memory about the steward with this feeling fits the answer's band. */
export function memoryFits(answer: TalkAnswer, memory: { subject: SubjectId; valence: number }): boolean {
  if (memory.subject !== STEWARD) return true;
  const band = answer.band ?? '';
  const sunny = band === 'great' || band === 'good' || band === 'love' || band === 'like';
  const dark = band === 'low' || band === 'bad' || band === 'dislike' || band === 'hate';
  if (sunny && memory.valence < 0) return false;
  if (dark && memory.valence > 0) return false;
  return true;
}
