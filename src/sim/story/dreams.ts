// Dreams that keep coming (M3b, spec 4.2.8). When a resident's dream is done, a new one forms a
// few days later from what they have lived through: a friend, a place they love, a day the
// town remembers, someone who has left, someone they have fallen out with, or the steward.
// Each template turns that subject into a short chain of stages, in the same shape as the
// authored first dreams, so the same engine runs them.

import { buildingDef } from '../../content/buildings.js';
import { residentDef } from '../../content/residents.js';
import { opinion } from '../mind/memory.js';
import { weighted } from '../rng.js';
import { adjust, rel } from '../mind/relationships.js';
import { clamp } from '../needs.js';
import { TICKS_PER_DAY } from '../time.js';
import { STEWARD, type ResidentState, type SimState, type SubjectId } from '../types.js';
import { liveBuildings } from '../world.js';
import type { AspirationDef, AspirationHost } from './aspirations.js';
import { active, addMemory } from './director.js';

/** How strongly a resident feels about someone or something: the raw material of a new dream. */
export interface Attachment {
  subject: SubjectId;
  strength: number;
  valence: number;
}

/** Someone who left within this long is still a fresh loss. */
const FRESH_LOSS = 45 * TICKS_PER_DAY;

/** The resident's strongest feelings: people (by affinity), places and memories (by belief), the steward. */
export function attachments(state: SimState, r: ResidentState): Attachment[] {
  const out: Attachment[] = [];
  for (const [id, x] of Object.entries(r.rel)) {
    if (id === STEWARD) {
      out.push({ subject: STEWARD, strength: Math.abs(x.affinity), valence: x.affinity });
      continue;
    }
    const o = state.residents[id];
    if (!o) continue;
    // A friend who has just left weighs more than one still here.
    const fresh = o.departed && o.departedTick !== undefined && state.tick - o.departedTick < FRESH_LOSS && x.affinity > 0.2;
    out.push({ subject: `r:${id}`, strength: Math.abs(x.affinity) + (fresh ? 0.5 : 0), valence: x.affinity });
  }
  const bySubject = new Map<SubjectId, Attachment>();
  for (const b of Object.values(r.beliefs)) {
    if (!(b.subject.startsWith('b:') || b.subject.startsWith('m:'))) continue;
    if (b.subject.startsWith('b:') && state.buildings.find((x) => `b:${x.id}` === b.subject)?.removed) continue;
    const s = b.strength * Math.abs(b.valence);
    const cur = bySubject.get(b.subject);
    if (!cur || s > cur.strength) bySubject.set(b.subject, { subject: b.subject, strength: s, valence: opinion(r, b.subject) });
  }
  out.push(...bySubject.values());
  out.sort((a, b) => b.strength - a.strength || a.subject.localeCompare(b.subject));
  return out;
}

const name = (id: string) => residentDef(id).name;
const idOf = (s: SubjectId) => s.slice(2);
const building = (state: SimState, s: SubjectId) => state.buildings.find((b) => `b:${b.id}` === s);
const days = (h: AspirationHost, r: ResidentState) => (h.state.tick - r.aspiration.since) / TICKS_PER_DAY;
const feel = (h: AspirationHost, r: ResidentState, subject: SubjectId, aspect: string, valence: number, base: number, note: string) =>
  h.mind.perceive(h.mindContext(), r, { subject, aspect, valence, base, note, source: 'witnessed' });

function builtSince(state: SimState, type: string, tick: number): boolean {
  return liveBuildings(state).some((b) => b.type === type && b.placedTick >= tick);
}

/** Times they reminisced about a subject with anyone since a tick. */
function retold(r: ResidentState, subject: SubjectId, since: number): number {
  let n = 0;
  for (const [k, t] of Object.entries(r.told)) if (k.startsWith('reminisce|') && k.endsWith(`|${subject}`) && t >= since) n++;
  return n;
}

