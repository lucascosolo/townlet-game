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
  lantern_walk: {
    plain: ['Lanterns. A walk along the water, tomorrow night. Say yes.'],
    formal: ['Might we have a lantern walk tomorrow evening? Everyone, with a light, along the water.'],
    warm: ['What if we all walked out with lanterns tomorrow night? It would be lovely, honestly.'],
    chatty: ['Lanterns! Tomorrow night! All of us, lit up like fireflies!'],
    dreamy: ['A line of lanterns along the water, tomorrow, after dark. Can we?'],
  },
  tales_night: {
    plain: ['An evening of tales. Everyone brings one.'],
    formal: ['I propose an evening of stories, tomorrow, with everyone invited to tell one.'],
    warm: ["Could we have a night of tales tomorrow? Everyone has one, even if they say they don't."],
    chatty: ['Story night! Tomorrow! I have at least six!'],
    dreamy: ['Tomorrow evening, all of us, and a story each. Old ones are best.'],
  },
  cart_stop: {
    plain: ["Let Pip's cart stop the night on the commons. Pip pays in timber."],
    formal: ["Pip has asked to stop the night on the commons with the cart, and will pay for the pitch in timber. I am in favour."],
    warm: ["Pip wants to stop the night with the cart. It'd mean a bit of timber for us, and company of an evening."],
    chatty: ["Pip's cart, overnight, on the commons! Timber for the pitch! Lamps and trade till late!"],
    dreamy: ["Pip's cart could stop the night. Lamps on the commons, and a little timber for it."],
  },
  bonfire_night: {
    plain: ['A bonfire on the commons tomorrow. Three timber. Worth it.'],
    formal: ['I propose a bonfire on the commons tomorrow evening. It costs a little timber and brings everyone out.'],
    warm: ['Can we have a bonfire tomorrow night? Just a little timber, and everyone round it.'],
    chatty: ['BONFIRE! Tomorrow! Big one! Three timber, who cares!'],
    dreamy: ['A fire on the commons tomorrow, and all our faces in it.'],
  },
  wild_meadow: {
    plain: ['Leave the far field wild. For the bees.'],
    formal: ['I propose we leave the far field unmown this year, as a meadow for the bees and the birds.'],
    warm: ["Could we let the far field go wild? Flowers, bees, the lot. It wouldn't cost a thing."],
    chatty: ['A wild meadow! No mowing! Bees everywhere! Say yes!'],
    dreamy: ['If we left the far field alone, it would fill with flowers by itself.'],
  },
  quiet_bell: {
    plain: ['A bell at ten. Quiet after. That is all I ask.'],
    formal: ['I propose a bell at ten each night, and quiet in the lanes after it.'],
    warm: ['Could we ring a bell at ten, and keep things quiet after? Some of us need our sleep.'],
    chatty: ['A quiet bell! Ten o\'clock! Then hush! Honestly, it would change my life!'],
    dreamy: ['One bell at ten, and then the valley could hear itself breathe.'],
  },
  shared_supper: {
    plain: ['Supper for everyone tomorrow, on the commons. Eight food from the larder.'],
    formal: ['I propose a shared supper on the commons tomorrow evening, eight food from the larder, everyone welcome.'],
    warm: ['What if we all ate together tomorrow, on the commons? It would take a bit from the larder, but it would be worth it.'],
    chatty: ['Supper on the commons! Everyone! Tomorrow! Long tables! Eight food, who is counting!'],
    dreamy: ['One long table on the commons tomorrow, and all of us at it.'],
  },
};

export const DILEMMA_NAMES: Record<DilemmaType, string> = {
  market_day: 'weekly market',
  night_baking: 'night of baking before the festival',
  contraption: 'contraption on the commons',
  lantern_walk: 'lantern walk tomorrow night',
  tales_night: 'night of tales',
  cart_stop: "night's stop for Pip's cart",
  bonfire_night: 'bonfire on the commons',
  wild_meadow: 'wild meadow in the far field',
  quiet_bell: 'bell for quiet at ten',
  shared_supper: 'shared supper on the commons',
};

// {at} is the place with its preposition: "on the commons", "at the teahouse", "under the old oak".
export const GATHERING_START: Record<string, string> = {
  festival: 'Lanterns go up {at}: {festival} begins.',
  trade_cart: "Pip's trade cart pulls up {at}.",
  market: 'Market day: stalls go up {at}.',
  musician: 'The fiddler strikes up {at}.',
  contraption: '{festival}: the unveiling {at}.',
  lantern_walk: 'Lanterns are lit {at}: the lantern walk sets off.',
  tales: 'Chairs are pulled round {at}: {festival} begins.',
  bonfire: 'The bonfire catches {at}.',
  supper: 'Long tables go out {at}, and everyone comes to supper.',
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
  'ada:planted:early': 'Ada finds the orchard already planted, the very thing she had been working up the courage to ask for. She stands among the young trees a long time. "How did you know? She would have liked this."',
  'ada:tend': 'Ada has been out in the orchard every day, staking and watering. The trees are taking.',
  'ada:harvest': "The first apples from Ada's orchard. Ada hands them round, one each, and keeps the smallest for herself.",
  'bram:ovens': 'Bram has ovens of his own at last.',
  'bram:win': 'Word has got round: Bram\'s bread is worth getting up for.',
  'bram:plan': 'Bram is planning a feast for the Harvest Supper, flour on every surface.',
  'bram:feast': 'Bram feeds the whole valley at the Harvest Supper. He pretends not to watch everyone eat.',
  'fen:student': 'Fen asks {partner}, gruffly, whether {psubj} would like to learn to fish. {partner} says yes.',
  'fen:lessons': 'Fen and {partner} have spent long afternoons at the jetty. Fen has said almost nothing. {partner} has learned a great deal.',
  'fen:proud': '{partner} lands a fish alone. Fen nods once, which from Fen is a speech.',
  'juniper:design': 'Juniper has covered the workshop wall in drawings of a glasshouse.',
  'juniper:ask': 'Juniper asks {you} for a glasshouse. "Fourteen timber, and we eat greens all winter. Trust me."',
  'juniper:built': 'The glasshouse goes up. Juniper keeps tapping the panes, just to hear them.',
  'juniper:built:early': 'Juniper stops dead at the glasshouse. "I was going to draw this. I was going to ASK for this." She taps the panes, just to hear them. "You read my mind."',
  'juniper:winter': "Snow outside, greens inside: Juniper's glasshouse is feeding the town through winter.",
  'wren:love': 'Wren has filled a sketchbook with the places they love in town.',
  'wren:sketch': 'Wren sketched the festival from the edge of the crowd. The banner design is nearly there.',
  'wren:ask': 'Wren asks {you}, quietly, for a banner pole on the green.',
  'wren:paint': "Wren's banner goes up. Everyone finds their own house in it.",
  'wren:paint:early': 'Wren finds a banner pole already standing on the green, waiting. "For me?" The banner goes up that same day, and everyone finds their own house in it.',
  'marlow:asking': 'Marlow has been asking everyone where the trade cart goes after the valley. Nobody quite knows, which seems to please him.',
  'marlow:restless': 'Marlow watches the trade cart leave again. He stands there a long time after it has gone.',
  'marlow:decide:stay': 'Marlow lets the trade cart go without him. "Turns out I live here."',
  // Bar round 7: packing, not going: he goes only if the week's notice runs out (he climbed onto the cart and stayed).
  'marlow:decide:leave': 'Marlow has packed a bag and left it by his door. "When the cart comes back through, I think I go with it."',
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
