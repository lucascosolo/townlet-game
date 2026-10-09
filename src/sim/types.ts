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

export const ACTIVITIES = ['sleep', 'eat', 'work', 'socialize', 'stroll', 'rest', 'forage'] as const;
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
  /** For a name that is plural ("Garden plots"): one of them. */
  singular?: string;
  /** The town tier it needs (M4); none means always available. */
  tier?: number;
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
  /** For places to gather: how many people fit before it feels crowded. */
  comfortable?: number;
  /** Timber it costs to build. Removing refunds half. */
  cost?: number;
  /** What each worker makes per hour on shift (spec 4.3, thin economy). */
  produces?: Partial<Record<Resource, number>>;
  /** One line for the build menu. */
  blurb?: string;
  /** Made each hour whether or not anyone works here (a glasshouse grows on its own). */
  passive?: Partial<Record<Resource, number>>;
}

export const RESOURCES = ['food', 'timber'] as const;
export type Resource = (typeof RESOURCES)[number];

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
  /** The same, as they tell it themselves (bar round 1). */
  bio?: string;
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
  /** Day of the year (1-28) the resident celebrates. */
  birthday: number;
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
  /** Quarter turns clockwise, 0-3. Odd turns swap the footprint. */
  rot?: number;
  /** Bar round 6: residents whose dream this building answered; they grieve it at full weight. */
  dreamOf?: string[];
}