function bestFriend(state: SimState, r: ResidentState, except?: string): string | undefined {
  return Object.entries(r.rel)
    .filter(([id, x]) => id !== STEWARD && id !== except && !state.residents[id]?.departed && x.tags.includes('friend'))
    .sort((a, b) => b[1].affinity - a[1].affinity)[0]?.[0];
}

export interface DreamTemplate {
  id: string;
  /** Does this subject suit this dream? */
  fits(state: SimState, r: ResidentState, a: Attachment): boolean;
  build(state: SimState, r: ResidentState, subject: SubjectId): AspirationDef;
}

/** A newcomer's first dream (M3c): find their feet. Given on arrival, never chosen later. */
const SETTLE: DreamTemplate = {
  id: 'settle',
  fits: () => false,
  build: (_state, r) => ({
    who: r.id,
    // Their own hope, as their trade gave it (bar round 2: every newcomer "settles into the valley").
    title: residentDef(r.id).aspiration?.replace(/\.$/, '') || 'Settle into the valley',
    stages: [
      {
        id: 'meet',
        next: 'Get to know the neighbours',
        check: (_h, rr) => Object.entries(rr.rel).filter(([id, x]) => id !== STEWARD && x.familiarity >= 0.35).length >= 3,
      },
      {
        id: 'friend',
        next: 'Make a friend',
        check: (_h, rr) => Object.entries(rr.rel).some(([id, x]) => id !== STEWARD && x.tags.includes('friend')),
      },
      {
        id: 'place',
        next: 'Find a favourite spot in the valley',
        check: (h, rr) => Object.values(rr.beliefs).some((b) => b.subject.startsWith('b:') && b.valence > 0) || days(h, rr) >= 10,
      },
    ],
  }),
};

