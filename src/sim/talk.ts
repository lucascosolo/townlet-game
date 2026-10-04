// Talking to a resident (M3b criterion 4): a few fixed questions, answered from what the
// resident actually holds. The answer is data; the narrator gives it their voice. Talking is a
// steward action: the first talk of the day is a little company for them, and a little
// acquaintance with the steward; asking again the same day changes nothing.

import { opinion } from './mind/memory.js';
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

function strongestBelief(r: ResidentState, subject: SubjectId): Belief | undefined {
  return Object.values(r.beliefs)
    .filter((b) => b.subject === subject)
    .sort((a, b) => b.strength * Math.abs(b.valence) - a.strength * Math.abs(a.valence))[0];
}

/** How a resident feels about someone or something, for "what do you think of…": people by affinity and belief, places by belief. */
export function feelingAbout(r: ResidentState, subject: SubjectId, now: number): number {
  if (subject === STEWARD) return rel(r, STEWARD).affinity;
  if (subject.startsWith('r:')) {
    const x = r.rel[subject.slice(2)];
    const v = (x?.affinity ?? 0) * 0.7 + opinion(r, subject) * 0.3;
    // A fresh argument colours the answer, whatever the long view (review: "something went sour
    // between me and Ada" one day, "I haven't felt anything about Ada yet" the next).
    return x && x.lastArgue >= 0 && now - x.lastArgue < 2 * TICKS_PER_DAY ? Math.min(v, -0.1) : v;
  }
  return opinion(r, subject);
}

export function talkAnswer(state: SimState, r: ResidentState, question: TalkQuestion, about?: SubjectId): TalkAnswer {
  const top = topOfMind(state, r, 3).map((t, rank) => ({ key: t.key, ...(t.about ? { about: t.about } : {}), vars: t.vars, rank }));
  switch (question) {
    case 'how':
      return {
        question,
        band: moodBand(r.mood),
        value: r.mood,
        topics: top.slice(0, 1),
        ...(r.moodArc ? { mood: { kind: r.moodArc.kind, reason: r.moodArc.reason } } : {}),
      };
    case 'mind':
      return { question, topics: top };
    case 'hope':
      return { question, hope: { title: dreamTitle(state, r) ?? '', next: nextStep(state, r), done: r.aspiration.done } };
    case 'opinion': {
      const subject = about ?? STEWARD;
      const v = feelingAbout(r, subject, state.tick);
      const b = strongestBelief(r, subject);
      return { question, about: subject, band: feelingBand(v), value: v, ...(b ? { because: { subject: b.subject, aspect: b.aspect } } : {}) };
    }
    case 'me': {
      const v = feelingAbout(r, STEWARD, state.tick);
      const b = strongestBelief(r, STEWARD);
      return { question, about: STEWARD, band: feelingBand(v), value: v, ...(b ? { because: { subject: b.subject, aspect: b.aspect } } : {}) };
    }
  }
}