export interface ActivityState {
  id: ActivityId;
  placeId: number;
  until: number;
  /** Night sleep (as opposed to a nap): waking from it triggers consolidation. */
  night?: boolean;
  /** A meal eaten from a bare larder: it fills less. */
  meagre?: boolean;
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

export interface AspirationState {
  /** Stages completed so far. */
  stage: number;
  /** Tick the current stage began. */
  since: number;
  /** Minutes spent on the current stage's activity. */
  minutes: number;
  /** Who else is part of it (Fen's student). */
  partner?: string;
  done: boolean;
  /** Which dream: undefined for the resident's authored first dream, else a template id (M3b). */
  kind?: string;
  /** What a template dream is about: a friend, a place, a memory, someone gone. */
  subject?: SubjectId;
  /** Dreams seen through so far, and the template ids of past dreams, most recent last. */
  completed?: number;
  past?: string[];
  /** Tick the last dream was done, so a new one can form a few days later. */
  doneTick?: number;
  /** How it ended, where it can end more than one way (Marlow). */
  outcome?: string;
}

/** A change to the town a resident hasn't taken in yet. */
export interface Unseen {
  building: number;
  kind: 'built' | 'removed';
  tick: number;
}

export interface ResidentState {
  /** A place they held dear that was taken away (bar round 4): weighs on mood for a few days. */
  lostPlace?: { tick: number; weight: number };
  /** Warmth that talk added lately, [tick, amount] (bar round 5: capped weekly). */
  talkWarmth?: Array<[number, number]>;
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
  /** Thinking of leaving since this day; `dream` when it came from a dream's decision (bar round 2), which only a very good week turns round. */
  leaving: { sinceDay: number; dream?: boolean } | null;
  departed: boolean;
  /** Tick a newcomer moved in (M3c); absent for the founding cast. */
  arrivedTick?: number;
  /** Tick they left the valley (M3b: friends speak of them). */
  departedTick?: number;
  /** A longer mood they are in, if any (M3b). */
  moodArc?: MoodArc | null;
  /** Mood arcs so far, and the tick the last one ended. */
  moodArcs?: number;
  lastMoodEnd?: number;
  /** Their last answer to the steward and the replies it opened (talking back, bar round 1). */
  /**
   * The last answer and the replies open to it. `answer` is kept whole; what was actually said may be
   * a trimmed part of it (bar round 4), and a reply names the cut it answers.
   */
  lastAnswer?: { tick: number; offers: import('./replies.js').ReplyOffer[]; replied: boolean; answer?: TalkAnswer; used?: import('./replies.js').ReplyOffer };
  /** Belief aspect -> tick it was last given as the reason for their view of the steward. */
  cited?: Record<string, number>;
  /** Grievance aspect -> tick the steward last said sorry for it. */
  sorryFor?: Record<string, number>;
  /** Day a meagre meal was last held against the steward (bar round 1). */
  lastHungryDay?: number;
  /** Consecutive days of meagre meals ending on lastHungryDay. */
  hungryRun?: number;
  /** The last day they went foraging (bar round 2): one trip a day when the larder is bare. */
  lastForageDay?: number;
  /** Trips made on lastForageDay (two when very hungry). */
  forageTrips?: number;
  /** Gave up expecting anything of the steward until this tick (bar round 3): no asks, no waiting pangs. */
  gaveUpUntil?: number;
  /** Day of the steward's last talk with them that counted (M3b: no farming). */
  lastTalkDay?: number;
  /** A favour they agreed to and are doing (M3c). */
  favour?: Favour | null;
  /** Ticks the steward asked them favours, for the last week. */
  favoursAsked?: number[];
  emotions: Emotion[];
  /** Today's salient episodes, consolidated overnight. */
  buffer: Episode[];
  /** Long-term episodic memory, bounded. */
  episodes: Episode[];
  /** Their view of the steward at the last few dawns, oldest first (M4: talk follows change, not level). */
  standingLog?: number[];
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
  /** placeId -> tick of the last visit, for the pull of somewhere not seen in a while. */
  lastVisit: Record<string, number>;
  /** Tick until which the resident has a cold, or -1. */
  coldUntil: number;
  unseen: Unseen[];
  /** Progress through their personal aspiration (M3a). */
  aspiration: AspirationState;
  /** Story (subject|aspect) -> tick it was last told to the steward (memories in conversation, 2026-10-08). */
  recalled?: Record<string, number>;
  /** Mind topic key -> tick it was last thought or said, so they don't repeat themselves. */
  lastThoughts?: Record<string, number>;
  rng: number;
}

export type MoodKind = 'bad_week' | 'missing' | 'smitten' | 'restless' | 'glow';

/** A mood that lasts days: why it began, how it is going (M3b, "moods with weather inside"). */
export interface MoodArc {
  kind: MoodKind;
  since: number;
  reason: string;
  about?: SubjectId;
  /** Kindness received during it; comfort from a friend lifts a bad week sooner. */
  lift: number;
}

export type TalkQuestion = 'how' | 'mind' | 'hope' | 'opinion' | 'me';

/** What the steward can ask of a resident (M3c). */
export type FavourKind = 'timber' | 'catch' | 'garden' | 'clear' | 'visit' | 'mend';

/** Why a resident says no, always drawn from their state. */
export type RefusalReason = 'asleep' | 'busy' | 'unwell' | 'tired' | 'low' | 'asked_often' | 'distrust' | 'not_speaking' | 'nowhere' | 'gone' | 'hungry';

export interface Favour {
  id: number;
  kind: FavourKind;
  /** Where the work is done (a building id): the woodlot, the jetty, a wild plot, someone's home. */
  placeId: number;
  /** For visit and mend: the other resident. */
  other?: string;
  askedTick: number;
  minutesNeeded: number;
  minutes: number;
}

/** An answer, as data drawn from state; the narrator gives it a voice. */
export interface TalkAnswer {
  question: TalkQuestion;
  /** how: mood band; opinion/me: feeling band. */
  band?: string;
  value?: number;
  /** The topics or lines the answer draws on. */
  topics?: MindMention[];
  mood?: { kind: MoodKind; reason: string };
  hope?: { title: string; next: string | null; done: boolean; outcome?: string; meanwhile?: string };
  about?: SubjectId;
  /** opinion/me: the belief behind it, if any. */
  because?: { subject: SubjectId; aspect: string };
  /** me: a fresh grievance conceded after a kind view (bar round 2), in their words. */
  but?: { aspect: string; note: string };
  /** A memory they bring up, if any (memories in conversation, 2026-10-08). */
  memory?: import('./recall.js').Recollection;
  /** The replies the steward can make to this answer (talking back, bar round 1). */
  replies?: import('./replies.js').ReplyKind[];
}

/** A mind topic as it was voiced: see mind/thoughts.ts. */
export interface MindMention {
  key: string;
  about?: SubjectId;
  vars: Record<string, string>;
  rank: number;
}

export type RequestKind = 'quieter_home' | 'workplace' | 'more_food' | 'somewhere_to_sit' | 'more_green' | 'place_to_gather' | 'aspiration';

export interface Request {
  id: number;
  by: string;
  kind: RequestKind;
  subject: SubjectId;
  /** For a workplace ask: the building type wanted. */
  wants?: string;
  /** For a dream ask: the dream that asked, in its words (bar round 4). */
  dream?: string;
  postedTick: number;
  /** fulfilled: the steward dealt with it. resolved: it went away by itself. lapsed: ignored. */
  status: 'open' | 'fulfilled' | 'resolved' | 'lapsed';
  closedTick?: number;
}

export interface Wish {
  id: number;
  kind: RequestKind;
  label: string;
  supporters: string[];
  madeTick: number;
  /** dropped: its last wisher left town (bar round 2: "0 of 0 who wished for it have it"). */
  status: 'open' | 'granted' | 'missed' | 'dropped';
  closedTick?: number;
}

// ---------------------------------------------------------------- story (spec 4.4)

export type Tone = 'good' | 'bad' | 'neutral';

export type GatheringKind = 'festival' | 'trade_cart' | 'musician' | 'market' | 'contraption' | 'lantern_walk' | 'tales' | 'bonfire';

/** A time-boxed reason to be somewhere: a festival, a visitor, a market. */
export interface Gathering {
  id: number;
  kind: GatheringKind;
  label: string;
  placeId: number;
  from: number;
  until: number;
  /** Base pull on everyone, before values and traits. */
  pull: number;
  /** Values that make this gathering more appealing, and how much. */
  appeal: Partial<Record<Value, number>>;
  /** Extra ambient emission at the place while it runs (a market is noisy). */
  emits?: Partial<QualityMap>;
  radius?: number;
  attendees: string[];
  /** The town memory written when it ends, if it was memorable. */
  memoryId?: number;
}

export type WeatherKind = 'clear' | 'rain' | 'storm';

export interface Weather {
  kind: WeatherKind;
  until: number;
}

/** Two residents who will have words the next time they meet. */
export interface Spark {
  a: string;
  b: string;
  topic: SubjectId | null;
  until: number;
}

export type DilemmaType = 'market_day' | 'night_baking' | 'contraption' | 'lantern_walk' | 'tales_night' | 'cart_stop' | 'bonfire_night';
export type DilemmaStatus = 'open' | 'approved' | 'declined' | 'lapsed';

export interface Dilemma {
  id: number;
  type: DilemmaType;
  proposer: string;
  postedTick: number;
  status: DilemmaStatus;
  closedTick?: number;
}

/** Something the whole town lived through together (spec 4.2.3, collective memory). */
export interface TownMemory {
  id: number;
  tick: number;
  kind: 'festival' | 'storm' | 'contraption';
  label: string;
  placeId: number | null;
  attendees: string[];
}

export interface StoryState {
  rng: number;
  nextId: number;
  history: Array<{ id: string; tick: number; tone: Tone }>;
  gatherings: Gathering[];
  weather: Weather;
  sparks: Spark[];
  dilemmas: Dilemma[];
  /** Mornings in a row with nothing open on the board (bar round 2): after three, the town finds something to put to the steward. */
  quietMornings?: number;
  memories: TownMemory[];
  /** Seasonal Town Wishes. */
  wishes: Wish[];
  /** Approved standing arrangements. */
  marketDay: boolean;
  /** Buildings working outside their shift, [buildingId, from, until]. */
  extraShifts: Array<[number, number, number]>;
}

export interface SimState {
  version: 2;
  seed: number;
  tick: number;
  width: number;
  height: number;
  /** Newcomers' generated definitions, kept with the state so saves and clones know them (M3c). */
  newcomerDefs?: ResidentDef[];
  /** The settled valley at the start; beyond it, wild plots (M3c). */
  settled?: { width: number; height: number };
  buildings: BuildingState[];
  nextBuildingId: number;
  residents: Record<string, ResidentState>;
  /** Fixed iteration order, for determinism. */
  order: string[];
  requests: Request[];
  nextEpisodeId: number;
  nextRequestId: number;
  story: StoryState;
  /** The town's shared stores. */
  stock: Record<Resource, number>;
  /** Day of the last food shortage announcement, or 0. */
  lastShortageDay: number;
  /** Consecutive days the town has gone short, ending on lastShortageDay (bar round 3). */
  shortRun?: number;
  /** Dawns in a row with the larder below a day's meals (bar round 4). */
  lowRun?: number;
  /** Until when standing is capped after a low larder (bar round 5). */
  lowCapUntil?: number;
  /** The day each worn tile was last walked (bar round 4). */
  wearDay?: Record<string, number>;
  nextFavourId?: number;
  /** Today's production so far, by resident (or building type for what grows itself), shown each morning. */
  produced?: Record<string, Partial<Record<Resource, number>>>;
  /** Goals, renown, tier and the Folk album (M4). */
  progress?: import('./progress.js').Progress;
  /** Food put by in the granary (winter stores, 2026-10-04). */
  granary?: number;
  /** This year's winter-stores quest. */
  stores?: { year: number; target: number; asked: boolean; by?: string; outcome?: 'met' | 'short'; /** Quarters of the way there already told. */ told?: number };
  /** Work done towards clearing each wild plot, in minutes, by building id (M3c). */
  clearing?: Record<string, number>;
  /** How worn each tile is by feet off the laid paths, by "x,y": footsteps, fading each dawn (owner playtest 2026-10-05). */
  wear?: Record<string, number>;
  /** The day the trader's cart last came (the rewarded bonus, 2026-10-08), or absent. */
  lastGiftDay?: number;
}

// ---------------------------------------------------------------- events

export type SimEvent =
  | { t: number; type: 'dawn'; day: number }
  | { t: number; type: 'gift'; from: 'trader'; timber: number; food: number }
  | { t: number; type: 'renown'; amount: number; total: number; why: string }
  | { t: number; type: 'tier'; tier: number; name: string; unlocks: string[]; cap: number }
  | { t: number; type: 'goal'; phase: 'new' | 'done' | 'all'; goal?: import('./progress.js').Goal; goals?: import('./progress.js').Goal[] }
  | { t: number; type: 'fact'; who: string; key: string; first: boolean }
  | { t: number; type: 'stores'; phase: 'asked' | 'reminded' | 'progress' | 'met' | 'short' | 'feast'; who: string; stored: number; target: number; daysLeft: number; kept?: number }
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
      /** For a chat: what was on the speaker's mind (M3a). */
      mind?: MindMention;
    }
  | { t: number; type: 'recall'; who: string; subject: SubjectId; aspect: string; valence: number; cue: SubjectId }
  | { t: number; type: 'belief_formed'; who: string; belief: Belief; hearsay: boolean }
  | { t: number; type: 'belief_flipped'; who: string; belief: Belief }
  | { t: number; type: 'belief_faded'; who: string; subject: SubjectId; aspect: string }
  | { t: number; type: 'request_posted'; request: Request }
  | { t: number; type: 'request_closed'; request: Request }
  | { t: number; type: 'relationship'; who: string; other: string; added: RelTag[]; removed: RelTag[] }
  | {
      t: number;
      type: 'reaction';
      who: string;
      building: number;
      aspect: string;
      valence: number;
      /** What about it they noticed: quieter, greener, sit, gather... */
      detail: string;
      how: 'saw' | 'woke' | 'heard';
      change: 'built' | 'removed';
    }
  | { t: number; type: 'grief'; who: string; building: number; btype: string; how: 'saw' | 'woke' | 'heard' }
  | { t: number; type: 'shortage'; resource: Resource; who: string }
  | { t: number; type: 'wish'; phase: 'made' | 'granted' | 'missed' | 'dropped'; wish: Wish }
  /** One resident calls on a friend and they walk somewhere together. */
  | { t: number; type: 'invite'; a: string; b: string; place: number }
  /** Something on a resident's mind surfaced as a passing thought (M3a). Always one of their top three. */
  | { t: number; type: 'thought'; who: string; key: string; about?: SubjectId; vars: Record<string, string>; rank: number }
  | { t: number; type: 'aspiration'; who: string; stage: string; index: number; done: boolean; partner?: string; outcome?: string; kind?: string; subject?: SubjectId; /** The steward built it before they asked. */ early?: boolean }
  /** A new dream forms from what they have lived through (M3b). */
  | { t: number; type: 'dream_formed'; who: string; kind: string; subject?: SubjectId; title: string }
  /** A longer mood starts or ends (M3b). */
  | { t: number; type: 'mood'; who: string; phase: 'start' | 'end'; arc: MoodArc; how?: 'resolved' | 'faded' }
  /** A favour asked, agreed or refused, done or given up (M3c). */
  | { t: number; type: 'favour'; who: string; phase: 'asked' | 'refused' | 'agreed' | 'done' | 'abandoned'; kind: FavourKind; other?: string; reason?: RefusalReason; yield?: Partial<Record<Resource, number>>; placeId?: number }
  /** Yesterday's work, announced at dawn. */
  | { t: number; type: 'production'; by: Record<string, Partial<Record<Resource, number>>> }
  /** A wild plot has been cleared and is open to build on (M3c). */
  | { t: number; type: 'plot_cleared'; building: number; by: string[] }
  /** The steward talks with a resident (M3b). */
  | { t: number; type: 'talk'; who: string; answer: TalkAnswer; counted: boolean }
  | { t: number; type: 'reply'; who: string; reply: import('./replies.js').ReplyKind; stance: import('./replies.js').ReplyStance; aspect?: string }
  /** A resident's view of the steward moved overnight, and why. */
  /** Standing moved: `reasons` pulled the way it moved, `also` the other way (bar round 2: each side with its own sign). */
  | { t: number; type: 'standing'; who: string; delta: number; reasons: string[]; also?: string[] }
  | { t: number; type: 'thinking_of_leaving'; who: string }
  /** Ignored once too often, they stop asking the steward for anything for a while (bar round 3). */
  | { t: number; type: 'gave_up'; who: string }
  /** A dream stage waited on the steward for over a week and the dreamer let it go (bar round 2). */
  | { t: number; type: 'dream_let_go'; who: string; wants: string }
  /** A dream about someone who has since left the valley is put away (bar round 4). */
  | { t: number; type: 'dream_gone'; who: string; other: string }
  /** A hungry resident went looking for food along the brook or the wild edge (bar round 2). */
  | { t: number; type: 'forage'; who: string; placeId: number; food: number }
  /** A newcomer moves into an empty home (M3c). */
  | { t: number; type: 'arrived'; who: string; home: number }
  | { t: number; type: 'decided_to_stay'; who: string }
  | { t: number; type: 'left_town'; who: string }
  | { t: number; type: 'story'; id: string; tone: Tone; cast: string[]; place?: number; topic?: SubjectId; ok?: boolean }
  | { t: number; type: 'gathering'; phase: 'announced' | 'start' | 'end'; gathering: Gathering }
  | { t: number; type: 'weather'; kind: WeatherKind }
  | { t: number; type: 'dilemma_posted'; dilemma: Dilemma }
  | { t: number; type: 'dilemma_closed'; dilemma: Dilemma; reactions: Array<{ who: string; valence: number }> }
  | { t: number; type: 'town_memory'; memory: TownMemory };

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
