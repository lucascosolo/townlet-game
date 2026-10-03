import type { Register } from '../sim/types.js';

// Line templates for the M1 narrator. Placeholders: {S}/{s} subject name (capitalised or
// not), {other} another resident, {subj}/{obj}/{poss} the speaker's pronouns.
// A register missing from a moment falls back to `plain`.

export type Lines = Partial<Record<Register, string[]>> & { plain: string[] };

/** How a belief reads on the notice board: "Ada has decided {statement}". */
export const BELIEF_STATEMENTS: Record<string, string> = {
  noisy_at_night: '{s} keeps {obj} up at night',
  smells_lovely: '{s} makes the mornings smell wonderful',
  good_times: '{s} is where the good evenings happen',
  peaceful_spot: '{s} is a lovely spot',
  too_crowded: '{s} gets too crowded',
  nice_addition: '{s} was a good addition',
  unwelcome_addition: '{s} was a mistake',
  my_workplace: '{s} is {poss} place',
  lost_place: "the town isn't the same without {s}",
  kind_to_me: '{S} is kind',
  rude_to_me: '{S} can be unkind',
  argued_with_me: '{S} is hard to get along with',
  made_amends: '{S} means well',
  listens_to_me: 'the steward listens',
  ignores_me: "the steward doesn't listen",
  improves_town: 'the steward is making the town better',
  spoils_town: "the steward doesn't think things through",
  destroyed_place: "the steward doesn't care what matters here",
};

/** Thoughts and speech, keyed by aspect and sign ("+" or "-"). */
export const THOUGHTS: Record<string, Lines> = {
  'noisy_at_night-': {
    plain: ['{S}. Four in the morning. Again.', 'Could do without {s} at night.'],
    formal: ['One cannot sleep with {s} clattering before dawn.', 'I must say, {s} is a trial at night.'],
    warm: ['I do love bread, but not at four in the morning.', '{S} again... I barely slept.'],
    chatty: ['Who starts work before the birds are up? {S}, that is who!'],
    dreamy: ['The night has an oven in it now.'],
  },
  'smells_lovely+': {
    plain: ['Smells good out there.'],
    formal: ['The smell from {s} is rather civilising.'],
    warm: ['Oh, that smell from {s}. Lovely.'],
    chatty: ['Smell that? That is the smell of a proper town!'],
    dreamy: ['The air tastes like warm bread today.'],
  },
  'good_times+': {
    plain: ['Good evenings at {s}.'],
    formal: ['{S} has become rather dear to me.'],
    warm: ['I always end up at {s}. Best part of the day.', 'Everyone ends up at {s} sooner or later.'],
    chatty: ['{S}! Where everything happens, you know.'],
    dreamy: ['{S} holds the evenings like a cup.'],
  },
  'peaceful_spot+': {
    plain: ['Quiet here. Good.', '{S}. Nice.'],
    formal: ['A person can think properly at {s}.'],
    warm: ['I could stay at {s} all day.'],
    chatty: ['Nice spot, {s}, nice spot.'],
    dreamy: ['{S} is humming something only I can hear.'],
  },
  'too_crowded-': {
    plain: ['Too many people.'],
    formal: ['{S} is rather overrun this evening.'],
    warm: ['A bit much in here tonight.'],
    chatty: ['Busy, busy!'],
    dreamy: ['Too many voices in one place.'],
  },
  'nice_addition+': {
    plain: ['{S}. That will do nicely.'],
    formal: ['{S} is a sensible addition, I must say.'],
    warm: ['Oh, {s}! That makes things nicer.'],
    chatty: ['{S}! Now we are talking!'],
    dreamy: ['{S}... what if it was always meant to be there?'],
  },
  'unwelcome_addition-': {
    plain: ["Don't like {s} there."],
    formal: ['I am not convinced {s} belongs there.'],
    warm: ['Hm. {S} right there? Really?'],
    chatty: ['{S}? There? Well, I never.'],
    dreamy: ['{S} sits wrong, like a crooked picture.'],
  },
  'my_workplace+': {
    plain: ['A place to work. Good.'],
    formal: ['A proper place to work, at last.'],
    warm: ['A place of my own. I could cry.'],
    chatty: ['A place of my own! Wait till they taste what I make here.', '{S}, all mine! Ha!'],
    dreamy: ['{S} is mine to fill with things.'],
  },
  'lost_place-': {
    plain: ['{S} is gone.'],
    formal: ['I shall miss {s} more than I expected.'],
    warm: ['We used to sit by {s} every evening.', 'It looks so empty where {s} was.'],
    chatty: ['{S}, gone? But that was where everyone met!'],
    dreamy: ['There is a hole in the sky where {s} was.'],
  },
};

