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

/**
 * Narration for each aspiration stage reached, keyed `${who}:${stage}`. {partner} is the other
 * person involved, {you} is "you" or "the steward".
 */
export const ASPIRATION_LINES: Record<string, string> = {
  'ada:confide': 'Ada tells {partner} about the orchard her late sister planned. "She had every tree drawn out. I never had the heart to plant it."',
  'ada:ask': 'Ada screws up her courage and asks {you} for an orchard.',
  'ada:planted': 'Ada stands among the young trees for a long time. "She would have liked this."',
  'ada:tend': 'Ada has been out in the orchard every day, staking and watering. The trees are taking.',
  'ada:harvest': "The first apples from Ada's orchard. Ada hands them round, one each, and keeps the smallest for herself.",
  'bram:ovens': 'Bram has ovens of his own at last.',
  'bram:win': 'Word has got round: Bram\'s bread is worth getting up for.',
  'bram:plan': 'Bram is planning a feast for the Harvest Supper, flour on every surface.',
  'bram:feast': 'Bram feeds the whole valley at the Harvest Supper. He pretends not to watch everyone eat.',
  'fen:student': 'Fen asks {partner}, gruffly, whether they want to learn to fish. {partner} says yes.',
  'fen:lessons': 'Fen and {partner} have spent long afternoons at the jetty. Fen has said almost nothing. {partner} has learned a great deal.',
  'fen:proud': '{partner} lands a fish alone. Fen nods once, which from Fen is a speech.',
  'juniper:design': 'Juniper has covered the workshop wall in drawings of a glasshouse.',
  'juniper:ask': 'Juniper asks {you} for a glasshouse. "Fourteen timber, and we eat greens all winter. Trust me."',
  'juniper:built': 'The glasshouse goes up. Juniper keeps tapping the panes, just to hear them.',
  'juniper:winter': "Snow outside, greens inside: Juniper's glasshouse is feeding the town through winter.",
  'wren:love': 'Wren has filled a sketchbook with the places they love in town.',
  'wren:sketch': 'Wren sketched the festival from the edge of the crowd. The banner design is nearly there.',
  'wren:ask': 'Wren asks {you}, quietly, for a banner pole on the green.',
  'wren:paint': "Wren's banner goes up. Everyone finds their own house in it.",
  'marlow:restless': 'Marlow watches the trade cart leave again. He stands there a long time after it has gone.',
  'marlow:decide:stay': 'Marlow lets the trade cart go without him. "Turns out I live here."',
  'marlow:decide:leave': 'Marlow climbs onto the trade cart with his bag. He waves until the bend in the road.',
};

/** When a template dream (M3b) comes true. {name}, {x} (its subject), {partner}, {you}, {poss}. */
export const DREAM_DONE_LINES: Record<string, string> = {
  gift: '{name} gives {x} something {subj} made by hand. {x} is touched.',
  thank: '{name} leaves a parcel of food and timber on {yourStep}.',
  mend: '{name} and {x} have made their peace.',
  place: '{name} and {partner} spend a long evening at {x}.',
  relive: 'There is a new bench, and {name} tells everyone about {x} again.',
  remember_gone: 'Friends gather with {name} to remember {x}.',
  settle: '{name} feels at home in the valley now.',
};