export const DREAM_TEMPLATES: DreamTemplate[] = [
  {
    // A friend gone: keep their memory.
    id: 'remember_gone',
    fits: (state, _r, a) => a.subject.startsWith('r:') && !!state.residents[idOf(a.subject)]?.departed && a.valence > 0.2,
    build: (state, r, subject) => {
      const gone = state.residents[idOf(subject)] as ResidentState;
      // Their favourite place, where they will be remembered.
      const fav = Object.values(gone.beliefs)
        .filter((b) => b.subject.startsWith('b:') && b.valence > 0 && !building(state, b.subject)?.removed && buildingDef(building(state, b.subject)?.type ?? 'well').activities.includes('stroll'))
        .sort((a, b) => b.strength - a.strength)[0];
      const place = fav ? building(state, fav.subject) : liveBuildings(state).find((b) => b.type === 'oak' || b.type === 'commons');
      return {
        who: r.id,
        title: "Keep {x}'s memory alive",
        stages: [
          {
            id: 'remember',
            next: place ? `Sit a while where {x} liked to be` : 'Think of {x}',
            ...(place ? { place: place.type, placeId: place.id } : {}),
            check: (h, rr) => (place ? rr.aspiration.minutes >= 3 * 60 : days(h, rr) >= 2),
          },
          {
            id: 'mark',
            next: 'Gather friends to remember {x}',
            check: (h, rr) => days(h, rr) >= 2,
            enter: (h, rr) => {
              const friends = active(h.state).filter((x) => x !== rr && rel(x, gone.id).affinity > 0.1);
              const m = addMemory(h, { tick: h.state.tick, kind: 'festival', label: `the evening the town remembered ${name(gone.id)}`, placeId: place?.id ?? null, attendees: [rr.id, ...friends.map((x) => x.id)] });
              for (const x of [rr, ...friends]) feel(h, x, `m:${m.id}`, 'wonderful_time', 0.6, x === rr ? 0.8 : 0.4, `remembering ${name(gone.id)}`);
            },
          },
        ],
      };
    },
  },
  {
    // Make peace with someone they've fallen out with.
    id: 'mend',
    fits: (state, _r, a) => a.subject.startsWith('r:') && !state.residents[idOf(a.subject)]?.departed && a.valence < -0.15,
    build: (_state, r, subject) => ({
      who: r.id,
      title: 'Make peace with {x}',
      stages: [
        {
          id: 'courage',
          next: 'Work up the courage to talk to {x}',
          check: (h, rr) => days(h, rr) >= 2,
          enter: (h, rr) => {
            const o = h.state.residents[idOf(subject)] as ResidentState;
            h.forceExchange(rr, o, 'apologize', null);
          },
        },
        {
          id: 'peace',
          next: 'Make things right with {x}',
          check: (h, rr) => {
            const o = h.state.residents[idOf(subject)] as ResidentState | undefined;
            if (!o || o.departed) return true;
            if (rel(rr, o.id).affinity >= -0.05 && rel(o, rr.id).affinity >= -0.05) return true;
            // Try again every other day.
            if (Math.floor(days(h, rr)) % 2 === 1) h.forceExchange(rr, o, 'apologize', null);
            return false;
          },
          enter: (h, rr) => {
            const o = h.state.residents[idOf(subject)] as ResidentState | undefined;
            if (o && !o.departed) {
              adjust(rr, o.id, { affinity: 0.1, trust: 0.05 }, h.state.tick);
              adjust(o, rr.id, { affinity: 0.1, trust: 0.05 }, h.state.tick);
              rel(rr, o.id).lastArgue = -1;
              rel(o, rr.id).lastArgue = -1;
            }
          },
        },
      ],
    }),
  },
  {
    // A dear friend: make them something.
    id: 'gift',
    fits: (state, _r, a) => a.subject.startsWith('r:') && !state.residents[idOf(a.subject)]?.departed && a.valence > 0.3,
    build: (_state, r, subject) => ({
      who: r.id,
      title: 'Make something for {x}',
      stages: [
        {
          id: 'make',
          next: 'Make something for {x}, in the evenings at home',
          place: 'home',
          check: (h, rr) => rr.aspiration.minutes >= 8 * 60 || days(h, rr) >= 6,
        },
        {
          id: 'give',
          next: 'Give it to {x}',
          check: (_h, rr) => (rr.lastExchange[idOf(subject)] ?? -1) >= rr.aspiration.since,
          enter: (h, rr) => {
            const o = h.state.residents[idOf(subject)] as ResidentState | undefined;
            if (!o || o.departed) return;
            feel(h, o, `r:${rr.id}`, 'kind_to_me', 0.9, 0.7, `${name(rr.id)} made me a gift`);
            o.needs.delight = clamp(o.needs.delight + 0.3);
          },
        },
      ],
    }),
  },
  {
    // A place they love: bring a friend there for a long evening.
    id: 'place',
    fits: (state, _r, a) => {
      const b = a.subject.startsWith('b:') ? building(state, a.subject) : undefined;
      return !!b && !b.removed && a.valence > 0.15 && buildingDef(b.type).activities.includes('stroll');
    },
    build: (state, r, subject) => {
      const b = building(state, subject);
      return {
        who: r.id,
        title: 'Share {x} with a friend',
        stages: [
          {
            id: 'linger',
            next: 'Spend some quiet hours at {x}',
            ...(b ? { place: b.type, placeId: b.id } : {}),
            check: (_h, rr) => rr.aspiration.minutes >= 4 * 60,
            enter: (h, rr) => {
              const f = bestFriend(h.state, rr);
              if (f) rr.aspiration.partner = f;
            },
          },
          {
            id: 'share',
            next: 'Spend an evening at {x} with {partner}',
            ...(b ? { place: b.type, placeId: b.id } : {}),
            together: true,
            check: (h, rr) => {
              if (!rr.aspiration.partner || h.state.residents[rr.aspiration.partner]?.departed) {
                const f = bestFriend(h.state, rr);
                if (f) rr.aspiration.partner = f;
                else return days(h, rr) >= 4;
              }
              return rr.aspiration.minutes >= 60;
            },
            enter: (h, rr) => {
              const p = rr.aspiration.partner;
              const m = addMemory(h, { tick: h.state.tick, kind: 'festival', label: `a long evening at ${b ? `the ${buildingDef(b.type).name.toLowerCase()}` : 'the old place'}`, placeId: b?.id ?? null, attendees: p ? [rr.id, p] : [rr.id] });
              for (const id of m.attendees) feel(h, h.state.residents[id] as ResidentState, `m:${m.id}`, 'wonderful_time', 0.7, 0.6, 'a long evening together');
            },
          },
        ],
      };
    },
  },
  {
    // A day the town remembers: tell it again, and ask the steward for a bench to remember it by.
    id: 'relive',
    fits: (state, _r, a) => a.subject.startsWith('m:') && a.valence > 0.15 && state.story.memories.some((m) => `m:${m.id}` === a.subject),
    build: (_state, r, subject) => ({
      who: r.id,
      title: 'Keep {x} in the town\'s memory',
      stages: [
        {
          id: 'retell',
          next: 'Tell people about {x}',
          check: (h, rr) => retold(rr, subject, rr.aspiration.since) >= 2 || days(h, rr) >= 6,
        },
        {
          id: 'ask',
          next: 'Ask the steward for a bench to remember it by',
          check: () => true,
          enter: (h, rr) => h.ask(rr, 'aspiration', 'bench'),
        },
        {
          id: 'bench',
          next: 'Wait for the bench',
          check: (h, rr) => builtSince(h.state, 'bench', rr.aspiration.since),
          enter: (h, rr) => feel(h, rr, STEWARD, 'granted_wish', 1, 0.9, 'built a bench to remember by'),
        },
      ],
    }),
  },
  {
    // The steward has been good to them: do something in return.
    id: 'thank',
    fits: (_state, _r, a) => a.subject === STEWARD && a.valence > 0.3,
    build: (_state, r) => ({
      who: r.id,
      title: 'Do something for {x}',
      stages: [
        {
          id: 'make',
          next: 'Put something by for {x}',
          place: 'home',
          check: (h, rr) => rr.aspiration.minutes >= 8 * 60 || days(h, rr) >= 6,
        },
        {
          id: 'give',
          next: 'Leave it on the steward\'s step',
          check: (h, rr) => days(h, rr) >= 1,
          enter: (h) => {
            h.state.stock.timber += 3;
            h.state.stock.food += 2;
          },
        },
      ],
    }),
  },
];

