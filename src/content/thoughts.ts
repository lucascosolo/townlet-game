import { addLines, type Lines } from './voice.js';

// What residents think and say about what is on their mind (M3a). Keys match MindTopic.key.
// {x} is who or what it is about, {next} the next step of their hope, {label} an event.
// Lines are spoken aloud in chat and shown as thoughts, so they work both ways.

export const MIND_LINES: Record<string, Lines> = {
  'need:rest': {
    plain: ['Tired. Bone tired.', 'Could sleep standing up.', 'Need my bed.'],
    formal: ['I am quite worn out, I confess.', 'An early night is called for.', 'I am rather in want of sleep.'],
    warm: ["I'm so tired I could sleep right here.", 'My eyes keep closing on their own.', 'I could do with a nap, honestly.'],
    chatty: ['Yawn! Sorry! Long day, you know!', "I'm running on fumes today!", "I'm so tired I'm saying silly things!"],
    dreamy: ['The day feels heavy, like wet wool.', 'Everything has gone soft at the edges.', 'My thoughts are moving through honey.'],
  },
  'need:food': {
    plain: ['Hungry.', 'When did I last eat?', 'Could eat.'],
    formal: ['I really must eat something soon.', 'My stomach is making itself heard.', 'A proper meal would be welcome.'],
    warm: ["I'm starving. Is it supper yet?", 'I could eat a whole loaf right now.', 'A bowl of soup would set me right.'],
    chatty: ['Food! I need food! Anything!', "Is anyone else this hungry or is it just me?", 'Is that bread I smell? Please be bread!'],
    dreamy: ['I keep thinking about bread.', 'My stomach is writing poems.', 'I am hollow as a drum.'],
  },
  'need:comfort': {
    plain: ['Could do with a quiet sit by the fire.', 'Not comfortable today.'],
    formal: ['I am not quite at ease today.', 'A little peace at home would set me right.'],
    warm: ['I just want to curl up at home for a bit.', 'Out of sorts today, for no good reason.'],
    chatty: ['Everything is slightly wrong today!', 'Need a sit-down, a cup, and a cushion!'],
    dreamy: ['Nothing fits quite right today.'],
  },
  'need:company': {
    plain: ['Quiet lately. Too quiet.', 'Could do with some company.', 'Nobody about.'],
    formal: ['I have not had a proper conversation in days.', 'I find myself rather wanting company.', 'A little conversation would not go amiss.'],
    warm: ['I miss having someone to talk to.', 'I wish someone would come and sit with me.', "It's been ages since I had a proper chat."],
    chatty: ['Nobody to talk to! Terrible!', "I'll talk to the hens if I have to!", 'Somebody talk to me! Anybody!'],
    dreamy: ['The days are very long on your own.', 'My own voice sounds strange to me lately.'],
  },
  'need:crowded': {
    plain: ['Too many people about.', 'Need some quiet.', 'Want my own company for a bit.'],
    formal: ['I have had quite enough company for one day.', 'I should like an hour to myself.'],
    warm: ['I love them all, but I need a bit of quiet.', 'A quiet corner would suit me just now.'],
    chatty: ['Even I need a break from people sometimes!', 'Too much chatter, even for me!'],
    dreamy: ['Too many voices. I want to hear myself.', 'I want to sit somewhere nobody is.'],
  },
  'need:purpose': {
    plain: ['Nothing useful done today.', 'Need something to do.'],
    formal: ['I feel rather idle. It does not suit me.'],
    warm: ["I'd like to be useful to someone today."],
    chatty: ['Idle hands! Give me a job, anyone!'],
    dreamy: ['I want to make something. Anything.'],
  },
  'need:purpose_job': {
    plain: ['Work is work. I want something that is mine.', 'Same tasks again today.'],
    formal: ['My work is honest, but I should like a purpose of my own.'],
    warm: ["I do my bit, but I'd love something to work towards."],
    chatty: ['Same job, same day! I need a project!'],
    dreamy: ['My hands are busy, but the rest of me is waiting.'],
  },
  'need:delight': {
    plain: ['Same old, same old.', 'Could use something to look forward to.'],
    formal: ['Life has been a little grey of late.'],
    warm: ['I could do with a bit of fun.', 'Something nice should happen soon.'],
    chatty: ["Boring week! Somebody do something interesting!"],
    dreamy: ['I am waiting for something lovely.'],
  },
  'feel:joy': {
    plain: ['Good day, this.', 'Not bad. Not bad at all.', "Can't complain today.", 'Good, this. Good.'],
    formal: ['I find I am in rather good spirits.', 'Today has been most agreeable.', 'I have nothing whatever to complain of.'],
    warm: ["I'm happy today. Properly happy.", 'What a lovely day it has been.', 'I feel lighter today, somehow.', 'Days like this are why I stay.'],
    chatty: ['Best day in ages!', "Can't stop smiling, you know!", 'What a day! What a town!', "I'm in such a good mood, ask me anything!"],
    dreamy: ['Everything is shining a little today.', 'The light is kind today.', 'I could float off the path.'],
  },
  'feel:gratitude': {
    plain: ['{X} did right by me.', 'Owe {x} one.'],
    formal: ['I am grateful to {x}. I should say so.'],
    warm: ['{X} has been so good to me lately.', "I must thank {x} properly."],
    chatty: ['{X}! What a treasure!', 'Did I tell you what {x} did for me?'],
    dreamy: ['{X} was kind when I needed it.'],
  },
  'feel:pride': {
    plain: ['Did well, that.', 'Proud of that one.'],
    formal: ['I believe I may allow myself a little pride.'],
    warm: ["I'm quietly proud of myself today."],
    chatty: ['Did you see? Did you see what I did?'],
    dreamy: ['I made something that will stay.'],
  },
  'feel:annoyance': {
    plain: ['Still cross about {x}.', '{X}. Hmph.'],
    formal: ['I find {x} still vexes me.', 'Frankly, {x} still irritates me.'],
    warm: ['I keep stewing over {x}. I should let it go.', '{X} is still getting under my skin.'],
    chatty: ['{X}! Honestly! Can you believe it?', "Don't get me started on {x}!"],
    dreamy: ['{X} sits in my chest like a stone.'],
  },
  'feel:worry': {
    plain: ['Something is not right.', 'Worried.'],
    formal: ['I have a nagging sense of unease.'],
    warm: ["I can't shake this worry.", 'I hope everything is all right.'],
    chatty: ['Something is up, I can feel it!'],
    dreamy: ['A cloud has parked itself over me.'],
  },
  'feel:grief': {
    plain: ['Miss {x}.', '{X}. Gone.'],
    formal: ['I find I am still grieving {x}.'],
    warm: ['I keep turning to look for {x}.', "I didn't know how much {x} meant to me."],
    chatty: ['It is not the same without {x}, you know.'],
    dreamy: ['There is a gap where {x} was.'],
  },
  'feel:loneliness': {
    plain: ['Lonely.'],
    formal: ['I am rather lonely, if I am honest.'],
    warm: ['I feel a bit alone lately.'],
    chatty: ['Lonely! Me! Who would have thought!'],
    dreamy: ['I am a long way from everyone.'],
  },
  dream: {
    plain: ['Next: {next}.', 'Keep thinking about it. Next, {next}.', 'One thing at a time. {next}.'],
    formal: ['My next task is plain: {next}.', 'I must {next}. One step at a time.', 'I have a plan, and the next part is to {next}.'],
    warm: ["I can't stop thinking about it. Next I need to {next}.", 'One day soon. First I have to {next}.', 'I keep picturing it. I just need to {next}.'],
    chatty: ['Big plans! Next up: {next}!', "Guess what I'm doing next? I'm going to {next}!", 'Can I tell you my plan? First I {next}, then everything!'],
    dreamy: ['If I can just {next}, the rest will follow.', 'Step by step. Next, I {next}.', 'It is waiting for me. I only have to {next}.'],
  },
  'dream:waiting': {
    plain: ['Asked the steward. Waiting.', 'Still waiting to hear from the steward.'],
    formal: ['I have made my request. Now I must be patient.'],
    warm: ["I've asked. I hope the steward says yes.", "I keep checking the board for an answer."],
    chatty: ['Still waiting on the steward! Any day now!'],
    dreamy: ['I sent my wish off. I wonder where it went.'],
  },
  festival_soon: {
    plain: ['{label} tomorrow.', 'Looking forward to {label}.'],
    formal: ['{label} is nearly upon us.'],
    warm: ["I can't wait for {label}!", 'Everyone will be at {label} tomorrow.'],
    chatty: ['{label} tomorrow! What are you wearing?'],
    dreamy: ['Tomorrow the town lights up for {label}.'],
  },
  'weather:rain': {
    plain: ['Rain again.', 'Wet out.'],
    formal: ['Another wet day, I see.'],
    warm: ["Rain's coming down. Good day for a cup of tea."],
    chatty: ['Raining cats and dogs!'],
    dreamy: ['The rain is talking to the roof.'],
  },
  'weather:storm': {
    plain: ['Wild out there.', 'Hope the roof holds.'],
    formal: ['This storm is no joke.'],
    warm: ['I hope everyone is safe indoors.'],
    chatty: ['What a storm! Did you hear that one?'],
    dreamy: ['The sky is shouting tonight.'],
  },
  miss_friend: {
    plain: ["Haven't seen {x} lately.", 'Should look in on {x}.', 'Where is {x} these days?'],
    formal: ['I have not seen {x} in some days. I should call.', 'I must make time to see {x}.'],
    warm: ['I miss {x}. I should go and find them.', 'I wonder what {x} is up to.', "I should knock on {x}'s door."],
    chatty: ['Where has {x} got to? Haven\'t seen them for ages!', 'I must find {x}! So much to tell!'],
    dreamy: ['I keep half-expecting {x} round the corner.', '{X} feels far away lately.'],
  },
  grudge: {
    plain: ['{X}. Still not over it.', 'Keeping clear of {x}.', 'Not ready to talk to {x}.'],
    formal: ['Matters with {x} are unresolved.', 'I would rather not cross paths with {x} today.', 'I shall keep my distance from {x} for now.'],
    warm: ['I wish things were better with {x}.', "I don't know how to fix things with {x}.", 'It still hurts, what happened with {x}.'],
    chatty: ['{X} and me? Not talking! Well, not much!', "I'm not cross with {x}! Well. A bit."],
    dreamy: ['Something went sour between me and {x}.', '{X} and I are out of tune.'],
  },
  'steward:+': {
    plain: ['Steward does right by us.', 'Good steward, this one.', 'Steward listens. Rare thing.'],
    formal: ['The steward is proving a credit to the town.', 'I have every confidence in the steward.'],
    warm: ['I feel looked after here.', 'The steward really listens, you know.', 'Whoever the steward is, they care about this place.'],
    chatty: ['Best steward we ever had!', 'The steward? Marvellous!', 'Say what you like, the steward gets things done!'],
    dreamy: ['Someone is keeping watch over us.', 'The town is in kind hands.'],
  },
  'steward:fresh': {
    plain: ['The steward {x}. Not forgotten.', 'Steward {x}. Hm.', 'The steward {x}, and I noticed.'],
    formal: ['The steward {x}. I have not forgotten it.', 'I am still turning over the fact that the steward {x}.', 'The steward {x}. I say no more than that.'],
    warm: ['The steward {x}, and it stung a little.', "I keep thinking about how the steward {x}.", 'The steward {x}. I wish that had gone differently.'],
    chatty: ['The steward {x}! Can you believe it?', 'Still thinking about it: the steward {x}!', 'The steward {x}. Honestly!'],
    dreamy: ['The steward {x}. It sits in me like a stone.', 'The steward {x}; the day still has that shape.', 'Something the steward did: {x}. It has not settled yet.'],
  },
  'steward:-': {
    plain: ["Steward doesn't listen.", 'Might as well talk to the well.'],
    formal: ['I have my doubts about the steward.', 'The steward has not earned my confidence.'],
    warm: ["I don't think the steward cares about us much.", 'I wish the steward would listen.'],
    chatty: ['The steward? Don\'t make me laugh!'],
    dreamy: ['Nobody is steering this place.'],
  },
  'belief:+': {
    plain: ['Made my mind up about {x}. I like it.', '{X}. Good, that.'],
    formal: ['I have come to a view on {x}. A favourable one.', 'I find I have grown fond of {x}.'],
    warm: ['You know, I\'ve decided I really like {x}.', '{X} has really grown on me.'],
    chatty: ['{X}! Decided! Love it!', 'Have you noticed {x}? I love it now!'],
    dreamy: ['{X} has found a place in me.', '{X} feels like mine now.'],
  },
  'belief:-': {
    plain: ['Made my mind up about {x}. Not good.'],
    formal: ['I have formed a view on {x}, and it is not kind.'],
    warm: ["I've decided {x} isn't for me, I'm afraid."],
    chatty: ['{X}? Decided! Not a fan!'],
    dreamy: ['{X} has gone grey for me.'],
  },
  'belief_person:+': {
    plain: ['{X}\'s all right. Decided.', 'Good sort, {x}.'],
    formal: ['I have come to think very well of {x}.', '{X} has earned my regard.'],
    warm: ['You know, I\'ve really warmed to {x}.', '{X} is a dear, really.'],
    chatty: ['{X}! Lovely! I\'ve decided!', 'Have you met {x}? Properly? Wonderful!'],
    dreamy: ['{X} feels like an old friend already.', 'I like the way {x} sees things.'],
  },
  'belief_person:-': {
    plain: ['Not sure about {x}.', '{X}. Hmm.'],
    formal: ['I have formed a poor view of {x}, I am afraid.'],
    warm: ['I\'ve gone a bit cool on {x}, honestly.'],
    chatty: ['{X}? Bit much, if you ask me!'],
    dreamy: ['{X} and I don\'t share the same weather.'],
  },
  leaving: {
    plain: ['Might be time to move on.', 'Thinking about the road out.'],
    formal: ['I am seriously considering leaving the valley.'],
    warm: ["I don't know if I belong here any more.", 'I keep looking at the road out of town.'],
    chatty: ['Maybe the road is calling, you know?'],
    dreamy: ['The road out keeps whispering.'],
  },
  larder: {
    plain: ['Larder is empty.', 'Food is running out.'],
    formal: ['The stores are worryingly low.'],
    warm: ["I'm worried we won't have enough to eat."],
    chatty: ['The larder! Empty! Again!'],
    dreamy: ['The shelves are bare and echoing.'],
  },
};

