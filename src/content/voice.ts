import type { Register } from '../sim/types.js';

// Line templates for the M1 narrator. Placeholders: {S}/{s} subject name (capitalised or
// not), {other} another resident, {subj}/{obj}/{poss} the speaker's pronouns.
// A register missing from a moment falls back to `plain`.

export type Lines = Partial<Record<Register, string[]>> & { plain: string[] };

/** More ways to say something (M4: the review counted the same line 29 times in 21 days). */
export function addLines(target: Lines | undefined, more: Partial<Record<Register, string[]>>): void {
  if (!target) return;
  for (const [reg, lines] of Object.entries(more) as Array<[Register, string[]]>) target[reg] = [...(target[reg] ?? []), ...lines];
}

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
  wonderful_time: '{s} was wonderful',
  glorious_failure: '{s} was a glorious mess',
  too_noisy: '{s} was far too loud',
  weathered_together: 'the town came through {s} together',
  kept_awake: "{s} cost {obj} a night's sleep",
  let_me_down: '{S} let {obj} down',
  decided_well: 'the steward makes good decisions',
  decided_badly: 'the steward makes poor decisions',
  turned_me_down: 'the steward turned {obj} down',
  granted_wish: 'the steward makes wishes come true',
  asks_too_much: 'the steward asks too much of {obj}',
  looks_out_for_me: 'the steward looks out for {obj}',
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
  'wonderful_time+': {
    plain: ['{S}. Good night, that.'],
    formal: ['{S} was a credit to the town.'],
    warm: ['Remember {s}? I still smile about it.'],
    chatty: ['{S}! Best night of the year, you know!'],
    dreamy: ['I can still hear {s} if I listen.'],
  },
  'weathered_together+': {
    plain: ['We got through {s}.'],
    formal: ['The town showed its mettle during {s}.'],
    warm: ['Everyone looked out for each other after {s}.'],
    chatty: ['What a night {s} was! And we all pulled together!'],
    dreamy: ['{S} washed something clean.'],
  },
  'glorious_failure+': {
    plain: ['{S}. Went bang. Worth it.'],
    formal: ['{S} was an instructive failure.'],
    warm: ['Oh, {s}! I still laugh about it.'],
    chatty: ['Kaboom! {S}! Ha!'],
    dreamy: ['{S} failed so beautifully.'],
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
  thanks: {
    plain: ['That helps. Thanks.'],
    formal: ['Thank you, steward. It is just what was needed.'],
    warm: ['Oh, thank you! That is exactly what I hoped for.'],
    chatty: ['You did it! Marvellous!'],
    dreamy: ['It came true. Thank you.'],
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
  /** Words over someone or something: {s} is what it is about. The speaker likes it, the other doesn't. */
  argue_for: {
    plain: ['You are wrong about {s}, {other}.', 'Leave {s} alone, {other}.'],
    formal: ['I cannot agree with you about {s}, {other}.', 'You are most unfair to {s}, {other}.'],
    warm: ["You're too hard on {s}, {other}. Honestly.", "Why can't you see the good in {s}, {other}?"],
    chatty: ['{S}? You are SO wrong about {s}, {other}!', 'Oh, come off it, {other}, {s} is fine!'],
    dreamy: ['You never listen, {other}. {S} is good, and you know it.', 'You see {s} all crooked, {other}.'],
  },
  /** The speaker dislikes it, the other defends it. */
  argue_against: {
    plain: ['How can you stick up for {s}, {other}?', "Don't defend {s} to me, {other}."],
    formal: ['I really must disagree about {s}, {other}.', 'You are far too easy on {s}, {other}.'],
    warm: ["I can't believe you're on {s}'s side, {other}.", "You don't see what {s} is really like, {other}."],
    chatty: ['{S}? Really? You LIKE {s}, {other}?!', 'Oh, come off it, {other}! {S} is a disaster!'],
    dreamy: ['You never listen, {other}. {S} is not what you think.', 'You only see the bright side of {s}, {other}.'],
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

/**
 * Reactions to a change in the town, by what changed for that resident. Each works whether
 * something was built or taken away; {s} is the building.
 */
export const REACTIONS: Record<string, Lines> = {
  quieter: {
    plain: ['Quieter. Good.', 'Hear that? Nothing. Good.'],
    formal: ['One can hear oneself think again.', 'A welcome hush, I must say.'],
    warm: ['Oh, it is so much quieter now.', 'I might actually sleep tonight.'],
    chatty: ['Peace and quiet! Who knew I missed it?'],
    dreamy: ['The air has gone soft and still.'],
  },
  noisier: {
    plain: ['Loud. Right by my door.', 'Noise. Great.'],
    formal: ['That will be a racket, I fear.', 'I am not sure my nerves will stand it.'],
    warm: ['Oh dear. That will be loud, won\'t it?'],
    chatty: ['Clang, bang, all day long, is it?'],
    dreamy: ['The quiet I liked has a hole in it now.'],
  },
  greener: {
    plain: ['Bit of green. Nice.', 'Green by the door.'],
    formal: ['A touch of green does wonders.', 'Greenery, at last, near my door.'],
    warm: ['Something green to look at in the morning!', 'Oh, I love that.'],
    chatty: ['Green! Lovely green! Right there!'],
    dreamy: ['Something green is growing where I live.'],
  },
  barer: {
    plain: ['Bare out there now.'],
    formal: ['The view is rather the poorer for it.'],
    warm: ['It looks so bare out my window now.'],
    chatty: ['Where did all the green go?'],
    dreamy: ['The window looks out on less than it did.'],
  },
  busier: {
    plain: ['Busy round here now.'],
    formal: ['There will be rather more coming and going, I see.'],
    warm: ['More people about. That could be nice.', 'Lively round here now.'],
    chatty: ['Folk coming and going! Now that is a town!'],
    dreamy: ['Footsteps, everywhere, all day.'],
  },
  calmer: {
    plain: ['Calmer now.'],
    formal: ['Rather more peaceful, I find.'],
    warm: ['It feels calmer round here.'],
    chatty: ['Bit quiet round here now, isn\'t it?'],
    dreamy: ['The lane has gone still.'],
  },
  scent: {
    plain: ['Smells good.'],
    formal: ['A pleasant smell carries to my door.'],
    warm: ['I can smell it from my doorstep. Lovely.'],
    chatty: ['Smell that! Right to my door!'],
    dreamy: ['The air smells like a memory now.'],
  },
  scentless: {
    plain: ['The smell is gone.'],
    formal: ['I find I miss the smell.'],
    warm: ['I miss that smell in the mornings.'],
    chatty: ['No more nice smell? Shame!'],
    dreamy: ['The air forgot something.'],
  },
  water: {
    plain: ['Water close by. Good.'],
    formal: ['Water near at hand. Sensible.'],
    warm: ['Lovely to have water so close.'],
    chatty: ['Water! Handy!'],
    dreamy: ['I can hear water from here.'],
  },
  dry: {
    plain: ['Further to the water now.'],
    formal: ['Water is rather further off now.'],
    warm: ['I will have to walk further for water.'],
    chatty: ['A long walk for water now!'],
    dreamy: ['The water went away.'],
  },
  gather: {
    plain: ['Somewhere to meet. Good.'],
    formal: ['A proper place to gather. The town needed one.', 'This will bring people together.'],
    warm: ['Somewhere for everyone to meet! Oh, that is lovely.', 'We can all get together there.'],
    chatty: ['A place to meet! Evenings sorted!'],
    dreamy: ['A place for everyone to drift towards.'],
  },
  sit: {
    plain: ['Somewhere to sit. Good.', 'A bench. I will use that.'],
    formal: ['A place to sit and watch the world. Most civilised.'],
    warm: ['Somewhere to sit! My feet thank you.', 'I can just picture an evening there.'],
    chatty: ['A bench! Perfect for a natter!'],
    dreamy: ['A bench, for watching clouds.'],
  },
  pretty: {
    plain: ['Pretty.', 'Looks nice.'],
    formal: ['It does lift the place, I must admit.'],
    warm: ['Oh, that makes the town so much prettier.'],
    chatty: ['Now that is a sight!'],
    dreamy: ['The town is wearing something pretty.'],
  },
  work: {
    plain: ['Good. More work for the town.'],
    formal: ['Honest work. The town is growing up.'],
    warm: ['A proper place of work! That bodes well.'],
    chatty: ['Work! Trade! Things are happening!'],
    dreamy: ['Somewhere to make things. I wonder what.'],
  },
};

/** What each kind of ask sounds like. {s} is the subject (a noisy building), {what} a wanted building. */
export const ASKS: Record<string, Lines> = {
  quieter_home: SPEECH.request as Lines,
  workplace: {
    plain: ['A {what}. That is all I need.'],
    formal: ['Might the town have a {what}? I would put it to good use.'],
    warm: ["If we had a {what}, I'd finally feel useful here."],
    chatty: ['Give me a {what} and I will show you what I can do!'],
    dreamy: ['I keep dreaming of a {what}.'],
  },
  more_food: {
    plain: ['The larder is empty. We need food.'],
    formal: ['The larder is bare, steward. Something must be done.'],
    warm: ["We're running out of food. Could we grow more?"],
    chatty: ['Empty plates all round! More gardens, more fish, anything!'],
    dreamy: ['My stomach has opinions about the larder.'],
  },
  somewhere_to_sit: {
    plain: ['Somewhere to sit near my place. A bench, say.'],
    formal: ['A bench near my home would be a great kindness.'],
    warm: ['Could there be somewhere to sit near me? A bench, maybe?'],
    chatty: ['A bench by mine! For chatting! Please!'],
    dreamy: ['If there were a bench by my door, I would watch the evenings.'],
  },
  more_green: {
    plain: ['Something green by my door.'],
    formal: ['A few flowers near my home would lift my spirits.'],
    warm: ['Could we have some flowers near my place?'],
    chatty: ['Flowers! Hedges! Something green round mine!'],
    dreamy: ['My doorstep wants something growing.'],
  },
  place_to_gather: {
    plain: ['Too crowded. We need another place to sit together.'],
    formal: ['Our one gathering place is overrun. Another would help.'],
    warm: ["It's always packed. Somewhere else to meet would be lovely."],
    chatty: ['Elbow to elbow every evening! Another place to meet!'],
    dreamy: ['We need more than one place to be together.'],
  },
  aspiration: {
    plain: ['I have a favour to ask. A {what}. It would mean a lot.'],
    formal: ['I have thought long about this. Might the town have a {what}?'],
    warm: ["I've been dreaming of a {what}. Could we, do you think?"],
    chatty: ['A {what}! Picture it! Could we? Please?'],
    dreamy: ['I keep seeing a {what} here, as if it already were.'],
  },
};

// ---------------------------------------------------------------- more variety (M4)

addLines(REACTIONS.work, {
  plain: ['Work nearby. Fair enough.', 'That will keep someone busy.', 'Useful. Good.'],
  formal: ['A sound investment in the town, I should think.', 'Industry, at last. Very proper.', 'That will put some backbone in the place.'],
  warm: ["Someone's going to love working there.", 'Oh, more going on round here. I like it.', "That'll bring some life to this end."],
  chatty: ['Ooh, what will they make there?', 'Busy hands, busy town! Love it!', 'Now THAT is progress!'],
  dreamy: ['The town is learning a new trade.', 'Hammers and hands, soon.', 'Something new will be made there.'],
});
addLines(REACTIONS.pretty, {
  plain: ['That helps the look of things.', 'Nicer now.', 'Good. Colour.'],
  formal: ['A most becoming addition.', 'The view is improved, I grant you.', 'Charming. Quite charming.'],
  warm: ['Oh, look at that. Lovely.', "That's brightened my whole walk.", 'I stopped just to look at it.'],
  chatty: ['Look at THAT!', 'Pretty as a picture!', 'The town is showing off now!'],
  dreamy: ['The lane is smiling.', 'Colour, where there was none.', 'It looks like it was always there.'],
});
addLines(REACTIONS.gather, {
  plain: ['Good. Somewhere to go of an evening.', 'Should be busy there.'],
  formal: ['A fine place for the town to meet.', 'Society will be the better for it.'],
  warm: ["I'll see everyone there, I bet.", 'Somewhere to be together. That matters.'],
  chatty: ['Meet you there tonight!', 'Gossip headquarters! Wonderful!'],
  dreamy: ['A place for evenings to collect.', 'Voices will gather there like rain.'],
});
addLines(REACTIONS.sit, {
  formal: ['A bench is the mark of a civilised lane.', 'A seat for the weary. Most thoughtful.'],
  warm: ["I'll have my tea there.", 'Oh, a place to rest my legs.'],
  chatty: ['Bagsy that bench!', 'Sit-down chats! Yes!'],
  dreamy: ['A bench, waiting for someone.', 'Somewhere to sit and be still.'],
});
addLines(REACTIONS.greener, {
  plain: ['Green. Better.', 'Something growing. Good.'],
  chatty: ['More green! Keep it coming!', 'Flowers! At my door!'],
  dreamy: ['Leaves at my window now.', 'Something alive, close by.'],
});
addLines(THOUGHTS['my_workplace+'], {
  plain: ['Work to do. Good.', 'I know where I am now.'],
  formal: ['I shall do good work here.', 'A place to be useful, at last.'],
  warm: ["Somewhere I'm needed. That means a lot.", "I'll make the town proud here."],
  chatty: ['My new place! Come and see!', 'First day! Wish me luck!'],
  dreamy: ['My hands have somewhere to belong.', 'Work, like a door opening.'],
});
addLines(THOUGHTS['good_times+'], {
  plain: ['Good company at {s}.', 'Always someone at {s}.'],
  formal: ['{S} is the heart of the town, I think.', 'One always finds good company at {s}.'],
  warm: ['{S} is where I feel at home.', 'I love an evening at {s}.'],
  chatty: ['See you at {s}! Everyone goes!', '{S} tonight? Obviously!'],
  dreamy: ['{S} glows a little, of an evening.', 'The evenings pool at {s}.'],
});
addLines(THOUGHTS['peaceful_spot+'], {
  plain: ['Peaceful, {s}.', 'Good for thinking, {s}.'],
  formal: ['{S} is a fine place for reflection.', 'I find {s} very restoring.'],
  warm: ['{S} is my little hideaway.', "{S}'s so calm. I needed that."],
  chatty: ['Shh! Thinking! At {s}!', '{S}: my secret spot. Well, not now!'],
  dreamy: ['The quiet at {s} is a soft blanket.', 'Time goes slow at {s}.'],
});
addLines(THOUGHTS['nice_addition+'], {
  plain: ['{S}. Good call.', 'Glad of {s}.'],
  formal: ['{S} was a fine idea.', 'I approve of {s}, I must say.'],
  warm: ['I do like {s}.', '{S} was just what we needed.'],
  chatty: ['{S}! Love it! Who thought of it?', 'Great idea, {s}!'],
  dreamy: ['{S} fits, somehow.', '{S} makes the town make sense.'],
});
addLines(SPEECH.thanks, {
  plain: ['Thank you. I mean it.', "Good. That's what I wanted."],
  formal: ['I am most grateful, steward.', 'You have my thanks. Sincerely.'],
  warm: ["You remembered! Thank you so much.", 'I could hug you. Thank you.'],
  chatty: ['You legend! Thank you!', 'Yes! YES! Thank you!'],
  dreamy: ['You heard me. Thank you.', 'It is just as I pictured it.'],
});
