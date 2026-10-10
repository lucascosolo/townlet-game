// Winter stores (DECISIONS.md, 2026-10-04): a granary, and a yearly quest that Juniper raises.
// Food that would spill over the larder's cap goes into the granary, surplus is carried across in
// daylight, and the town aims to have its target put by on the first day of winter. In winter the
// granary keeps the larder stocked.

import { residentDef } from "../content/residents.js";
import { active } from "./story/director.js";
import type { AspirationHost } from "./story/aspirations.js";
import { DAYS_PER_SEASON, dayOf, minuteOf } from "./time.js";
import { STEWARD, type ResidentState, type SimState } from "./types.js";
import { liveBuildings } from "./world.js";

/** What the larder holds; the town's food stock is capped here (sim.ts STOCK_CAP). */
export const LARDER_CAP = 40;
/** How much one granary holds; a bigger town needs more than one. */
export const GRANARY_CAP = 300;
/** What the larder keeps for everyday meals; above this, surplus goes across to the granary. */
export const LARDER_KEEP = 20;
/** Carried across to the granary per daylight hour. */
export const HAUL_PER_HOUR = 2;
/** The first day of winter, as a day of the year (1–28). */
export const WINTER_DAY = 3 * DAYS_PER_SEASON + 1;
/** The first day of autumn: the quest is raised by then at the latest. */
const AUTUMN_DAY = 2 * DAYS_PER_SEASON + 1;
export const STORES_PER_RESIDENT = 30;
export const MIN_STORES_TARGET = 150;
/** Bar round 6: the granary ask quotes the winter stores, not whatever its keeper dreams of. */
/** Bar round 8: the share of a granary's surplus over the winter target that spoils each dawn. */
export const SURPLUS_SPOILS = 0.08;
export const STORES_WHY = 'put enough by for winter';
/** The larder counts as overflowing at this share of its cap. */
const OVERFLOWING = 0.9;

export const yearOf = (tick: number) =>
  Math.floor((dayOf(tick) - 1) / (4 * DAYS_PER_SEASON));
export const dayOfYear = (tick: number) =>
  ((dayOf(tick) - 1) % (4 * DAYS_PER_SEASON)) + 1;

export function hasGranary(state: SimState): boolean {
  return granaryRoom(state) > 0;
}

/** What the town's granaries hold between them. */
export function granaryRoom(state: SimState): number {
  return (
    GRANARY_CAP *
    liveBuildings(state).filter((b) => b.type === "granary").length
  );
}

export function storesTarget(state: SimState): number {
  return Math.max(
    MIN_STORES_TARGET,
    STORES_PER_RESIDENT * active(state).length,
  );
}

/** Days until the first day of winter; 0 in winter itself. */
export function daysToWinter(tick: number): number {
  return Math.max(0, WINTER_DAY - dayOfYear(tick));
}

/** Who keeps the stores: Juniper, or else whoever cares most for the town's prosperity. */
function keeper(state: SimState): ResidentState | undefined {
  const people = active(state);
  return (
    people.find((r) => r.id === "juniper") ??
    [...people].sort(
      (a, b) =>
        residentDef(b.id).values.prosperity -
        residentDef(a.id).values.prosperity,
    )[0]
  );
}

/** Food that would go over the larder's cap goes into the granary while it has room. Returns what was kept. */
export function overflowToGranary(state: SimState, overflow: number): number {
  if (overflow <= 0 || !hasGranary(state)) return 0;
  const kept = Math.min(overflow, granaryRoom(state) - (state.granary ?? 0));
  if (kept <= 0) return 0;
  state.granary = (state.granary ?? 0) + kept;
  return kept;
}

/** Take food from the granary (a meal when the larder is bare). Returns what was taken. */
export function drawFromGranary(state: SimState, want: number): number {
  const got = Math.min(want, state.granary ?? 0);
  if (got > 0) state.granary = (state.granary ?? 0) - got;
  return got;
}

/** Each hour: in daylight, outside winter, surplus is carried from the larder to the granary. */
export function storesHourly(state: SimState): void {
  if (!hasGranary(state) || dayOfYear(state.tick) >= WINTER_DAY) return;
  const hour = Math.floor(minuteOf(state.tick) / 60);
  if (hour < 7 || hour >= 20) return;
  const move = Math.min(
    HAUL_PER_HOUR,
    state.stock.food - LARDER_KEEP,
    granaryRoom(state) - (state.granary ?? 0),
  );
  if (move <= 0) return;
  state.stock.food -= move;
  state.granary = (state.granary ?? 0) + move;
}

/**
 * Each dawn: on the first day of spring what's left of the stores becomes a feast; the quest is
 * raised, judged on the first day of winter, and in winter the granary keeps the larder stocked.
 */
