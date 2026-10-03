// Favours (M3c, "ask residents favours"): the steward's way of acting through people. Asked from
// the talk panel, a favour is weighed against how the resident sees the steward, how they are
// doing, and how much has been asked of them lately. A yes means they go and do the work; a no
// always names its real reason. Timber, fish and garden food come from people's hours.

import { residentDef } from '../content/residents.js';
import { rel } from './mind/relationships.js';
import { clamp, unit, urgency } from './needs.js';
import { TICKS_PER_DAY, minuteOf, seasonOf } from './time.js';
import { STEWARD, type ActivityId, type FavourKind, type RefusalReason, type ResidentState, type SimState } from './types.js';
import { liveBuildings } from './world.js';

export const FAVOUR_KINDS: FavourKind[] = ['timber', 'catch', 'garden', 'clear', 'visit', 'mend'];

/** Minutes of work each favour takes. */
export const FAVOUR_MINUTES: Record<FavourKind, number> = { timber: 240, catch: 180, garden: 180, clear: 360, visit: 60, mend: 1 };

/** Asks in a week beyond which being asked again starts to grate. */
export const ASKS_BEFORE_GRATING = 3;
/** A favour not got round to within this long is given up. */
export const FAVOUR_EXPIRES = 2 * TICKS_PER_DAY;
/** Minutes of clearing that open a wild plot. */
export const CLEAR_MINUTES = 18 * 60;
/** Hours of the day favours are worked: 7:00 to 19:30. */
export const FAVOUR_HOURS: [number, number] = [7 * 60, 19 * 60 + 30];

const WORKPLACE: Partial<Record<FavourKind, string>> = { timber: 'woodlot', catch: 'jetty', garden: 'garden' };

export function favourActivity(kind: FavourKind): ActivityId {
  return kind === 'visit' || kind === 'mend' ? 'socialize' : 'work';
}

export function inFavourHours(tick: number): boolean {
  const m = minuteOf(tick);
  return m >= FAVOUR_HOURS[0] && m < FAVOUR_HOURS[1];
}

export function recentAsks(r: ResidentState, tick: number): number {
  return (r.favoursAsked ?? []).filter((t) => tick - t < 7 * TICKS_PER_DAY).length;
}

/**
 * Wild plots that can be cleared now: next to settled land, in a town doing well enough to
 * grow (the valley opens as the town thrives).
 */
export function openPlots(state: SimState): number[] {
  const wild = liveBuildings(state).filter((b) => b.type === 'wild');
  const active = state.order.map((id) => state.residents[id] as ResidentState).filter((r) => !r.departed);
  const thriving = active.length > 0 && active.reduce((s, r) => s + r.disposition, 0) / active.length >= 0.55;
  if (!thriving) return [];
  const isWild = (x: number, y: number) => wild.some((b) => x >= b.x && x < b.x + 8 && y >= b.y && y < b.y + 8);
  return wild
    .filter((b) => {
      // Borders settled land on some side.
      for (let i = 0; i < 8; i++) {
        for (const [x, y] of [
          [b.x - 1, b.y + i],
          [b.x + 8, b.y + i],
          [b.x + i, b.y - 1],
          [b.x + i, b.y + 8],
        ] as const) {
          if (x >= 0 && y >= 0 && x < state.width && y < state.height && !isWild(x, y)) return true;
        }
      }
      return false;
    })
    .map((b) => b.id);
}

/** Where a favour's work happens, or null if there is nowhere to do it. */
export function favourPlace(state: SimState, r: ResidentState, kind: FavourKind, other?: string, plot?: number): number | null {
  const type = WORKPLACE[kind];
  if (type) {
    const places = liveBuildings(state).filter((b) => b.type === type);
    return places[0]?.id ?? null;
  }
  if (kind === 'clear') {
    const open = openPlots(state);
    if (plot !== undefined) return open.includes(plot) ? plot : null;
    return open[0] ?? null;
  }
  const o = other ? state.residents[other] : undefined;
  if (!o || o.departed || o.id === r.id) return null;
  return o.at ?? o.homeId;
}

export interface FavourVerdict {
  yes: boolean;
  /** How willing, before the yes/no line at WILLING. */
  score: number;
  reason?: RefusalReason;
  placeId?: number;
}

/** At or above this, they say yes. */
export const WILLING = 0.45;

/** Would this resident do this favour now? Pure: asking is a separate step. */
export function considerFavour(state: SimState, r: ResidentState, kind: FavourKind, other?: string, plot?: number): FavourVerdict {
  const no = (reason: RefusalReason, score = 0): FavourVerdict => ({ yes: false, score, reason });
  if (r.departed) return no('gone');
  if (r.activity?.id === 'sleep' && r.at === r.homeId) return no('asleep');
  if (r.favour) return no('busy');
  if (r.coldUntil > state.tick) return no('unwell');
  const place = favourPlace(state, r, kind, other, plot);
  if (place === null) return no('nowhere');
  const def = residentDef(r.id);
  if (other && (kind === 'visit' || kind === 'mend')) {
    const toward = rel(r, other);
    if (kind === 'visit' && (toward.tags.includes('rival') || toward.affinity < -0.2)) return no('not_speaking');
    if (kind === 'mend' && toward.affinity < -0.6) return no('not_speaking');
  }
  const steward = rel(r, STEWARD);
  // Each pressure on the answer, signed; the biggest negative one is the reason for a no.
  const parts: Array<[RefusalReason | 'plus', number]> = [
    ['plus', 0.5 + 0.2 * (steward.trust - 0.5) + 0.15 * unit(def.traits.generous) + 0.1 * def.values.community],
    ['distrust', 0.6 * steward.affinity],
    ['asked_often', -0.15 * recentAsks(r, state.tick)],
    ['tired', -0.6 * urgency(r.needs.rest, r.setpoints.rest)],
    ['low', r.mood < 0.45 ? -(0.45 - r.mood) * 1.5 : 0],
  ];
  if (WORKPLACE[kind] || kind === 'clear') parts.push(['plus', 0.1 * def.values.craft]);
  if (kind === 'visit' && other) parts.push(['plus', 0.3 * rel(r, other).affinity]);
  const score = parts.reduce((s, [, v]) => s + v, 0);
  if (score >= WILLING) return { yes: true, score, placeId: place };
  const worst = parts.filter(([k]) => k !== 'plus').sort((a, b) => a[1] - b[1])[0];
  return no(worst && worst[1] < 0 ? (worst[0] as RefusalReason) : 'distrust', score);
}

/** What a finished favour brings in. */
export function favourYield(state: SimState, r: ResidentState, kind: FavourKind): { timber?: number; food?: number } {
  const def = residentDef(r.id);
  const heart = 0.5 + 0.5 * r.mood;
  const round = (v: number) => Math.round(v * 10) / 10;
  switch (kind) {
    case 'timber':
      return { timber: round((4 + 2 * def.values.craft) * heart) };
    case 'catch':
      return { food: round(5 * heart) };
    case 'garden': {
      const season = { spring: 0.8, summer: 1.1, autumn: 1.3, winter: 0.25 }[seasonOf(state.tick)];
      return { food: round(4.5 * heart * season) };
    }
    case 'clear':
      return { timber: 2 };
    default:
      return {};
  }
}

/** Clamp needs touched by a finished favour. */
export function favourSatisfaction(r: ResidentState): void {
  r.needs.purpose = clamp(r.needs.purpose + 0.2);
}