/** The same feelings said to the steward's face in talk, where "the steward" would be "you" and the lines above would not bend. */
export const TO_STEWARD_LINES: Record<string, Lines> = {
  'steward:fresh': {
    plain: ['You {x}. Not forgotten.', 'You {x}. Hm.', 'You {x}, and I noticed.'],
    formal: ['You {x}. I have not forgotten it.', 'I am still turning over the fact that you {x}.', 'You {x}. I say no more than that.'],
    warm: ['You {x}, and it stung a little.', 'I keep thinking about how you {x}.', 'You {x}. I wish that had gone differently.'],
    chatty: ['You {x}! Can you believe it?', 'Still thinking about it: you {x}!', 'You {x}. Honestly!'],
    dreamy: ['You {x}. It sits in me like a stone.', 'You {x}; the day still has that shape.', 'Something you did: {x}. It has not settled yet.'],
  },
  'feel:gratitude': {
    plain: ['You did right by me.', 'I owe you one.'],
    formal: ['I am grateful to you. I should have said so sooner.'],
    warm: ["You've been so good to me lately.", 'I keep meaning to thank you properly. Thank you.'],
    chatty: ['You! What a treasure you are!', 'Did I ever thank you? Thank you!'],
    dreamy: ['You were kind when I needed it.'],
  },
  'feel:annoyance': {
    plain: ['Still cross with you.', 'You. Hmph.'],
    formal: ['I confess I am still put out with you.', 'Frankly, you still irritate me.'],
    warm: ["I keep stewing over what you did. I should let it go.", "You're still getting under my skin, I'm afraid."],
    chatty: ['Honestly! You! Can you believe it? I can\'t!', "Don't get me started on you!"],
    dreamy: ['What you did sits in my chest like a stone.'],
  },
};