export function storesDawn(h: AspirationHost): void {
  const state = h.state;
  const year = yearOf(state.tick);
  const doy = dayOfYear(state.tick);
  if (doy === 1 && (state.granary ?? 0) >= 1) springFeast(h);
  if (!state.stores || state.stores.year !== year)
    state.stores = { year, target: storesTarget(state), asked: false };
  const q = state.stores;
  // Bar round 8: what is put by beyond the winter target slowly spoils, so a full granary is not
  // the end of food as a question (251 food at winter with nothing more to decide).
  const over = (state.granary ?? 0) - q.target;
  if (over > 0) state.granary = (state.granary ?? 0) - over * SURPLUS_SPOILS;
  const stored = () => Math.floor(state.granary ?? 0);
  const event = (phase: "asked" | "reminded" | "met" | "short", who: string) =>
    h.emitEvent({
      t: state.tick,
      type: "stores",
      phase,
      who,
      stored: stored(),
      target: q.target,
      daysLeft: daysToWinter(state.tick),
    });

  if (doy < WINTER_DAY) {
    const k = keeper(state);
    if (!k) return;
    const granary = hasGranary(state);
    // The target is set when the quest is raised, and grows with the town until then.
    if (
      !q.asked &&
      (doy >= AUTUMN_DAY || state.stock.food >= LARDER_CAP * OVERFLOWING)
    ) {
      q.asked = true;
      q.by = k.id;
      q.target = storesTarget(state);
      event(granary ? "reminded" : "asked", k.id);
    }
    // Progress worth telling: a quarter, half and three quarters of the way there.
    if (q.asked && !q.outcome) {
      const quarter = Math.min(3, Math.floor((4 * stored()) / q.target));
      if (quarter > (q.told ?? 0)) {
        q.told = quarter;
        h.emitEvent({ t: state.tick, type: 'stores', phase: 'progress', who: q.by ?? k.id, stored: stored(), target: q.target, daysLeft: daysToWinter(state.tick) });
      }
    }
        // Until there is room for the target, the keeper keeps asking for a granary (not while a request is waiting).
    if (q.asked && granaryRoom(state) < q.target) {
      const mine = state.requests.filter(
        (x) => x.kind === "aspiration" && x.wants === "granary",
      );
      const last = mine[mine.length - 1];
      if (
        !mine.some((x) => x.status === "open") &&
        (!last || state.tick - (last.closedTick ?? 0) >= 3 * 1440)
      )
        h.ask(k, "aspiration", "granary", STORES_WHY);
    }
    return;
  }

  // Winter: the granary tops the larder back up each morning. The quest is judged on what was
  // put by before that first top-up.
  const before = stored();
  const short = LARDER_KEEP - state.stock.food;
  if (short > 0) state.stock.food += drawFromGranary(state, short);
  if (!q.asked || q.outcome) return;
  const by = (
    q.by && state.residents[q.by] && !state.residents[q.by]?.departed
      ? state.residents[q.by]
      : keeper(state)
  ) as ResidentState | undefined;
  if (!by) return;
  const ctx = h.mindContext();
  if (before >= q.target) {
    q.outcome = "met";
    for (const x of active(state)) {
      if (x.id !== by.id)
        h.mind.perceive(ctx, x, {
          subject: `r:${by.id}`,
          aspect: "kind_to_me",
          valence: 0.6,
          base: 0.35,
          source: "witnessed",
          note: "filled the granary for winter",
        });
    }
    h.mind.perceive(ctx, by, {
      subject: STEWARD,
      aspect: "granted_wish",
      valence: 0.8,
      base: 0.6,
      source: "witnessed",
      note: "helped fill the granary for winter",
    });
  } else {
    q.outcome = "short";
    h.mind.perceive(ctx, by, {
      subject: STEWARD,
      aspect: "looks_out_for_me",
      valence: -0.2,
      base: 0.15,
      source: "witnessed",
      // Audit 2026-10-10: a deed, so "you let winter come..." reads ("You winter came..." did not).
      note: "let winter come with the granary short",
    });
  }
  h.emitEvent({
    t: state.tick,
    type: "stores",
    phase: q.outcome,
    who: by.id,
    stored: before,
    target: q.target,
    daysLeft: 0,
  });
}

/** The first day of spring: last year's stores won't keep, so they are shared out at a feast. */
function springFeast(h: AspirationHost): void {
  const state = h.state;
  // Bar round 5: two thirds are shared out and a third carried into spring, so the town does not go
  // from 300 food put by to a bare-larder worry the next morning.
  const all = state.granary ?? 0;
  const kept = Math.floor(all / 3);
  const eaten = Math.floor(all - kept);
  state.granary = all - eaten;
  const people = active(state);
  const k = keeper(state);
  if (!k || people.length === 0) return;
  // Plenty to go round lifts everyone; a token spread still counts for something.
  const lift = Math.min(0.35, 0.1 + eaten / (people.length * 40));
  const ctx = h.mindContext();
  for (const x of people) {
    x.needs.food = Math.min(1, x.needs.food + 0.3);
    x.needs.delight = Math.min(1, x.needs.delight + lift);
    if (x.id !== k.id && eaten >= people.length * 5)
      h.mind.perceive(ctx, x, {
        subject: `r:${k.id}`,
        aspect: "kind_to_me",
        valence: 0.4,
        base: 0.2,
        source: "witnessed",
        note: "shared out the winter stores",
      });
  }
  h.emitEvent({
    t: state.tick,
    type: "stores",
    phase: "feast",
    who: k.id,
    stored: eaten,
    target: 0,
    daysLeft: daysToWinter(state.tick),
    kept,
  });
}