const TEMPLATE_BY_ID = new Map([...DREAM_TEMPLATES, SETTLE].map((t) => [t.id, t]));

export function templateDream(state: SimState, r: ResidentState): AspirationDef | undefined {
  const kind = r.aspiration.kind;
  if (!kind) return undefined;
  return TEMPLATE_BY_ID.get(kind)?.build(state, r, r.aspiration.subject ?? STEWARD);
}

/** The five strongest attachments are where a new dream may come from. */
export const DREAM_SOURCES = 5;

/**
 * Choose a new dream: among their strongest attachments, those that suit some template, by
 * chance weighted by how strongly they feel. Not the same kind of dream as either of the last
 * two, nor about the same subject as the last.
 */
export function chooseDream(state: SimState, r: ResidentState): { kind: string; subject: SubjectId } | null {
  const past = r.aspiration.past ?? [];
  const recent = new Set(past.slice(-2));
  const lastSubject = r.aspiration.subject;
  const options: Array<{ kind: string; subject: SubjectId; weight: number }> = [];
  for (const a of attachments(state, r).slice(0, DREAM_SOURCES)) {
    if (a.subject === lastSubject) continue;
    // Two people making something for someone is plenty at once (bar round 3: eight of ten).
    const gifting = Object.values(state.residents).filter((o) => o.id !== r.id && !o.departed && !o.aspiration.done && o.aspiration.kind === 'gift').length;
    const t = DREAM_TEMPLATES.find((x) => !recent.has(x.id) && !(x.id === 'gift' && gifting >= 2) && x.fits(state, r, a));
    if (t) options.push({ kind: t.id, subject: a.subject, weight: a.strength + (t.id === 'remember_gone' ? 2 : 0) });
  }
  const pick = weighted(r, options, (o) => o.weight);
  return pick ? { kind: pick.kind, subject: pick.subject } : null;
}
