// Core data types for the Townlet sim. All sim state is plain data (no classes, no
// functions) so it can be cloned with structuredClone, saved as JSON and diffed in tests.

export const NEEDS = ['rest', 'food', 'comfort', 'company', 'purpose', 'delight'] as const;
export type Need = (typeof NEEDS)[number];

export const QUALITIES = ['noise', 'bustle', 'green', 'scent', 'water'] as const;
export type Quality = (typeof QUALITIES)[number];

export const TRAITS = ['sociable', 'steady', 'curious', 'generous', 'tidy'] as const;
export type Trait = (typeof TRAITS)[number];

export const VALUES = ['beauty', 'quiet', 'community', 'craft', 'nature', 'prosperity'] as const;
export type Value = (typeof VALUES)[number];

export const ACTIVITIES = ['sleep', 'eat', 'work', 'socialize', 'stroll', 'rest'] as const;
export type ActivityId = (typeof ACTIVITIES)[number];

export type Register = 'formal' | 'warm' | 'plain' | 'chatty' | 'dreamy';
export type Quirk = 'light_sleeper' | 'early_riser' | 'homebody' | 'restless';

export type NeedMap = Record<Need, number>;
export type QualityMap = Record<Quality, number>;

/** A belief or episode is about a subject: a building ("b:3"), a resident ("r:ada") or the steward. */
export type SubjectId = string;
export const STEWARD: SubjectId = 'steward';

// ---------------------------------------------------------------- content definitions

export type BuildingKind = 'home' | 'work' | 'social' | 'civic' | 'decor' | 'nature';

export interface BuildingDef {
  type: string;
  name: string;
  kind: BuildingKind;
  size: [number, number];
  /** Ambient qualities emitted at all times. Negative values absorb (hedges absorb noise). */
  emits: Partial<QualityMap>;
  /** Emitted only while someone is working here (the bakery is loud only when the ovens run). */
  emitsWhenWorked?: Partial<QualityMap>;
  radius: number;
  /** Activities a resident can do here. Homes get sleep/eat/rest for their own residents only. */
  activities: ActivityId[];
  /** Beds for homes, worker slots for workplaces. */
  capacity?: number;
  /** Work shift in minutes of the day, [start, end). */
  shift?: [number, number];
  /** Opening hours for public places, [start, end) in minutes of the day. */
  open?: [number, number];
}

export interface Pronouns {
  subj: string;
  obj: string;
  poss: string;
}

export interface ResidentDef {
  id: string;
  name: string;
  pronouns: Pronouns;
  age: number;
  background: string;
  /** Bipolar traits in [-1, 1]. sociable=-1 is reserved, steady=-1 is excitable, and so on. */
  traits: Record<Trait, number>;
  /** How much the resident cares about each value, [0, 1]. */
  values: Record<Value, number>;
  quirks: Quirk[];
  voice: { register: Register; tics: string[] };
  job?: string;
  fallbackJob?: string;
  wake: number;
  sleep: number;
  aspiration: string;
}

// ---------------------------------------------------------------- runtime state

export interface BuildingState {
  id: number;
  type: string;
  x: number;
  y: number;
  placedTick: number;
  /** Who placed it: the steward, or "founding" for the starting town. */
  placedBy: 'steward' | 'founding';
  removed: boolean;
}

export interface ActivityState {
  id: ActivityId;
  placeId: number;
  until: number;
  /** Night sleep (as opposed to a nap): waking from it triggers consolidation. */
  night?: boolean;
}

export interface Episode {
  id: number;
  tick: number;
  subject: SubjectId;
  aspect: string;
  /** Sign and strength of feeling, [-1, 1]. */
  valence: number;
  /** Appraised intensity after personality and relevance, [0, 1+]. */
  intensity: number;
  source: 'witnessed' | 'told' | 'recalled';
  /** Who told them, for told episodes. */
  from?: string;
  placeId?: number;
  note: string;
}

export interface BeliefSource {
  tick: number;
  kind: 'witnessed' | 'told' | 'recalled';
  from?: string;
  note: string;
  weight: number;
}

/** Unconsolidated evidence that persists for a few nights before it becomes a belief or fades. */
export interface Trace {
  subject: SubjectId;
  aspect: string;
  /** Signed evidence: the sum of valence x intensity, decayed nightly. */
  evidence: number;
  /** Summed intensity, decayed alongside, so a belief's valence is a weighted mean. */
  sumI: number;
  sources: BeliefSource[];
}

export interface Belief {
  subject: SubjectId;
  aspect: string;
  valence: number;
  strength: number;
  formedTick: number;
  reinforcedTick: number;
  sources: BeliefSource[];
}

