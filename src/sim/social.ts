// Social exchanges (spec 4.2.6): small interaction patterns whose outcome depends on traits,
// relationship and mood. Each side appraises what happened through its own mind.

import { chance } from './rng.js';
import { clamp, unit } from './needs.js';
import type { Mind, MindContext, Setting } from './mind/mind.js';
import { opinion } from './mind/memory.js';
import { adjust, rel, warmth } from './mind/relationships.js';
import { gossipTopic, sharedFondPlace } from './mind/structured.js';
import type { ExchangeKind, ResidentState } from './types.js';

const WARM: ExchangeKind[] = ['chat', 'compliment', 'comfort', 'reminisce', 'tease', 'share_meal'];

function both(a: ResidentState, b: ResidentState, d: { affinity?: number; trust?: number }, tick: number) {
  adjust(a, b.id, d, tick);
  adjust(b, a.id, d, tick);
}

function bump(r: ResidentState, need: keyof ResidentState['needs'], v: number) {
  r.needs[need] = clamp(r.needs[need] + v);
}

export function runExchange(
  ctx: MindContext,
  mind: Mind,
  a: ResidentState,
  b: ResidentState,
  kind: ExchangeKind,
  setting: Setting,
  placeId: number | null,
): void {
  const tick = ctx.tick;
  const da = ctx.def(a.id);
  const db = ctx.def(b.id);
  const ab = rel(a, b.id);
  const ba = rel(b, a.id);
  // Pleasant exchanges build affinity in proportion to how well the two fit.
  const fit = warmth(da, db);
  const warm = (amount: number) => both(a, b, { affinity: amount * fit }, tick);
  a.lastExchange[b.id] = tick;
  b.lastExchange[a.id] = tick;
  adjust(a, b.id, { familiarity: kind === 'greet' ? 0.04 : 0.02 }, tick);
  adjust(b, a.id, { familiarity: kind === 'greet' ? 0.04 : 0.02 }, tick);
  bump(a, 'company', 0.05);
  bump(b, 'company', 0.05);

  let ok = true;
  let topic: { subject: string; aspect: string; valence: number } | undefined;

  switch (kind) {
    case 'greet':
      warm(0.01);
      break;
    case 'chat':
      ok = chance(a, clamp(0.7 + 0.2 * (b.mood - 0.5) + 0.2 * ba.affinity));
      if (ok) {
        warm(0.03);
        bump(a, 'delight', 0.02);
        bump(b, 'delight', 0.02);
      }
      break;
    case 'share_opinion': {
      const t = gossipTopic(a, b, tick);
      const belief = t ? a.beliefs[t.key] : undefined;
      if (!t || !belief) {
        kind = 'chat';
        warm(0.02);
        break;
      }
      topic = { subject: belief.subject, aspect: belief.aspect, valence: belief.valence };
      a.told[`${b.id}|${t.key}`] = tick;
      const credibility = ba.trust * (0.6 + 0.4 * ba.familiarity);
      mind.perceive(ctx, b, {
        subject: belief.subject,
        aspect: belief.aspect,
        valence: belief.valence,
        base: belief.strength * 0.55 * credibility,
        source: 'told',
        from: a.id,
        note: `heard it from ${da.name}`,
        ...(placeId !== null ? { placeId } : {}),
      });
      // Saying it out loud rehearses it.
      mind.perceive(ctx, a, {
        subject: belief.subject,
        aspect: belief.aspect,
        valence: belief.valence,
        base: 0.08,
        source: 'recalled',
        note: `told ${db.name}`,
      });
      const theirs = opinion(b, belief.subject);
      if (Math.abs(theirs) > 0.1 && Math.sign(theirs) !== Math.sign(belief.valence)) {
        ok = false;
        adjust(b, a.id, { affinity: -0.03 });
      } else if (Math.abs(theirs) > 0.1) {
        both(a, b, { affinity: 0.04 }, tick);
      }
      break;
    }
    case 'compliment':
      adjust(b, a.id, { affinity: 0.04 * Math.max(fit, 0.3) });
      bump(b, 'delight', 0.05);
      mind.perceive(ctx, b, {
        subject: `r:${a.id}`,
        aspect: 'kind_to_me',
        valence: 0.6,
        base: 0.35,
        source: 'witnessed',
        note: `${da.name} said something kind`,
        ...(placeId !== null ? { placeId } : {}),
      });
      break;
    case 'comfort':
      ok = ba.affinity > -0.2;
      if (ok) {
        adjust(b, a.id, { affinity: 0.06, trust: 0.05 });
        for (const e of b.emotions) if (e.kind === 'annoyance' || e.kind === 'worry' || e.kind === 'grief') e.intensity *= 0.6;
        bump(b, 'comfort', 0.08);
        mind.perceive(ctx, b, {
          subject: `r:${a.id}`,
          aspect: 'kind_to_me',
          valence: 0.8,
          base: 0.5,
          source: 'witnessed',
          note: `${da.name} comforted ${db.pronouns.obj}`,
          ...(placeId !== null ? { placeId } : {}),
        });
      }
      break;
    case 'reminisce': {
      const place = sharedFondPlace(a, b, placeId, tick);
      if (!place) {
        kind = 'chat';
        warm(0.02);
        break;
      }
      warm(0.04);
      bump(a, 'delight', 0.06);
      bump(b, 'delight', 0.06);
      a.told[`reminisce|${b.id}|${place}`] = tick;
      b.told[`reminisce|${a.id}|${place}`] = tick;
      for (const r of [a, b]) {
        const bel = Object.values(r.beliefs).filter((x) => x.subject === place && x.valence > 0).sort((x, y) => y.strength - x.strength)[0];
        if (!bel) continue;
        topic ??= { subject: bel.subject, aspect: bel.aspect, valence: bel.valence };
        mind.perceive(ctx, r, { subject: bel.subject, aspect: bel.aspect, valence: bel.valence, base: 0.1, source: 'recalled', note: 'reminisced' });
      }
      break;
    }
    case 'tease':
      ok = chance(a, clamp(0.5 + 0.3 * unit(db.traits.sociable) + 0.3 * (b.mood - 0.5) + 0.3 * ba.affinity));
      if (ok) {
        warm(0.04);
        bump(a, 'delight', 0.04);
        bump(b, 'delight', 0.04);
      } else {
        adjust(b, a.id, { affinity: -0.06 });
        mind.perceive(ctx, b, {
          subject: `r:${a.id}`,
          aspect: 'rude_to_me',
          valence: -0.5,
          base: 0.35,
          source: 'witnessed',
          note: `${da.name}'s joke stung`,
        });
      }
      break;
    case 'argue':
      both(a, b, { affinity: -0.08, trust: -0.04 }, tick);
      ab.lastArgue = tick;
      ba.lastArgue = tick;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        mind.perceive(ctx, x, {
          subject: `r:${y.id}`,
          aspect: 'argued_with_me',
          valence: -0.6,
          base: 0.45,
          source: 'witnessed',
          note: `argued with ${ctx.def(y.id).name}`,
          ...(placeId !== null ? { placeId } : {}),
        });
      }
      break;
    case 'apologize':
      ok = chance(a, 0.5 + 0.4 * unit(db.traits.generous));
      if (ok) {
        both(a, b, { affinity: 0.08 }, tick);
        ab.lastArgue = -1;
        ba.lastArgue = -1;
        mind.perceive(ctx, b, {
          subject: `r:${a.id}`,
          aspect: 'made_amends',
          valence: 0.6,
          base: 0.4,
          source: 'witnessed',
          note: `${da.name} apologised`,
        });
      } else {
        adjust(b, a.id, { affinity: -0.02 });
      }
      break;
    case 'share_meal':
      warm(0.03);
      bump(a, 'company', 0.08);
      bump(b, 'company', 0.08);
      bump(a, 'delight', 0.04);
      bump(b, 'delight', 0.04);
      break;
  }

  // Good times at a shared place attach to the place.
  if (ok && placeId !== null && setting === 'together' && WARM.includes(kind) && chance(a, 0.5)) {
    for (const r of [a, b]) {
      mind.perceive(ctx, r, {
        subject: `b:${placeId}`,
        aspect: 'good_times',
        valence: 0.7,
        base: 0.35 + 0.25 * ctx.def(r.id).values.community,
        source: 'witnessed',
        placeId,
        note: `${kind.replace('_', ' ')} with ${ctx.def(r === a ? b.id : a.id).name}`,
        relevance: ['community'],
      });
    }
  }

  ctx.emit({ t: tick, type: 'exchange', kind, a: a.id, b: b.id, place: placeId, ok, ...(topic ? { topic } : {}) });
}

