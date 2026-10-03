// The seam between the sim and a resident's cognition (DECISIONS.md, 2026-10-03). The sim
// owns the body (position, needs drift, the clock) and the world; a Mind owns appraisal,
// choice and memory. StructuredMind is the first implementation. A brain-sim-backed mind can
// implement the same interface later, one resident at a time.

import type {
  ActivityState,
  Episode,
  ExchangeKind,
  ResidentDef,
  ResidentState,
  SimEvent,
  SimState,
  SubjectId,
} from '../types.js';

export interface MindContext {
  readonly state: SimState;
  readonly tick: number;
  /** Buildings currently being worked (their working emissions are live). */
  readonly worked: ReadonlySet<number>;
  emit(event: SimEvent): void;
  def(id: string): ResidentDef;
}

/** Something a resident experienced, before appraisal. */
export interface Perception {
  subject: SubjectId;
  aspect: string;
  /** Sign and strength of feeling, [-1, 1]. */
  valence: number;
  /** Raw intensity before personality and relevance, [0, 1]. */
  base: number;
  source: 'witnessed' | 'told' | 'recalled';
  from?: string;
  placeId?: number;
  note: string;
  /** Values this experience touches; they scale how much it matters to this resident. */
  relevance?: Array<keyof ResidentDef['values']>;
}

export type Setting = 'passing' | 'together';

export interface Mind {
  /** Appraise an experience; returns the stored episode, or null if it was below salience. */
  perceive(ctx: MindContext, r: ResidentState, p: Perception): Episode | null;
  /** Choose the next activity and where to do it. */
  decide(ctx: MindContext, r: ResidentState): ActivityState;
  /** Does r want to start an exchange with other right now? */
  wantsToInteract(ctx: MindContext, r: ResidentState, other: ResidentState, setting: Setting): boolean;
  /** Which exchange r starts with other. */
  chooseExchange(
    ctx: MindContext,
    r: ResidentState,
    other: ResidentState,
    setting: Setting,
    placeId: number | null,
  ): ExchangeKind;
  /** On arriving somewhere: a chance for the place to cue a memory. */
  onArrive(ctx: MindContext, r: ResidentState, placeId: number): void;
  /** Overnight: turn the day's buffer into beliefs, decay what wasn't rehearsed. */
  consolidate(ctx: MindContext, r: ResidentState): void;
}