/** Short journal labels for what is on someone's mind. {x}, {next} and {label} as above. */
export const TOPIC_LABELS: Record<string, string> = {
  'need:rest': 'Tired',
  'need:food': 'Hungry',
  'need:comfort': 'Out of sorts',
  'need:company': 'Wants company',
  'need:crowded': 'Wants some quiet',
  'need:purpose': 'Wants something useful to do',
  'need:purpose_job': 'Wants a project of their own',
  'need:delight': 'Wants something to look forward to',
  'feel:joy': 'Happy',
  'feel:gratitude': 'Grateful to {x}',
  'feel:pride': 'Proud',
  'feel:annoyance': 'Cross about {x}',
  'feel:worry': 'Worried',
  'feel:grief': 'Missing {x}',
  'feel:loneliness': 'Lonely',
  dream: 'Their hope: {next}',
  'dream:waiting': 'Waiting to hear back from you',
  festival_soon: 'Looking forward to {label}',
  'weather:rain': 'The rain',
  'weather:storm': 'The storm',
  miss_friend: 'Missing {x}',
  grudge: 'Things with {x}',
  'steward:+': 'You: feels looked after',
  'steward:fresh': 'You: something you did lately',
  'steward:-': "You: doesn't trust you",
  'belief:+': 'Has taken to {x}',
  'belief_person:+': 'Has warmed to {x}',
  'belief_person:-': 'Has gone cool on {x}',
  'belief:-': 'Has gone off {x}',
  leaving: 'Whether to leave',
  larder: 'The empty larder',
};

