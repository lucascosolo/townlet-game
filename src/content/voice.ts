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
  // Bar round 3: every aspect the sim can form has words (a missing one showed as "matters (still_waiting)").
  went_hungry: 'the steward lets the larder run bare',
  still_waiting: 'the steward keeps {obj} waiting',
  spoke_plainly: 'the steward says what they think',
  heard_me_out: 'the steward hears {obj} out',
  explained: 'the steward explains things',
  excuses: 'the steward makes excuses',
  disagreement: '{S} and {subj} see things differently',
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
    plain: ['Quiet here. Good.', '{S}. Nice.', 'Peaceful, {s}.', 'Could sit at {s} a while.', '{S} suits me.'],
    formal: ['A person can think properly at {s}.', '{S} is admirably calm.', 'I find {s} most restful.', 'There is a stillness at {s} I value.', '{S} is where I go to hear myself think.'],
    warm: ['I could stay at {s} all day.', '{S} is my little bit of peace.', 'I always feel better after {s}.', "There's nowhere calmer than {s}.", '{S} is good for the soul.'],
    chatty: ['Nice spot, {s}, nice spot.', 'Even I go quiet at {s}!', '{S}! Peace! Who knew I liked it!', 'Shh, {s} is having a moment!', 'Top marks for {s}, very restful!'],
    dreamy: ['{S} is humming something only I can hear.', 'At {s} the day slows to a walk.', '{S} keeps a pool of quiet for me.', 'I leave my noise at the edge of {s}.', '{S} breathes slowly, and so do I.'],
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
    plain: ['Asked. Nothing happened.', 'No answer. Noted.', 'Asked the steward. Might as well not have.', 'Heard nothing back.', 'That ask went nowhere.'],
    formal: ['I did ask. Evidently it was not a priority.', 'My request went unanswered.', 'I shall not pretend the silence did not sting.', 'An answer, even a no, would have been a courtesy.', 'It seems my ask was not worth a reply.'],
    warm: ['I suppose nobody heard me, then.', "I did ask. Maybe it got lost.", "Never mind. I'll manage without.", "I thought the steward might answer. Never mind.", "It's all right. I'm used to waiting."],
    chatty: ['I asked and asked! Nothing!', 'Hello? Anyone? My ask? No?', 'Crickets! Absolute crickets!', 'I may as well have asked the well!', 'Nothing! Not even a no!'],
    dreamy: ['I asked into the wind, it seems.', 'The ask drifted off and did not come back.', 'Silence has a shape, and it is my ask.', 'I put a wish on the board and the board kept it.', 'No answer came, only weather.'],
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
    plain: ['Good work today, {other}.', 'You did all right, {other}.', 'Glad you are about, {other}.', 'Solid, {other}. Solid.', 'Town needs more like you, {other}.'],
    formal: ['You have a gift, {other}.', 'That was well done, {other}. Truly.', 'The town is the better for you, {other}.', 'I admire how you go about things, {other}.', 'You are a credit to the valley, {other}.'],
    warm: ['You brighten the place up, {other}.', "I'm glad you're here, {other}.", 'You always know what to say, {other}.', 'You make hard days easier, {other}.', 'I was lucky to meet you, {other}.', 'You have such a good heart, {other}.'],
    chatty: ['{other}, you are a treasure, you know that?', 'What would we do without you, {other}?', '{other}! Legend! Absolute legend!', 'You are the best thing about this town, {other}!', 'Give {other} a medal! Two medals!'],
    dreamy: ['{other}, you make things feel possible.', 'You notice things, {other}. I like that.', 'You are a lamp in this valley, {other}.', 'Things grow better near you, {other}.', 'You have a way of making the day kinder, {other}.'],
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
    plain: ['About before. Sorry.', "Wasn't fair, what I said. Sorry, {other}.", '{other}. My fault. Sorry.', "Shouldn't have said it. Sorry.", 'Sorry, {other}. Let it lie?'],
    formal: ['{other}, I owe you an apology.', 'I spoke out of turn, {other}. Forgive me.', 'I was wrong, {other}, and I am sorry for it.', '{other}, I regret what passed between us.', 'Allow me to apologise, {other}. I was unkind.'],
    warm: ["I'm sorry about the other day, {other}.", "{other}, I hate that we fell out. I'm sorry.", "I didn't mean it, {other}. Truly.", "Can we start again, {other}? I'm sorry.", "I've felt awful since, {other}. Sorry."],
    chatty: ['{other}! I was a fool before. Forgive me?', '{other}! Sorry! Sorry sorry sorry!', 'Right, {other}, I was an idiot. Friends?', "{other}! Forget what I said! I'm a donkey!", 'I take it all back, {other}! Every word!'],
    dreamy: ['I said things I did not mean, {other}.', 'The words came out crooked, {other}. I am sorry.', '{other}, can we let the river take it?', 'I have been carrying what I said, {other}. Let me set it down.', 'Forgive me, {other}. The day was all thorns.'],
  },
  thinSupper: {
    plain: ['Thin pickings.', 'That was not a supper.', 'Bread and not much else.', 'Half a bowl. Again.', 'Stomach still empty.', 'Not enough to go round.', 'Seen better meals in a ditch.', 'Water and crusts, then.'],
    formal: ['One does not complain. One does, however, notice.', 'A thin supper, and the larder bare. We have had better evenings.', 'I shall go to bed hungry, I think.', 'This is not what one would call a meal.', 'I have eaten more at a funeral.', 'We are reduced to scraps, it seems.', 'I shall not pretend that was sufficient.', 'Supper was brief, and so, I fear, is my patience.'],
    warm: ['Not much on the plate tonight, is there.', 'We will manage. We always do. But I am hungry.', 'I gave the last of mine to the cat. Silly of me.', "I'm trying not to think about proper food.", 'Hardly enough to warm the bowl.', "I'll dream of stew, I expect.", "We'll laugh about this one day. Not yet.", 'Another hungry evening. I hate this.'],
    chatty: ['Is that it? Is that ALL?', 'My stomach is writing a strongly worded letter!', 'Thin soup again! Who is running this town?', 'I could eat the table! Legs and all!', 'Supper? That was a rumour of supper!', 'My belly is shouting at me! Rudely!', 'Crumbs! Literally crumbs!', 'If this is supper, I am a duck!'],
    dreamy: ['The plate is mostly plate tonight.', 'Hunger has a sound. It is a sort of hum.', 'I dreamt of bread last night. I may again.', 'The bowl echoes when I set it down.', 'Supper was a memory of supper.', 'I am hollow as an old tree.', 'Even the candle looks hungry.', 'The night tastes of nothing.'],
  },
  forage: {
    plain: ["Found some. Won't last.", 'A basketful. Just about.', 'Nettles and a few eggs. It is food.', 'Better than an empty pot.', 'That is tonight sorted, no more.'],
    formal: ['Not a feast, but it will do for tonight.', 'The hedgerows are generous, if the larder is not.', 'One does what one must; the brook obliged.', 'A modest haul, honestly come by.', 'It is not how I would choose to eat, but we shall eat.'],
    warm: ['Something, at least. Better than nothing on the table.', 'The brook never lets you down, not entirely.', 'Enough for a stew, if I am clever with it.', 'I found more than I expected. Small mercies.', "It'll feed us tonight, and that's what matters."],
    chatty: ['Berries! And a mushroom I am nearly sure about!', 'Provisions! Of a sort!', 'Look! Food! Free food!', 'The hedge is a shop that never shuts!', 'I wrestled a fish! The fish won, but I kept the eggs!'],
    dreamy: ['The hedge gave what it had.', 'The brook keeps a little back for the hungry.', 'The valley feeds you if you ask it quietly.', 'A basket of small kindnesses from the bank.', 'I brought back the colour green and a little more.'],
  },
  gaveUp: {
    plain: ["Not asking again. What's the use.", "Stopped asking. Easier.", 'Done asking.', "I'll sort myself out.", "Won't trouble the steward again."],
    formal: ['I shall not trouble the steward further.', 'I have stopped expecting anything, which is a kind of peace.', 'There is no point in asking where nobody answers.', 'I will manage my own affairs from now on.', 'The steward has made their position clear enough.'],
    warm: ["I've stopped asking. It hurt less than waiting.", "I don't expect much any more. That's all right.", "I'll just get on with things myself.", "I suppose I'll stop hoping for a while.", "No more asks from me. I'm tired of waiting."],
    chatty: ['I give up! Officially! On asking!', 'No more asks! The board can stay empty for all I care!', 'Asking the steward is like shouting at fog!', 'Done! Finished! Not asking!', 'Who needs the steward anyway? Not me! Probably!'],
    dreamy: ['I have folded my hopes up and put them away.', 'The board is a door I no longer knock on.', 'I stopped calling, and the quiet came in.', 'Some wishes are better kept than sent.', 'I will ask the brook instead.'],
  },
  letGo: {
    plain: ['Not this season, then.', "Asked. Waited. Done waiting."],
    formal: ['I shall not ask again. One learns to make do.', 'It was a hope, not a plan. I have let it go.'],
    warm: ["I'll make do. I always have.", 'One day, perhaps. Not now. That is all right.'],
    chatty: ['Fine! Fine! I have other ideas!', 'Never mind! Plenty more dreams where that came from!'],
    dreamy: ['The wish folds itself up and goes back in the drawer.', 'I will dream something else. The valley has room.'],
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

// Bar round 2: five lines a register for the thoughts a place or a memory stirs, so a town of
// ten does not say the same thing about the teahouse four times in a week.
addLines(THOUGHTS['noisy_at_night-'], {
  plain: ['{S} again, all night.', 'No sleep, thanks to {s}.', 'Racket from {s}.'],
  formal: ['{S} kept me awake, and not for the first time.', 'The noise from {s} is intolerable after dark.', 'I should like {s} quieter at night.'],
  warm: ['I was up half the night with {s}.', "I love {s} by day. By night, I don't.", 'A wall, a hedge, anything between me and {s}.'],
  chatty: ['{S}! At midnight! Again!', 'My pillow has given up on {s}!', 'Bang, clatter, {s}, all night long!', 'I counted every clank from {s}!'],
  dreamy: ['{S} talks in its sleep, loudly.', 'The night had {s} in it, and no rest.', 'I lay listening to {s} till the birds.', '{S} is a drum the dark keeps beating.'],
});
addLines(THOUGHTS['smells_lovely+'], {
  plain: ['{S} smells good.', 'Nice air round {s}.', 'Breathed deep by {s}. Worth it.', 'That smell at {s}. Grand.'],
  formal: ['The air about {s} is delightful.', '{S} has a most agreeable scent.', 'One lingers near {s} for the smell alone.', 'I passed {s} slowly, on purpose.'],
  warm: ['I could stand by {s} and just breathe.', 'That smell from {s} makes my day.', 'I always slow down near {s}.', '{S} smells like a good morning.'],
  chatty: ['{S} smells AMAZING!', 'Sniff! {S}! Sniff again!', 'I want to bottle {s}!', 'Follow your nose to {s}!'],
  dreamy: ['{S} is a scent with a place attached.', 'The air near {s} is sweet and slow.', '{S} perfumes the whole afternoon.', 'I carry the smell of {s} home in my sleeves.'],
});
addLines(THOUGHTS['good_times+'], {
  plain: ['Good times at {s}.', 'Always a laugh at {s}.', 'Like {s}. Good company there.', '{S}. Happy place.'],
  formal: ['I have spent many pleasant hours at {s}.', '{S} is where the town is at its best.', 'There is good company to be had at {s}.', 'My happiest hours lately were at {s}.'],
  warm: ["There's always a warm welcome at {s}.", '{S} feels like home, some evenings.', 'Everyone is kinder at {s}, somehow.'],
  chatty: ['{S}! Where the fun is!', 'Best evenings of my life at {s}!', 'Meet you at {s}! Always!', '{S} never has a dull night!'],
  dreamy: ['{S} keeps our laughter in its walls.', 'The evenings at {s} glow in memory.', '{S} is where the town remembers how to smile.', 'I go to {s} to be among the warm.'],
});
addLines(THOUGHTS['too_crowded-'], {
  plain: ['{S} is heaving.', 'Can\'t move at {s}.', 'Too many at {s}.', 'Elbows everywhere at {s}.'],
  formal: ['{S} is uncomfortably full.', 'One cannot think at {s} for the crowd.', 'I shall return to {s} when it is quieter.', 'The press of people at {s} is wearying.'],
  warm: ['{S} is lovely, but not with everyone in it.', "I couldn't hear myself at {s}.", "I'll come back to {s} when it's calmer.", 'Too many of us at {s} today.'],
  chatty: ['{S}! Packed! Even for me!', 'Sardines at {s}!', 'I got jostled at {s} three times!', 'Who invited everyone to {s}?'],
  dreamy: ['{S} was all shoulders and no sky.', 'The crowd at {s} pressed the quiet out of me.', 'Too many voices at {s} for one afternoon.', '{S} was a hive, and I am not a bee.'],
});
addLines(THOUGHTS['nice_addition+'], {
  plain: ['{S}. Good call.', 'Like {s}. Fits.', '{S} belongs here.', 'Good to have {s}.'],
  formal: ['{S} is a welcome addition.', 'The town is improved by {s}.', '{S} was wisely placed.', 'I approve of {s}.'],
  warm: ['{S} has made the place nicer.', "I'm glad we have {s} now.", '{S} suits us, somehow.', 'The valley feels fuller with {s}.'],
  chatty: ['{S}! Love it! More like it!', 'Who put {s} there? Genius!', '{S} is my new favourite thing!', 'Ten out of ten for {s}!'],
  dreamy: ['{S} has settled in like it was always here.', 'The town grew a new leaf: {s}.', '{S} changes the light a little.', 'I keep finding reasons to pass {s}.'],
});
addLines(THOUGHTS['unwelcome_addition-'], {
  plain: ["Don't like {s}.", '{S}. Why?', '{S} is in the way.', 'Could do without {s}.'],
  formal: ['{S} does not belong there.', 'I question the wisdom of {s}.', '{S} spoils the look of things.', 'I would not have placed {s} so.'],
  warm: ["I wish {s} wasn't there, honestly.", '{S} has rather spoilt my view.', "I'm trying to like {s}. It's hard.", '{S} sits wrong with me.'],
  chatty: ['{S}? Who asked for {s}?', 'Ugh, {s}!', 'I walk past {s} with my eyes shut!', '{S} is an eyesore and I said so!'],
  dreamy: ['{S} is a wrong note in the valley.', 'The place winces around {s}.', '{S} casts a shadow I did not want.', 'I look away from {s} and the day is better.'],
});
addLines(THOUGHTS['my_workplace+'], {
  plain: ['Work to do at {s}. Good.', '{S}. My place.', 'Proud of {s}.', 'Somewhere to be useful: {s}.'],
  formal: ['{S} gives my days a shape.', 'I am proud to work at {s}.', '{S} is where I am most myself.', 'It is a fine thing, having {s} to go to.'],
  warm: ['{S} is where I belong.', 'I love walking to {s} in the morning.', '{S} makes me feel useful.', 'I could sing on the way to {s}.'],
  chatty: ['{S}! My kingdom!', 'Off to {s}! Best part of the day!', 'Have you seen what I did at {s}?'],
  dreamy: ['{S} and I understand each other.', 'My hands wake up at {s}.', 'I leave a little of myself at {s} each day.', '{S} hums when I am in it.'],
});
addLines(THOUGHTS['wonderful_time+'], {
  plain: ['{S}. Good memory.', 'Think about {s} a lot.', '{S} was something.', 'Still smiling about {s}.'],
  formal: ['{S} will be remembered fondly.', 'I think of {s} with great pleasure.', '{S} was the town at its finest.', 'We did ourselves proud at {s}.'],
  warm: ['{S} was one of the good nights.', 'I keep thinking back to {s}.', '{S} made me glad to live here.', "I'll never forget {s}."],
  chatty: ['{S}! Best night ever!', 'Remember {s}? I do! Every minute!', '{S} was LEGENDARY!', 'Can we do {s} again? Please?'],
  dreamy: ['{S} still glows when I close my eyes.', 'Part of me is still at {s}.', '{S} left lanterns in my memory.', 'I keep {s} folded somewhere safe.'],
});
addLines(THOUGHTS['weathered_together+'], {
  plain: ['Got through {s}. Together.', '{S}. We held.', 'Remember {s}. Good folk, here.', '{S} showed what we are.'],
  formal: ['{S} proved the worth of this town.', 'We came through {s} as one.', 'I think of {s} and feel we are safe here.', '{S} bound us together.'],
  warm: ['We looked after each other through {s}.', "{S} was awful, and we were lovely to each other.", "I won't forget who helped me during {s}.", 'After {s}, I knew I belonged.'],
  chatty: ['{S}! We survived! Hurrah!', 'Remember {s}? What a night! What a town!', 'We beat {s}! All of us!', 'Nobody does {s} like we do!'],
  dreamy: ['{S} washed us clean and left us closer.', 'We were one roof during {s}.', 'The storm of {s} is still in our bones, and so is the warmth.', '{S} made us a family of sorts.'],
});
addLines(THOUGHTS['glorious_failure+'], {
  plain: ['{S} went bang. Worth it.', 'Ha. {S}.', '{S}. Nearly worked.', 'Smoke everywhere at {s}. Grand.'],
  formal: ['{S} was a failure, and a magnificent one.', 'I admire the ambition of {s}, if not the outcome.', '{S} taught us something, at least.', 'One cannot fault the spirit of {s}.'],
  warm: ['{S} went wrong so beautifully.', 'I laughed till I cried at {s}.', 'Bless whoever made {s}.', '{S} failed, and I loved every second.'],
  chatty: ['{S}! BANG! Brilliant!', 'Best explosion of the year, {s}!', 'More smoke! More {s}!', 'I cheered the loudest at {s}!'],
  dreamy: ['{S} bloomed and burst like a seed-head.', 'There was poetry in how {s} fell apart.', '{S} tried to fly. That counts.', 'The smoke from {s} drew shapes I liked.'],
});
addLines(THOUGHTS['lost_place-'], {
  plain: ['Miss {s}.', '{S}. Gone.', 'Keep looking for {s}.', "Wasn't ready to lose {s}."],
  formal: ['The loss of {s} is a real one.', 'I grieve for {s} more than I expected.', '{S} should not have gone.', 'The valley is poorer without {s}.'],
  warm: ['I keep turning to where {s} was.', "It's so empty without {s}.", '{S} was part of my days.'],
  chatty: ['{S}! Gone! I still can\'t believe it!', 'Bring back {s}!', 'I cried about {s}! Yes, I did!', 'The valley is wrong without {s}!'],
  dreamy: ['The shape of {s} is still in the air.', 'I visit the place {s} was, and it visits me.', '{S} left a quiet behind it.', 'The ground misses {s} too.'],
});