/** Speech for particular moments. */
export const SPEECH: Record<string, Lines> = {
  request: {
    plain: ['Steward. {S}. Nights. Can something be done?'],
    formal: ['Steward, I must ask: could something be done about the noise from {s}?'],
    warm: ['Steward, I hate to ask, but {s} keeps me up. Could anything be done?'],
    chatty: ['Steward! {S} at four in the morning, you know? Any chance of a fix?'],
    dreamy: ['Steward, what if {s} could be quieter at night?'],
  },
  fulfilled: {
    plain: ['Slept through. Thanks.'],
    formal: ['I slept through the night. Thank you, steward. Truly.'],
    warm: ['I slept all night! Thank you, steward.'],
    chatty: ['Slept like a log! You are a marvel, steward!'],
    dreamy: ['The night was quiet again. Thank you.'],
  },
  lapsed: {
    plain: ['Asked. Nothing happened.'],
    formal: ['I did ask. Evidently it was not a priority.'],
    warm: ['I suppose nobody heard me, then.'],
    chatty: ['I asked and asked! Nothing!'],
    dreamy: ['I asked into the wind, it seems.'],
  },
  share_opinion: {
    plain: ['{statement}. Just saying.', '{statement}.'],
    formal: ['I have come to think {statement}.', 'If you ask me, {statement}.'],
    warm: ['Between us, {statement}.', 'You know, {statement}.', "Can I tell you something? {statement}."],
    chatty: ['Have you noticed? {statement}!', 'Listen, listen: {statement}!'],
    dreamy: ['I keep thinking {statement}.', 'Do you ever feel like {statement}?'],
  },
  comfort: {
    plain: ['Sit. It will pass.'],
    formal: ['Come now, {other}. It will look better tomorrow.'],
    warm: ['Hey, {other}. Come here. It will be all right.'],
    chatty: ["Chin up, {other}! I'll make you something warm."],
    dreamy: ['The bad days drift off, {other}. They always do.'],
  },
  compliment: {
    plain: ['Good work today, {other}.', 'You did all right, {other}.'],
    formal: ['You have a gift, {other}.', 'That was well done, {other}. Truly.'],
    warm: ['You brighten the place up, {other}.', "I'm glad you're here, {other}.", 'You always know what to say, {other}.'],
    chatty: ['{other}, you are a treasure, you know that?', 'What would we do without you, {other}?'],
    dreamy: ['{other}, you make things feel possible.', 'You notice things, {other}. I like that.'],
  },
  argue: {
    plain: ['Leave it, {other}.'],
    formal: ['I really must disagree, {other}.'],
    warm: ['That is not fair, {other}.'],
    chatty: ['Oh, come off it, {other}!'],
    dreamy: ['You never listen, {other}.'],
  },
  apologize: {
    plain: ['About before. Sorry.'],
    formal: ['{other}, I owe you an apology.'],
    warm: ["I'm sorry about the other day, {other}."],
    chatty: ['{other}! I was a fool before. Forgive me?'],
    dreamy: ['I said things I did not mean, {other}.'],
  },
  leaving: {
    plain: ['Maybe this place is not for me.'],
    formal: ['I have begun to wonder whether I belong here.'],
    warm: ['I keep thinking about leaving. I hate that I do.'],
    chatty: ['Maybe the road is calling, you know?'],
    dreamy: ['The road out of town looks brighter every day.'],
  },
  staying: {
    plain: ['Staying.'],
    formal: ['I believe I shall stay after all.'],
    warm: ["I'm staying. This is home."],
    chatty: ['Who was I kidding? I am staying!'],
    dreamy: ['The town held on to me.'],
  },
};