export type EmotionKind = 'joy' | 'gratitude' | 'pride' | 'annoyance' | 'worry' | 'grief' | 'loneliness';

export interface Emotion {
  kind: EmotionKind;
  target?: SubjectId;
  intensity: number;
  tick: number;
}

export type RelTag = 'friend' | 'close_friend' | 'rival';

export interface Relationship {
  affinity: number;
  familiarity: number;
  trust: number;
  lastContact: number;
  /** Tick of the last argument, or -1. Cleared by a successful apology. */
  lastArgue: number;
  tags: RelTag[];
}

export interface ResidentState {
  id: string;
  homeId: number;
  jobId: number | null;
  x: number;
  y: number;
  /** Building the resident is inside, or null when walking. */
  at: number | null;
  path: Array<[number, number]>;
  activity: ActivityState | null;
  /** The activity to start on arrival. */
  pending: ActivityState | null;
  needs: NeedMap;
  setpoints: NeedMap;
  mood: number;
  disposition: number;
  dayMoodSum: number;
  dayMoodN: number;
  lowDays: number;
  leaving: { sinceDay: number } | null;
  departed: boolean;
  emotions: Emotion[];
  /** Today's salient episodes, consolidated overnight. */
  buffer: Episode[];
  /** Long-term episodic memory, bounded. */
  episodes: Episode[];
  traces: Record<string, Trace>;
  beliefs: Record<string, Belief>;
  rel: Record<string, Relationship>;
  /** `${listener}|${beliefKey}` -> tick last told, so gossip doesn't loop. */
  told: Record<string, number>;
  /** other resident id -> tick of last exchange. */
  lastExchange: Record<string, number>;
  /** Highest noise heard at home during the current or last sleep. */
  sleepNoiseMax: number;
  /** Building ids that already disturbed this night's sleep. */
  disturbedBy: number[];
  /** Places already appraised this visit, so a long stay counts once. */
  visitAppraised: boolean;
  lastScentDay: number;
  rng: number;
}

export interface Request {
  id: number;
  by: string;
  kind: 'quieter_home';
  subject: SubjectId;
  postedTick: number;
  status: 'open' | 'fulfilled' | 'lapsed';
  closedTick?: number;
}

export interface SimState {
  version: 1;
  seed: number;
  tick: number;
  width: number;
  height: number;
  buildings: BuildingState[];
  nextBuildingId: number;
  residents: Record<string, ResidentState>;
  /** Fixed iteration order, for determinism. */
  order: string[];
  requests: Request[];
  nextEpisodeId: number;
  nextRequestId: number;
}

// ---------------------------------------------------------------- events

export type SimEvent =
  | { t: number; type: 'dawn'; day: number }
  | { t: number; type: 'built'; building: number; btype: string; by: 'steward' }
  | { t: number; type: 'removed'; building: number; btype: string; by: 'steward' }
  | { t: number; type: 'took_job'; who: string; building: number }
  | { t: number; type: 'disturbed_sleep'; who: string; building: number; noise: number }
  | { t: number; type: 'perceived'; who: string; episode: Episode }
  | {
      t: number;
      type: 'exchange';
      kind: ExchangeKind;
      a: string;
      b: string;
      place: number | null;
      ok: boolean;
      topic?: { subject: SubjectId; aspect: string; valence: number };
    }
  | { t: number; type: 'recall'; who: string; subject: SubjectId; aspect: string; valence: number; cue: SubjectId }
  | { t: number; type: 'belief_formed'; who: string; belief: Belief; hearsay: boolean }
  | { t: number; type: 'belief_flipped'; who: string; belief: Belief }
  | { t: number; type: 'belief_faded'; who: string; subject: SubjectId; aspect: string }
  | { t: number; type: 'request_posted'; request: Request }
  | { t: number; type: 'request_closed'; request: Request }
  | { t: number; type: 'relationship'; who: string; other: string; added: RelTag[]; removed: RelTag[] }
  | { t: number; type: 'reaction'; who: string; building: number; aspect: string; valence: number }
  | { t: number; type: 'grief'; who: string; building: number; btype: string }
  | { t: number; type: 'thinking_of_leaving'; who: string }
  | { t: number; type: 'decided_to_stay'; who: string }
  | { t: number; type: 'left_town'; who: string };

export type ExchangeKind =
  | 'greet'
  | 'chat'
  | 'share_opinion'
  | 'compliment'
  | 'comfort'
  | 'reminisce'
  | 'tease'
  | 'argue'
  | 'apologize'
  | 'share_meal';
