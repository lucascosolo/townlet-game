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
    formal: ['I cannot quite let go of {x}.', 'Frankly, {x} still irritates me.'],
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
