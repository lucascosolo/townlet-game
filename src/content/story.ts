import type { DilemmaType } from '../sim/types.js';
import type { Lines } from './voice.js';

// Narration for the storyteller's beats. Placeholders as in voice.ts, plus {place}, {festival},
// {what} and {names}.

export const PROPOSALS: Record<DilemmaType, Lines> = {
  market_day: {
    plain: ['A market. Once a week. On the commons.'],
    formal: ['I propose a weekly market on the commons. It would do the town good.'],
    warm: ['What if we had a little market on the commons, once a week? Honestly, it would liven things up.'],
    chatty: ['A market day! Stalls, buyers, the lot! Every week, on the commons!'],
    dreamy: ['A market, with ribbons on the stalls, every week on the commons...'],
  },
  night_baking: {
    plain: ['Let me bake through the night before the festival.'],
    formal: ['May I keep the ovens going overnight before the festival?'],
    warm: ['Could I bake through the night before the festival? Just the once.'],
    chatty: ['Let me fire the ovens all night before the festival! Bread for everyone, you know!'],
    dreamy: ['If the ovens ran all night, the festival would smell of bread.'],
  },
  contraption: {
    plain: ['Want to test my machine on the commons.'],
    formal: ['I would like to demonstrate an invention on the commons.'],
    warm: ["Can I try my contraption on the commons tomorrow? It's nearly ready."],
    chatty: ['Tomorrow, the commons, my contraption! You will not believe it!'],
    dreamy: ['Ooh, can I show everyone my contraption on the commons? It might even work.'],
  },
};

export const DILEMMA_NAMES: Record<DilemmaType, string> = {
  market_day: 'weekly market',
  night_baking: 'night of baking before the festival',
  contraption: 'contraption on the commons',
};

// {at} is the place with its preposition: "on the commons", "at the teahouse", "under the old oak".
export const GATHERING_START: Record<string, string> = {
  festival: 'Lanterns go up {at}: {festival} begins.',
  trade_cart: "Pip's trade cart pulls up {at}.",
  market: 'Market day: stalls go up {at}.',
  musician: 'The fiddler strikes up {at}.',
  contraption: '{festival}: the unveiling {at}.',
};

export const PREPOSITIONS: Record<string, string> = {
  commons: 'on',
  oak: 'under',
  brook: 'by',
};