export function topicLabel(key: string, vars: Record<string, string>): string {
  const t = TOPIC_LABELS[key] ?? key;
  const out = t.replace(/\{x\}/g, vars.x ?? '').replace(/\{next\}/g, vars.next ?? '').replace(/\{label\}/g, vars.label ?? '');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ---------------------------------------------------------------- more variety (M4)

addLines(MIND_LINES['feel:joy'], {
  plain: ['Decent day.', 'Things are going right.', 'Feeling good. Odd, that.'],
  formal: ['I am content, I find.', 'A thoroughly pleasant day.', 'One could get used to days like this.'],
  warm: ['Everything feels a bit golden today.', "I keep smiling at nothing.", "I'm so glad I live here.", "Today's been kind to me."],
  chatty: ['Everything is brilliant today!', "Ask me how I am! Wonderful, that's how!", 'Is it just me or is today perfect?'],
  dreamy: ['The day is singing.', 'I am full of small suns.', 'Even the stones look happy.'],
});
addLines(MIND_LINES.dream, {
  plain: ['Still on it. {next}.', 'Getting there. {next}, then.'],
  formal: ['I am making progress. Next, I must {next}.', 'Patience. I need to {next}.'],
  warm: ["I'm working on something. Next, I {next}.", "It's coming along. I just have to {next}.", "Wish me luck. I'm trying to {next}."],
  chatty: ['Progress report: next I {next}!', "Nearly there! Well, sort of! I've got to {next}!"],
  dreamy: ['The next stone on the path: {next}.', 'I need to {next}, and then we will see.'],
});
addLines(MIND_LINES['need:crowded'], {
  plain: ['Bit much, all this.', 'Need a quiet hour.'],
  formal: ['I find myself in want of solitude.'],
  warm: ["I'm going to find a quiet spot for a bit.", 'Just need a moment to myself.'],
  chatty: ['Too much natter, even for me!'],
  dreamy: ['I want to be a pebble somewhere quiet.'],
});

// ---------------------------------------------------------------- more variety (bar round 2: one line twelve times in a month)

addLines(MIND_LINES['feel:joy'], {
  plain: ['Nothing wrong with today.', 'Good enough. Better than good.', 'Fine day. Fine town.', "I'll take a day like this."],
  formal: ['I am in excellent humour, and I know it.', 'The day has treated me kindly.', 'I have rarely felt more settled.', 'All is well, and I say so plainly.'],
  warm: ["I could hug the whole valley today.", 'Everything went right, for once.', "I'm glad I got up this morning.", "There's a lot to be happy about, honestly."],
  chatty: ['Today? Ten out of ten!', 'I woke up grinning and I have not stopped!', 'Somebody pinch me, today is lovely!', 'Good mood! Catching! Mind yourself!'],
  dreamy: ['The whole day hums.', 'I am lit from somewhere inside.', 'Today has a gold rim round it.', 'My feet barely touch the path.'],
});
addLines(MIND_LINES['need:rest'], {
  plain: ['Bed. Soon.', 'Done in.'],
  formal: ['I shall retire early, I think.', 'My eyelids are not to be reasoned with.'],
  warm: ['I could sleep for a week.', "I'm yawning so much my jaw aches."],
  chatty: ['Nap time! For me! Now!', 'I have the energy of a damp sock!'],
  dreamy: ['Sleep is calling from a long way off.', 'The pillow is the only thing I can think about.'],
});
addLines(MIND_LINES['need:purpose'], {
  plain: ['Idle. Hate it.', 'Give me a job.', 'Restless hands today.'],
  formal: ['I should like something worth doing.', 'Idleness does not become me.', 'I would be glad of a task.'],
  warm: ['I want to be of some use today.', "I'm no good at sitting about.", 'Somebody must need a hand with something.'],
  chatty: ['Bored! Give me work! Any work!', 'My hands are twiddling themselves!', 'Point me at a job and stand back!'],
  dreamy: ['The day wants a shape and I have none to give it.', 'I am a tool left out in the rain.', 'Even the hens look busier than me.'],
});
addLines(MIND_LINES['need:purpose_job'], {
  plain: ['Same work, same hands. Need a change.', 'Routine. Too much of it.', 'Could do with a new task.'],
  formal: ['The work has grown rather repetitive.', 'I should like a fresh undertaking.', 'One can have too much of the same day.'],
  warm: ["I love my work, but I'd like a change of it.", "I'm going through the motions a bit.", 'A new project would do me good.'],
  chatty: ['New project! Please! Anything new!', 'Same old job! My brain is snoring!', 'I need a challenge before I start singing to the tools!'],
  dreamy: ['The work has worn a groove and I walk in it.', 'I want to make something I have not made before.', 'My hands know the day too well.'],
});
addLines(MIND_LINES['need:delight'], {
  plain: ['Dull stretch.', 'Nothing to look forward to.', 'Need a bit of fun.'],
  formal: ['The days have run together of late.', 'I find I am in want of amusement.', 'A small pleasure would not go amiss.'],
  warm: ["I'd love something to look forward to.", "It's been a long, plain week.", 'A bit of music, a bit of a laugh. That would do it.'],
  chatty: ['Where is the fun? Who has the fun?', 'This week needs a party!', 'I would settle for a mildly interesting hen!'],
  dreamy: ['The days are the colour of porridge.', 'I am waiting for a bright thing.', 'Something lovely is overdue.'],
});
addLines(MIND_LINES['need:crowded'], {
  plain: ['Too many people.', 'Need some quiet.'],
  formal: ['I have had rather enough company for one day.', 'A little solitude would restore me.'],
  warm: ["I love everyone, but I'd like them elsewhere for an hour.", 'I need a bit of peace, just for a bit.'],
  chatty: ['Even I need a break from people! Imagine!', 'Everyone, lovely, but hush for a minute!'],
  dreamy: ['The air is thick with other people.', 'I want a corner and a closed door.'],
});
addLines(MIND_LINES['need:comfort'], {
  plain: ['Could do with my chair.', 'Not settled today.', 'Want my own four walls.'],
  formal: ['I am somewhat out of sorts.', 'I should like to be at home with the door shut.', 'Comfort is in short supply today.'],
  warm: ['I just want to be cosy for a bit.', "I'm a bit frayed round the edges today.", 'A warm fire would mend me.'],
  chatty: ['Cushion! Blanket! Tea! In that order!', 'I feel like a sock on the wrong foot!', 'Nothing is comfy today, not even me!'],
  dreamy: ['The day scratches.', 'I want to be wrapped in something soft.', 'Home is a word I keep saying to myself.'],
});
addLines(MIND_LINES['need:company'], {
  plain: ['Talk to me, someone.', 'Lonely stretch.'],
  formal: ['Some company would be most welcome.', 'I have been rather alone with my thoughts.'],
  warm: ["I'd love someone to sit with.", 'The house is very quiet without a visitor.'],
  chatty: ['Hello? Anyone? I have so much to say!', 'Come and talk to me before I talk to the furniture!'],
  dreamy: ['I have been talking to the kettle.', 'A voice at the door would be a gift.'],
});
addLines(MIND_LINES['need:food'], {
  plain: ['Empty inside.', 'Food. Now, ideally.'],
  formal: ['I am rather in need of a meal.', 'My stomach has opinions.'],
  warm: ['I could eat the table.', "I'm thinking about supper and it's not even noon."],
  chatty: ['Feed me! Feed me now!', 'I could eat a whole pie! Two pies!'],
  dreamy: ['Hunger has moved in and put its feet up.', 'I dream of a full plate.'],
});
addLines(MIND_LINES['dream:waiting'], {
  plain: ['Asked. Still nothing.', 'The steward has my ask. Waiting on it.', 'Any day now, I hope.'],
  formal: ['My request stands. I await an answer.', 'I have asked, and I shall not ask twice.', 'Patience. The steward has much to weigh.'],
  warm: ["I keep hoping the steward's read my note.", "Any news? No. Well, I'll wait.", "I'm trying not to pester the steward about it."],
  chatty: ['Waiting, waiting, waiting! Patience is not my gift!', 'Has the steward seen it yet? Has anyone?', 'Tick tock, steward!'],
  dreamy: ['The ask is out there somewhere, drifting.', 'I planted a wish and now I wait for rain.', 'Each morning I look at the board and then away.'],
});
addLines(MIND_LINES.larder, {
  plain: ['Larder is bare.', 'Not enough food in. Not nearly.', 'Thin rations.'],
  formal: ['Our stores are perilously low.', 'I counted the larder twice. It did not improve.', 'We shall go hungry if nothing is done.'],
  warm: ["There's hardly anything left to eat.", 'I keep opening the larder as if that helps.', "We'll be sharing crusts soon."],
  chatty: ['The cupboard! Bare! Dramatically bare!', 'Who ate everything? Was it me?', 'Larder emergency! Somebody plant something!'],
  dreamy: ['The larder breathes out dust.', 'Empty shelves have their own silence.', 'I dreamt of a full pantry and woke to this.'],
});
addLines(MIND_LINES['feel:gratitude'], {
  plain: ['{X} came through for me.', 'Good of {x}, that.', 'Owe {x}. Will remember.'],
  formal: ['I am much obliged to {x}.', '{X} has been kinder than I deserved.', 'I shall find a way to repay {x}.'],
  warm: ['{X} was so good to me.', "I don't know what I'd do without {x}.", 'I want to do something nice for {x}.'],
  chatty: ['{X}! A saint! A hero!', 'I could kiss {x}! I might!', 'Three cheers for {x}!'],
  dreamy: ['{X} put a light in my window.', 'Kindness from {x}, and it is still warm.', 'I carry what {x} did like a stone in my pocket, a good one.'],
});
addLines(MIND_LINES['feel:pride'], {
  plain: ['Did that well.', 'Good work, that.', 'Not bad, me.'],
  formal: ['I am rather pleased with my work.', 'I did that properly, and I know it.', 'One may take a little pride in a job well done.'],
  warm: ["I'm chuffed with how that turned out.", 'I did a good thing today.', 'Look at that. I made that.'],
  chatty: ['Did you SEE what I did? Marvellous!', 'I am very pleased with myself and I do not care who knows!', 'Genius! Me! Finally!'],
  dreamy: ['My hands remember doing something right.', 'A small glow, well earned.', 'I made a thing that will outlast the day.'],
});
addLines(MIND_LINES['feel:annoyance'], {
  plain: ['Irritating.', 'Something rubbed me wrong.', 'Not in the mood.'],
  formal: ['I confess I am vexed.', 'I am not best pleased.', 'Something has got under my skin.'],
  warm: ["I'm a bit cross, and I hate being cross.", 'Something got on my nerves today.', 'I need to shake this off.'],
  chatty: ['Grr! Honestly! Grr!', 'I am this close to stamping my foot!', 'Do not test me today!'],
  dreamy: ['A wasp of a feeling, buzzing round my head.', 'The day has a splinter in it.', 'I am prickly as a hedge.'],
});
addLines(MIND_LINES['feel:worry'], {
  plain: ['Uneasy.', 'Something is not right.', 'Worried, and can\'t say why.'],
  formal: ['I have a nagging concern.', 'I cannot quite settle my mind.', 'Something troubles me.'],
  warm: ["I can't stop fretting.", "I've a knot in my stomach about it.", 'I keep turning it over and over.'],
  chatty: ['Worry worry worry! I hate it!', 'My head is a beehive today!', 'Someone tell me it will be fine!'],
  dreamy: ['A grey thread runs through the day.', 'I am watching the sky for something.', 'The worry sits on the windowsill and looks at me.'],
});
addLines(MIND_LINES['feel:grief'], {
  plain: ['Miss it.', 'Gone. Still can\'t believe it.', 'Hurts, that.'],
  formal: ['I feel the loss keenly.', 'It is a sorrow I did not expect.', 'I shall not pretend it does not grieve me.'],
  warm: ['I keep looking for it and it isn\'t there.', 'My heart is a bit broken over it.', 'I miss it more than I thought I would.'],
  chatty: ['I am sad! Properly sad! Me!', 'Gone! Just gone! I still can\'t take it in!', 'Hold me, somebody!'],
  dreamy: ['There is a hole in the day the shape of what was there.', 'Grief has moved into the spare room.', 'I keep setting a place for what is gone.'],
});
addLines(MIND_LINES['feel:loneliness'], {
  plain: ['On my own too much.', 'Nobody about. Again.', 'Quiet house.'],
  formal: ['I have been rather solitary of late.', 'The silence has grown long.', 'I should welcome a knock at the door.'],
  warm: ["I'm lonely, if I'm honest.", 'I wish someone would just drop by.', 'The evenings are the hardest.'],
  chatty: ['Lonely! Me! Who would have thought!', 'Somebody come round! I have biscuits!', 'Talking to myself again! Good company, at least!'],
  dreamy: ['My own footsteps keep me company.', 'The house and I have run out of things to say.', 'I am a lamp in an empty window.'],
});
addLines(MIND_LINES['need:comfort'], { dreamy: ['I am a kettle left off the hob.'] });
addLines(MIND_LINES['need:company'], { dreamy: ['The quiet has got into the walls.'] });
addLines(MIND_LINES['need:purpose'], { formal: ['I am at a loose end, and it chafes.'], warm: ['Give me something to carry, somebody.'], chatty: ['Unemployed hands! Dangerous!'], dreamy: ['The hours sit on me like flies.'] });
addLines(MIND_LINES['need:purpose_job'], { formal: ['Variety would be most welcome in my work.'], warm: ["I'd like to try my hand at something new."], chatty: ['Same tools, same song! Change the tune!'], dreamy: ['I would like my hands to be surprised.'] });
addLines(MIND_LINES['need:delight'], { formal: ['I could do with a small occasion.'], chatty: ['Somebody juggle! Anybody!'], dreamy: ['I am hungry for a colour I have not seen this week.'] });
addLines(MIND_LINES['feel:pride'], { formal: ['It was done well, and that is a quiet pleasure.'], warm: ['I stood back and liked what I saw.'], chatty: ['Clap for me! Go on!'], dreamy: ['I left a mark on the day, and it was a good one.'] });
addLines(MIND_LINES['feel:worry'], { formal: ['I should like to be reassured, and cannot be.'], chatty: ['Nerves! Jangling! All of them!'], dreamy: ['The worry has a weather of its own.'] });
addLines(MIND_LINES['feel:grief'], { formal: ['One does not get over such things; one gets round them.'], chatty: ['I need a cry and a bun, in that order!'], dreamy: ['The loss has its own chair at my table.'] });
addLines(MIND_LINES['feel:loneliness'], { plain: ['Nobody has knocked in days.'], formal: ['Company has become a rare commodity.'], warm: ["I'd give a lot for a chat by the fire."], chatty: ['I have started naming the spoons!'], dreamy: ['The echo answers before anyone does.'] });
addLines(MIND_LINES['dream:waiting'], { formal: ['The matter rests with the steward now.'], chatty: ['Steward! My ask! Remember it!'], dreamy: ['I left the hope on the board like a coat on a hook.'] });
addLines(MIND_LINES.larder, { formal: ['The larder is a sorry sight.'], warm: ["There's not enough to go round, and I hate saying it."], chatty: ['Empty shelves! Echo! Echo!'], dreamy: ['The pantry is a cave with nothing in it.'] });
addLines(MIND_LINES.festival_soon, {
  plain: ['Festival soon. Good.', 'Lanterns to sort.', 'Nearly festival time.'],
  formal: ['The festival approaches, and I confess I look forward to it.', 'There are preparations to make before the festival.', 'A festival is a fine thing for a town.', 'I shall wear my good coat to the festival.'],
  warm: ["I love festival week, honestly.", 'Not long now till the festival!', "I'm already humming the festival songs."],
  chatty: ['FESTIVAL! Soon! Lanterns! Pies!', 'I have planned my festival outfit for a month!', 'Is it festival yet? Is it? Is it?', 'Festival soon and I cannot sit still!'],
  dreamy: ['The festival is a lamp at the end of the week.', 'I can almost hear the lanterns being lit.', 'The whole valley leans toward the festival.', 'Soon the evenings will glow.'],
});
addLines(MIND_LINES['weather:rain'], {
  plain: ['Wet day.', 'Rain again.', 'Good for the garden, bad for my boots.'],
  formal: ['The rain is persistent today.', 'A damp day, though the gardens will thank it.', 'One cannot argue with rain.', 'I shall keep indoors while it rains.'],
  warm: ['I quite like a rainy day, truth be told.', 'Rain on the roof is a lovely sound.', 'A day for soup and a window seat.', "The rain's keeping everyone in."],
  chatty: ['Rain! My hair! Ruined!', 'Splashing in puddles like a child, me!', 'Rain rain rain! Lovely for ducks!', 'Umbrella weather! I have no umbrella!'],
  dreamy: ['The rain is writing on the roof.', 'Every leaf is drinking.', 'The brook will be talking louder tonight.', 'Grey silk over the valley.'],
});
addLines(MIND_LINES['weather:storm'], {
  plain: ['Storm. Stay in.', 'Wind could take the roof.', 'Bad night for it.'],
  formal: ['The storm is a serious one.', 'I trust the roofs will hold.', 'A night to stay indoors and be grateful for walls.', 'The wind is quite ferocious.'],
  warm: ['I hope everyone is safe inside.', 'The storm has me a bit frightened, honestly.', "I'll check on the neighbours when it passes.", 'What a night! The whole house is creaking.'],
  chatty: ['Storm! Hold onto your hats! And your hens!', 'The wind is screaming louder than me!', 'Thunder! I jumped a foot!', 'Everything is rattling! Even me!'],
  dreamy: ['The sky is tearing itself in half.', 'The storm walks over the roofs in big boots.', 'Lightning drew the valley for a second.', 'The night is all teeth tonight.'],
});
addLines(MIND_LINES.miss_friend, {
  plain: ['Miss {x}.', 'Not seen {x} in a while.'],
  formal: ['I have not seen {x} in some days.', 'I find I miss {x}.', '{X} has been absent from my days.'],
  warm: ["I keep wondering what {x} is up to.", 'I should go and find {x}.'],
  chatty: ['Where has {x} got to? I miss them!', '{X}! Come back! I have gossip!', 'Not a peep from {x}! Rude!'],
  dreamy: ['{X} has drifted out of my week.', 'There is a {x}-shaped gap in the days.', 'I keep turning to say something to {x}.'],
});
addLines(MIND_LINES.grudge, {
  plain: ['Still sore about {x}.', 'Not over it, with {x}.'],
  formal: ['Matters with {x} remain unresolved.', 'I am not ready to be gracious to {x}.'],
  warm: ["I hate being at odds with {x}.", "I wish {x} and I could put it right."],
  chatty: ['{X}! Honestly! Still fuming!', 'Not speaking to {x}! Well, barely!', '{X} knows what they did!'],
  dreamy: ['The thing with {x} has not healed over.', 'A cold wind blows from the direction of {x}.', '{X} and I are two stones that will not sit together.'],
});
addLines(MIND_LINES['steward:+'], {
  plain: ['Steward does right by us.', 'Good steward, that.'],
  formal: ['The steward has my confidence.', 'I think well of the steward, and say so.', 'The steward has been fair with me.'],
  warm: ['The steward really does care, you know.', 'We are lucky in our steward.'],
  chatty: ['Steward! Top marks! Gold star!', 'Best steward a town could ask for, I say!'],
  dreamy: ['The town is in kind hands.', 'Someone is minding us, and minding well.', 'The steward tends us like a garden.'],
});
addLines(MIND_LINES['steward:-'], {
  plain: ['Steward lets us down.', 'Waste of breath, asking the steward.', "Steward doesn't care."],
  formal: ['The steward has disappointed me.', 'I have lost faith in the steward, rather.', 'The steward does not seem to hear us.'],
  warm: ["I wish the steward would just listen to us.", "I don't feel the steward is on our side.", 'The steward has let me down, and it stings.'],
  chatty: ['Steward? Useless! Hopeless!', 'Might as well shout at the well as ask the steward!', 'The steward! Where even is the steward!', 'Nought out of ten for the steward!'],
  dreamy: ['Nobody holds the tiller.', 'The steward is a door that never opens.', 'We call, and the hills answer before the steward does.', 'The town drifts, unsteered.'],
});
addLines(MIND_LINES['belief:+'], {
  plain: ['{X}. Good, that.', 'Like {x}. Settled.', 'Warming to {x}.'],
  formal: ['I have grown to appreciate {x}.', '{X} has won me over.', 'I speak well of {x} now.'],
  warm: ["{X} has really grown on me, you know.", "I've come round to {x}.", "I'm quite fond of {x} these days."],
  chatty: ['{X}! Love it! Changed my mind!', 'Team {x}! Officially!', 'I was wrong about {x}! Happens!'],
  dreamy: ['{X} has found a place in me.', 'I see {x} differently now, and kindly.', '{X} has settled into the shape of the valley.'],
});
addLines(MIND_LINES['belief:-'], {
  plain: ['Gone off {x}.', '{X}. Not for me.', 'Had enough of {x}.', "Don't rate {x}."],
  formal: ['I have come to a poor opinion of {x}.', '{X} does not improve on acquaintance.', 'I find I dislike {x}.', 'My view of {x} has soured.'],
  warm: ["I've gone off {x}, I'm afraid.", "{X} isn't what I hoped.", "I don't like {x} as much as I did.", 'I tried to like {x}. I can\'t.'],
  chatty: ['{X}? No thank you!', 'Done with {x}! Done!', '{X}! Overrated!', 'I have decided: {x} is a no!'],
  dreamy: ['{X} has gone grey in my mind.', '{X} and I have fallen out of step.', 'The light has gone out of {x}.', '{X} is a song I no longer hum.'],
});
addLines(MIND_LINES['belief_person:+'], {
  plain: ['{X} is all right.', 'Warming to {x}.', '{X}. Good sort.'],
  formal: ['I have warmed to {x} considerably.', '{X} has my regard.', 'I think better of {x} than I did.'],
  warm: ["I've grown very fond of {x}.", "{X} turned out to be lovely.", "I'm glad {x} is here."],
  chatty: ['{X}! Changed my mind! Love them!', '{X} is my new favourite person!', 'Three cheers for {x}!'],
  dreamy: ['{X} has become a warm place in my week.', 'I see {x} clearly now, and like what I see.', '{X} is weather I would walk into.'],
});
addLines(MIND_LINES['belief_person:-'], {
  plain: ['Gone cool on {x}.', '{X}. Hm.', 'Keeping my distance from {x}.'],
  formal: ['I have revised my opinion of {x}, downward.', '{X} has disappointed me.', 'I am wary of {x} now.', 'I think less of {x} than I did.'],
  warm: ["I don't feel the same about {x} anymore.", "{X} let me down a bit.", "I'm keeping {x} at arm's length for now.", "Something's gone off between me and {x}."],
  chatty: ['{X}? Hmph!', 'Not sure about {x} anymore!', '{X} is on thin ice with me!', 'I have cooled on {x}! Considerably!'],
  dreamy: ['{X} has gone a little grey to me.', 'A door has half-closed on {x}.', '{X} and I have drifted into different weathers.', 'I keep my coat on around {x} now.'],
});
addLines(MIND_LINES.leaving, {
  plain: ['Might go.', 'Thinking of the road.', 'Not sure I belong here.'],
  formal: ['I am considering whether to stay.', 'I have begun to think of leaving.', 'The question of going has presented itself.', 'I do not know that this valley is mine.'],
  warm: ["I keep thinking about packing, and hating it.", "I don't want to go. I might, though.", 'Something would have to change for me to stay.'],
  chatty: ['The road is calling and I am half listening!', 'Should I go? Should I? Somebody say no!', 'Bags half packed in my head!', 'Leaving? Me? Maybe! Maybe not!'],
  dreamy: ['The road out of town has started to shine.', 'I dream of other valleys.', 'Part of me has already left.', 'My feet point at the gate.'],
});
addLines(MIND_LINES['feel:joy'], {
  plain: ['Happy. Simple as that.', 'Good day for it, whatever it is.', 'No complaints. None.', 'Sun on my back and nothing owed.', 'Right as rain today.', 'Cheerful, me. Odd but true.'],
  formal: ['I am quite content with the world today.', 'A fine day, and I am equal to it.', 'My spirits are high and I see no reason to lower them.', 'The day has been generous.', 'I feel well, and I feel well disposed.', 'All things considered, a splendid day.'],
  warm: ['I feel wrapped up warm inside.', "I've got a song stuck in me and I don't mind.", 'Today I like everybody.', 'Something good has settled in my chest.', "I'm as happy as the hens in the sun.", 'What a nice life this is, some days.'],
  chatty: ['Happy! Loudly! Sorry!', 'If I were any cheerier I would float!', 'Today is a biscuit of a day!', 'Grinning like a cat with cream, me!', 'Good mood alert! Stand clear!', 'I could dance! I might! Stand back!'],
  dreamy: ['The day has honey in it.', 'I am a window with the sun through it.', 'My heart is out walking without me.', 'Everything is a little bit in bloom.', 'The air tastes of something good coming.', 'I am a bell somebody has just rung.'],
});
addLines(MIND_LINES['need:rest'], {
  plain: ['Running on empty.', 'Need a lie-down.', 'Eyes like lead.'],
  formal: ['I am in want of a long rest.', 'Fatigue has rather caught up with me.', 'I must sleep, and soon.'],
  warm: ['I could curl up right here and go off.', "I'm tired right down to my boots.", 'A good sleep would put me right.'],
  chatty: ['Tired! So tired! Zzz!', 'I keep nodding off mid-sentence! Did I just?', 'Carry me to bed, somebody!'],
  dreamy: ['Sleep is a tide and I am going out with it.', 'My bones want the dark.', 'I am walking through a dream already.'],
});
addLines(MIND_LINES['need:food'], {
  plain: ['Stomach is growling.', 'Need a bite.', 'Starved.'],
  formal: ['Hunger is making itself felt.', 'I should be glad of something to eat.', 'My appetite is sharp today.'],
  warm: ["I'm famished, honestly.", 'Supper cannot come soon enough.', 'I could murder a bowl of stew.'],
  chatty: ['Hungry! Loudly hungry!', 'My stomach just said something rude!', 'Bread! Cheese! Anything! Please!'],
  dreamy: ['My hunger is a small animal pacing.', 'I can smell bread that is not there.', 'The inside of me is an empty room.'],
});
addLines(MIND_LINES['feel:joy'], {
  plain: ['Good. Plain good.', 'Nothing to grumble at.', 'Fair weather in me today.', 'Day went well. Say so.'],
  formal: ['I have had a thoroughly satisfactory day.', 'I am in good heart.', 'The day has gone as a day should.', 'I am well, and glad to be.'],
  warm: ['My heart is full, honestly.', 'I keep catching myself smiling.', 'Life is good to me this week.', "I'm happy, and I'm not going to hide it."],
  chatty: ['Whoop! That is all! Whoop!', 'Best mood! No reason! Best!', 'I am a kettle on the boil with happiness!', 'Somebody give me a hill to run down!', 'Cheerful as a sparrow, me!', 'Good day! Great day! Marvellous day!', 'I am fizzing! Fizzing, I tell you!', 'Is it a crime to be this happy? Arrest me!'],
  dreamy: ['The day is a warm stone in my hand.', 'I am full of quiet fireworks.', 'Joy came in without knocking.', 'The light likes me today.'],
});
addLines(MIND_LINES['need:purpose_job'], {
  plain: ['Same hands, same work. Hm.', 'Could use a fresh task.', 'The job has gone stale on me.'],
  formal: ['My work wants refreshing.', 'I have mastered the day, and it bores me.', 'A new challenge would be welcome.'],
  warm: ["I'd love to shake up my work a bit.", 'Same old job, lovely as it is.', 'I need something new to sink my teeth into.'],
  chatty: ['My job! Yawn! Sorry, job!', 'I could do my work in my sleep! Sometimes I do!', 'Give me a different hammer at least!', 'New task! New task! New task!', 'I have polished the same thing nine times today!', 'If I see that bench again I will scream, lovingly!'],
  dreamy: ['The work has become a hallway with no doors.', 'I want to make something that surprises me.', 'My hands are asking for a new tune.'],
});
addLines(MIND_LINES['need:purpose'], {
  plain: ['Could be doing something.', 'Idle day. Bad.', 'Need a reason to get up.'],
  formal: ['I am underemployed, and I feel it.', 'Some occupation would do me good.', 'I am not made for idleness.'],
  warm: ["I'd happily help anyone with anything.", 'I feel a bit useless today, honestly.', "I'm itching to be useful."],
  chatty: ['Job! Me! Now! Please!', 'I have alphabetised the hens!', 'Idle! Dangerous! Give me a task!'],
  dreamy: ['The day is a field with nothing planted.', 'I am an unlit lamp.', 'My usefulness has nowhere to go.'],
});
addLines(MIND_LINES['need:delight'], {
  plain: ['Flat week.', 'Need cheering up.', 'Bit grey, all this.'],
  formal: ['A touch of gaiety would not go amiss.', 'The days lack sparkle.', 'I should enjoy a diversion.'],
  warm: ["I'd love a bit of a treat.", 'Nothing has made me laugh in days.', 'A little fun would go a long way.'],
  chatty: ['Entertain me! Somebody!', 'Fun! Where is the fun!', 'I am bored enough to dance alone!'],
  dreamy: ['I am waiting for a kite of a day.', 'The week has no music in it.', 'I want to be surprised by something small.'],
});
