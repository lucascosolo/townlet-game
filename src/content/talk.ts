import type { FavourKind, RefusalReason } from '../sim/types.js';
import { addLines, type Lines } from './voice.js';

// Talking to a resident (M3b) and asking favours (M3c). Lines are in the resident's own voice,
// one set per register; {s} is who or what they are asked about, {title} and {next} their hope,
// {other} another resident.

export const TALK_HOW: Record<string, Lines> = {
  great: {
    plain: ['Never better.', 'Good. Really good.'],
    formal: ['I am very well indeed, thank you.', 'Thriving, I would say.'],
    warm: ["Oh, I'm wonderful, thank you for asking!", "Honestly? Happier than I've been in ages."],
    chatty: ['Brilliant! Couldn\'t be better! Ask me anything!', 'On top of the world, me!'],
    dreamy: ['Like sunlight on water.', 'Everything feels in tune.'],
  },
  good: {
    plain: ['Fine. Good, even.', 'Can\'t complain.'],
    formal: ['Quite well, thank you.', 'I am in good order.'],
    warm: ["I'm well, thank you. It's kind of you to ask.", 'Good, I think. Yes, good.'],
    chatty: ['Pretty good! Pretty good!', 'Not bad at all, you know!'],
    dreamy: ['Mostly bright, with a few clouds.', 'Content, I think.'],
  },
  fair: {
    plain: ['Middling.', 'Getting by.'],
    formal: ['Tolerably well.', 'I have been better, and worse.'],
    warm: ["Oh, up and down. You know how it is.", 'Fair to middling, really.'],
    chatty: ['So-so! Some days are like that!', 'Could be better, could be worse!'],
    dreamy: ['Grey, but not dark.', 'Somewhere in between things.'],
  },
  low: {
    plain: ['Not great.', 'Bit low, honestly.'],
    formal: ['Not altogether well, I confess.', 'I have been rather low.'],
    warm: ["Not so good, if I'm honest.", "I've been struggling a bit."],
    chatty: ['Oh, rotten week, really!', "Bit of a slump, if I'm honest!"],
    dreamy: ['The colour has gone out of things.', 'I feel far away from myself.'],
  },
  bad: {
    plain: ['Bad.', 'Rough. Really rough.'],
    formal: ['Poorly, I am afraid.', 'I am in a bad way.'],
    warm: ["Awful, honestly. I don't know what to do.", "I'm not well. Not at all."],
    chatty: ["Terrible! Don't ask! Well, you did ask.", 'Worst I\'ve been, truly.'],
    dreamy: ['Everything is heavy and dark.', 'I am lost at the bottom of something.'],
  },
};

/** "Mostly because...": introduces the top thing on their mind after a how-are-you. */
export const TALK_BECAUSE: Lines = {
  plain: ['Thing is,'],
  formal: ['Chiefly,'],
  warm: ['Mostly,'],
  chatty: ['Thing is,'],
  dreamy: ['Mostly,'],
};

export const TALK_OPINION: Record<string, Lines> = {
  love: {
    plain: ['{S}? Love it. Simple as that.', 'Fond of {s}. Very.'],
    formal: ['I hold {s} in the highest regard.', '{S} means a great deal to me.'],
    warm: ['Oh, I adore {s}.', '{S}? It warms my heart, honestly.'],
    chatty: ['{S}! The best! Don\'t get me started!', 'Love {s}, love it!'],
    dreamy: ['{S} is one of the good things.', '{S} feels like home to me.'],
  },
  like: {
    plain: ['{S} is all right.', 'Like {s} well enough.'],
    formal: ['I think well of {s}.', '{S} has my approval.'],
    warm: ["I'm fond of {s}.", '{S}? I like it, yes.'],
    chatty: ['{S}? Good stuff!', 'Quite like {s}, actually!'],
    dreamy: ['{S} is pleasant to think about.', 'I like the feel of {s}.'],
  },
  neutral: {
    plain: ['{S}? Don\'t think about it much.', 'No view on {s}.'],
    formal: ['I have no strong view on {s}.', 'I am undecided about {s}.'],
    warm: ["{S}? I haven't made my mind up.", "I don't really know {s} well enough."],
    chatty: ['{S}? Eh! Haven\'t decided!', 'Ask me again about {s} later!'],
    dreamy: ['{S} is a blank page to me.', 'I haven\'t felt anything about {s} yet.'],
  },
  dislike: {
    plain: ['{S}? Not keen.', 'Could do without {s}.'],
    formal: ['I am not fond of {s}.', '{S} does not sit well with me.'],
    warm: ["I'm not so sure about {s}, to be honest.", "{S} and I don't quite get along."],
    chatty: ['{S}? Bit of a sore point!', 'Not my favourite, {s}!'],
    dreamy: ['{S} has a sour note to it.', 'Something about {s} jars.'],
  },
  hate: {
    plain: ['Can\'t stand {s}.', '{S}. Don\'t.'],
    formal: ['I have nothing good to say about {s}.', '{S} is a trial to me.'],
    warm: ["I'm sorry, but I can't abide {s}.", "{S} really upsets me."],
    chatty: ['{S}?! Don\'t get me started!', 'Ugh, {s}! Honestly!'],
    dreamy: ['{S} is a stone in my shoe.', '{S} darkens the whole day.'],
  },
};

/** The reason behind an opinion, after the opinion itself. {statement} is the belief in their words. */
export const TALK_REASON: Lines = {
  plain: ['{statement}.', 'Simple: {statement}.'],
  formal: ['You see, {statement}.', 'I would say {statement}.'],
  warm: ['Well, {statement}.', 'Thing is, {statement}.', 'The way I see it, {statement}.'],
  chatty: ['I mean, {statement}!', 'Because {statement}!'],
  dreamy: ['Somehow, {statement}.', 'The way I feel it, {statement}.'],
};

/** A concession after a kind view (bar round 2): "though you took away the old oak". {x} is the grievance in their words. */
export const TALK_BUT: Lines = {
  plain: ['Though {x}, and I keep count.', 'Mind, {x}.', 'Still, {x}.', 'But {x}, and I noticed.', "Though {x}, and that's not forgotten."],
  formal: ['Though I have not forgotten that {x}.', 'That said, {x}, and I noticed.', 'I must add that {x}.', 'Though it did not escape me that {x}.', 'Even so, {x}.'],
  warm: ['Though {x}, and that stung a little.', "Even so, {x}, and I wish it hadn't been so.", 'Only, {x}, and it hurt.', 'But {x}, and I minded.', 'Though {x}, and I am still a bit sore.'],
  chatty: ['Though {x}, and I have not forgotten!', 'Mind you, {x}, hmph!', 'But {x}, honestly!', 'Except {x}, still cross!', 'Though {x}, ahem!'],
  dreamy: ['Though {x}, and it has not settled yet.', 'And yet {x}; that sits in me still.', 'Only {x}, and the air has not cleared.', 'But {x}, a small stone in the shoe.', 'Though {x}, and I carry it.'],
};

export const TALK_ME: Record<string, Lines> = {
  love: {
    plain: ['You do right by us. I mean that.', 'No complaints. Not one.', 'You keep your word. That counts.'],
    formal: ['You have been a true credit to this valley.', 'I could not ask for a better steward.', 'You have earned my trust, and that is not easily done.'],
    warm: ['I think the world of you, you know.', "You've made this place feel like home.", "Honestly? I'm so glad it's you looking after us."],
    chatty: ['You? Best steward going!', "You're a marvel, you know that?", 'Ask anyone! Well, ask me. You are brilliant!'],
    dreamy: ['You make the valley feel looked after.', 'When you are near, things go right.', 'You are the kind of weather we needed.'],
  },
  like: {
    plain: ["You're all right.", 'You do fine by me.', 'Good so far.'],
    formal: ['I think well of you, steward.', 'You are doing creditably, I would say.', 'So far, I have been glad of you.'],
    warm: ['I like you. You listen.', "You're good to us, mostly.", "I'm getting fond of you, you know."],
    chatty: ["You're doing fine! Mostly!", 'Not bad at all, you!', 'Keep it up and I might even brag about you!'],
    dreamy: ['You are a kind wind, mostly.', 'You feel like a good start.', 'I think you mean well. That is plenty.'],
  },
  neutral: {
    plain: ["Haven't made my mind up about you.", "Don't know you yet.", 'We will see.'],
    formal: ['I am still forming my view of you.', 'It is early days, steward.', 'I reserve judgement, for now.'],
    warm: ["I don't know you well enough yet, I think.", "Give me time. I'll know you better soon.", "You seem nice. I'm not sure yet."],
    chatty: ["Jury's out on you!", 'Ask me next week!', "Still sizing you up, if I'm honest!"],
    dreamy: ['You are still a stranger to me, a little.', 'You are a door I have not opened yet.', 'I have not quite heard you yet.'],
  },
  dislike: {
    plain: ["Not sure you're listening.", "You've let a few things slide.", "Could be better, couldn't it."],
    formal: ['I have my doubts about you, steward.', 'I had hoped for more attention to our concerns.', 'You have disappointed me, if I may say so.'],
    warm: ["I'm not sure you care about us, honestly.", "I wish you'd listen a bit more.", "It's been hard to feel looked after lately."],
    chatty: ['You? Hmm! Could do better!', "Not your best season, is it?", "I've had words about you. Not nice ones!"],
    dreamy: ['You feel far off from us.', 'Your hands are elsewhere.', 'Something between us has gone cold.'],
  },
  hate: {
    plain: ["You don't listen. Never have.", 'I have nothing to say to you.', 'Leave me be.'],
    formal: ['Frankly, you have failed us.', 'I cannot pretend to think well of you.', 'You have lost my good opinion entirely.'],
    warm: ["I'm sorry, but you've let us down.", "I don't think you care about us at all.", "It hurts to say it, but I don't trust you."],
    chatty: ["You?! Don't make me laugh!", 'Oh, it is YOU.', "Worst steward I've known, and I've known one!"],
    dreamy: ['Nobody is steering this place.', 'You are a storm that never breaks.', 'The valley does not feel yours anymore.'],
  },
};

/** "What do you think of…" a person: never the place lines (review: "Ada? I like it, yes"). */
export const TALK_OPINION_PERSON: Record<string, Lines> = {
  love: {
    plain: ['{S}? One of the best.', "I'd do anything for {s}.", '{S} is family, near enough.'],
    formal: ['I think the world of {s}.', '{S} is a dear friend, and I am lucky in it.', 'I hold {s} in the highest regard.'],
    warm: ['Oh, {s}! I adore {s}.', "{S}'s one of my favourite people.", 'I light up when {s} comes by.'],
    chatty: ['{S}! Love {s}! Have you met {s}? You must!', "Best company in the valley, {s} is!", '{S}? My favourite!'],
    dreamy: ['{S} is like a lamp in a window.', 'Days with {s} in them are better days.', '{S} understands me.'],
  },
  like: {
    plain: ['{S} is good people.', 'Get on fine with {s}.', 'Like {s}. Good sort.'],
    formal: ['I think well of {s}.', '{S} is pleasant company.', 'I find {s} most agreeable.'],
    warm: ["I'm fond of {s}.", "{S}'s lovely, really.", 'I always enjoy a chat with {s}.'],
    chatty: ['{S}? Good fun!', 'We get on, {s} and me!', "{S}'s all right, you know!"],
    dreamy: ['{S} is easy to be near.', 'I like the way {s} sees things.', '{S} hums a nice tune.'],
  },
  neutral: {
    plain: ["Don't know {s} well.", "{S}? We've barely spoken.", 'No view on {s}.'],
    formal: ['I have not had much to do with {s}.', 'I am not well acquainted with {s}.', 'I could not say, of {s}.'],
    warm: ["I don't really know {s} yet.", "I'd like to know {s} better, actually.", "{S}? We say hello. That's all so far."],
    chatty: ['{S}? Hardly know {s}!', 'Haven\'t had a proper natter with {s} yet!', 'Ask me again about {s} later!'],
    dreamy: ['{S} is a closed book to me, still.', 'We pass each other like boats.', "I haven't found {s}'s tune yet."],
  },
  // Bar round 4: known well and not warm. Civil, not close (0 of 15 neighbour opinions were cool).
  cool: {
    plain: ["{S}? We're civil. That's about it.", "{S} and I aren't close.", "{S} goes {s}'s way, I go mine.", "Wouldn't call {s} a friend.", "{S}'s all right. From a distance."],
    formal: ['{S} and I are civil, but no more than that.', 'I know {s} well enough. I would not say I like {s}.', 'We are cordial, {s} and I. Nothing warmer.', '{S} and I have never quite taken to each other.', 'I have no complaint of {s}. Nor much affection.'],
    warm: ["{S}? We get along, I suppose. We're not close.", "I've tried with {s}. It just doesn't click.", "{S}'s nice enough. We're not really friends.", "I wish I liked {s} more than I do, honestly.", "We're polite, {s} and me. That's the word, polite."],
    chatty: ['{S}? Eh! We nod! We do not natter!', "Not my favourite, {s}! Not my least either!", '{S} and me? Ships in the night!', "{S}! Fine! Next question!", "We're not pals, {s} and me! We're... neighbours!"],
    dreamy: ['{S} and I are two notes that never quite chord.', 'We share the valley, {s} and I. Not much else.', 'There is a pane of glass between {s} and me.', '{S} is weather I simply wait out.', 'We pass, and nod, and pass.'],
  },
  dislike: {
    plain: ["{S} and I don't get on.", 'Not keen on {s}.', 'Rather keep clear of {s}.'],
    formal: ['{S} and I do not see eye to eye.', 'I find {s} rather trying.', 'I am not fond of {s}.'],
    warm: ["I'm not sure about {s}, honestly.", "{S} gets on my nerves a bit.", "Things are a bit off between {s} and me."],
    chatty: ['{S}? Sore point!', 'Bit of a thorn, {s}!', "Don't sit me next to {s}!"],
    dreamy: ['{S} and I clash, like the wrong notes.', 'There is a draught between {s} and me.', '{S} feels prickly.'],
  },
  hate: {
    plain: ["Can't stand {s}.", "Don't talk to me about {s}.", "{S}. Don't."],
    formal: ['I would rather not speak of {s}.', '{S} has wronged me, and I have not forgotten.', 'I cannot abide {s}.'],
    warm: ["I'm sorry, I just can't be around {s}.", '{S} really hurt me.', "I'm still upset with {s}."],
    chatty: ['{S}?! Ugh! Next question!', "Don't even say the name {s}!", 'We are NOT friends, {s} and me!'],
    dreamy: ['{S} is a stone in my shoe.', 'When {s} walks in, the room goes grey.', '{S} and I are winter to each other.'],
  },
};

export const TALK_HOPE: Lines = {
  plain: ['{title}. Next, {next}.'],
  formal: ['I hope to {title}. My next step is to {next}.'],
  warm: ["I'd love to {title}. First, I need to {next}."],
  chatty: ['Big plan! {title}! Next up: {next}!'],
  dreamy: ['I dream of it: {title}. Next, I {next}.'],
};

/** The hope when its next step is the hope itself: said once. */
export const TALK_HOPE_ONE: Lines = {
  plain: ['{title}. That is the plan.'],
  formal: ['I hope to {title}.'],
  warm: ["I'd love to {title}."],
  chatty: ['Big plan! {title}!'],
  dreamy: ['I dream of it: {title}.'],
};

export const TALK_HOPE_DONE: Lines = {
  plain: ["Did what I set out to do. Thinking about what's next.", 'Between plans. Enjoying {x} meanwhile.', 'Nothing big just now. {X} does me fine.', "Got there. Taking it easy for a bit. {X}, mostly.", 'No new plan yet. Making the most of {x}.'],
  formal: ['I have done what I hoped to. Something new will come.', 'For now I am content with {x}. The next ambition can wait.', 'I am between purposes, and I find I do not mind. {X} keeps me well.', 'I allow myself a pause. {X} is pleasure enough for the present.', 'Nothing grand at present. I am enjoying {x}, which is its own sort of hope.'],
  warm: ["I did it, you know! I'm still thinking what comes next.", "Honestly? Just enjoying {x} for now. Something will come.", "I'm taking a breather. {X} has been lovely.", "No big plans just now. I'm making the most of {x}.", "I'm happy as I am for a bit. {X} helps."],
  chatty: ['Done it! What next? No idea yet!', 'Nothing! For now! Too busy enjoying {x}!', "Next plan? Brewing! Meanwhile, {x}!", "Ask me next week! I'm all about {x} right now!", 'Between dreams! Very restful! {X}!'],
  dreamy: ['My last dream came true. The next one is still forming.', 'I am resting between wishes. {X} fills the gap.', 'The next dream has not found me yet. {X} will do until it does.', 'I am letting the field lie fallow. {X} is enough for now.', 'Something new is gathering. Meanwhile there is {x}.'],
};

/** Between dreams after letting one go (bar round 4). {x} as above. */
export const TALK_HOPE_LET_GO: Lines = {
  plain: ['Stopped waiting on that. Something else will come.', "Gave that up. No sense waiting. {X} will do.", "Let it go. There's still {x}.", "That one's gone. I'll find another.", 'Made do. Moved on. {X}, these days.'],
  formal: ['I have set that hope aside. One learns to make do.', 'I stopped expecting it. {X} consoles me somewhat.', 'That ambition is put away. I shall find another in time.', 'I no longer hope for that. There is still {x}, and that must serve.', 'It was not to be. I have made my peace with it.'],
  warm: ["I stopped hoping for that, honestly. It hurt less.", "I let it go. There's still {x}, thank goodness.", "It wasn't going to happen. I'll dream something else.", "I gave up on that one. Maybe something smaller next time.", "That's put away now. {X} cheers me up, at least."],
  chatty: ['Gave up! On that! Not on everything!', "Waited and waited! Never mind! Next!", "That's off the list! {X} instead!", 'Let it go! Very freeing! Mostly!', "Not happening! Fine! I'll think of something better!"],
  dreamy: ['That wish went quiet. Another will come.', 'I let that one drift off downstream.', '{X} is what I have now. It is enough.', 'The dream thinned and I let it go.', 'Some hopes are only borrowed. I gave that one back.'],
};

export const FAVOUR_YES: Record<FavourKind, Lines> = {
  timber: {
    plain: ['Right. I\'ll cut some wood.', 'Woodlot it is.'],
    formal: ['Certainly. I shall see to the timber.'],
    warm: ["Of course! I'll go and cut some wood."],
    chatty: ['Timber? On it! Watch me go!'],
    dreamy: ['I like the woodlot. I\'ll go.'],
  },
  catch: {
    plain: ['I\'ll bring in a catch.'],
    formal: ['I shall see what the brook offers.'],
    warm: ["I'll go down to the jetty for you."],
    chatty: ['Fish! Lovely! Off I go!'],
    dreamy: ['The water and I will have a talk.'],
  },
  garden: {
    plain: ['I\'ll see to the garden.'],
    formal: ['The garden shall be tended.'],
    warm: ["Happy to work the garden for a while."],
    chatty: ['Weeding! I love weeding! Mostly!'],
    dreamy: ['I\'ll go and listen to the beans grow.'],
  },
  clear: {
    plain: ['I\'ll put in a day clearing.'],
    formal: ['I shall help clear the land.'],
    warm: ["I'll lend a hand with the clearing."],
    chatty: ['Clearing! Big job! Count me in!'],
    dreamy: ['I\'ll go and make room for new things.'],
  },
  visit: {
    plain: ['I\'ll look in on {other}.'],
    formal: ['I shall call on {other}.'],
    warm: ["I'll go and sit with {other} a while."],
    chatty: ['Go see {other}? Love to!'],
    dreamy: ['{other} could use some company, I think.'],
  },
  mend: {
    plain: ['Fine. I\'ll talk to {other}.'],
    formal: ['Very well. I shall make my peace with {other}.'],
    warm: ["You're right. I'll go and find {other}."],
    chatty: ['Make up with {other}? All right, all right!'],
    dreamy: ['Perhaps it is time to mend things with {other}.'],
  },
};

export const FAVOUR_NO: Record<RefusalReason, Lines> = {
  hungry: {
    plain: ["Can't. Not on an empty stomach.", "Feed us first. Then ask.", "Too hungry to haul anything."],
    formal: ['I am afraid I cannot work on an empty stomach.', 'Perhaps when there is food in the larder.', 'I must look to my supper before your errand.'],
    warm: ["I'm sorry, I'm just too hungry to be much use.", "Ask me again when we've eaten properly.", "I can barely think for hunger, love."],
    chatty: ['Work? On THIS stomach? No!', 'Feed me and I am yours! Until then, no!', 'I would faint halfway! Truly!'],
    dreamy: ['Hunger has made the errand very far away.', 'I cannot carry anything but this emptiness.', 'When the larder sings again, ask me.'],
  },
  asleep: { plain: ['...'] },
  gone: { plain: ['...'] },
  busy: {
    plain: ['Already doing something for you.'],
    formal: ['I am still about your last errand.'],
    warm: ["I'm still on the last thing you asked!"],
    chatty: ['One thing at a time! Still on the last one!'],
    dreamy: ['My hands are still full of the last thing.'],
  },
  unwell: {
    plain: ['Not with this cold.'],
    formal: ['I am unwell, I am afraid.'],
    warm: ["I'm poorly, I'm sorry. Another time."],
    chatty: ['Achoo! Sorry! Can\'t, I\'m ill!'],
    dreamy: ['I am all fog and sniffles.'],
  },
  tired: {
    plain: ['Too tired.'],
    formal: ['I am quite worn out. Perhaps tomorrow.'],
    warm: ["I'm sorry, I'm exhausted. Can it wait?"],
    chatty: ['I can barely stand! Tomorrow?'],
    dreamy: ['I am too tired to lift my arms.'],
  },
  low: {
    plain: ['Not today. Not in the mood.'],
    formal: ['I am not myself today. Forgive me.'],
    warm: ["I'm just not up to it today."],
    chatty: ['Not today! Bad day! Sorry!'],
    dreamy: ['Today I can\'t. The day is too heavy.'],
  },
  asked_often: {
    plain: ['You\'ve asked a lot this week.'],
    formal: ['You have asked a great deal of me lately.'],
    warm: ["I've done a lot for you this week. I need a break."],
    chatty: ['Again? You\'ve asked me loads this week!'],
    dreamy: ['You ask and ask. I need some days of my own.'],
  },
  distrust: {
    plain: ['Why would I? You don\'t do much for us.'],
    formal: ['I am not inclined to, given how things stand.'],
    warm: ["I'm sorry, I don't feel I can, the way things are."],
    chatty: ['For you? Hmm! Earn it first!'],
    dreamy: ['I don\'t know you well enough to do that.'],
  },
  not_speaking: {
    plain: ['Not going near {other}.'],
    formal: ['{other} and I are not on speaking terms.'],
    warm: ["I can't, not with how things are with {other}."],
    chatty: ['{other}? No! Absolutely not!'],
    dreamy: ['{other} and I are too far apart for that.'],
  },
  nowhere: {
    plain: ['Nowhere to do that.'],
    formal: ['There is nowhere for that to be done.'],
    warm: ["I would, but there's nowhere to do it."],
    chatty: ['Where?! There\'s nowhere for that!'],
    dreamy: ['There is no place for that yet.'],
  },
};

/** The narrator's line when a favour is done. {name}, {other}, {got} (what it brought in). */
export const FAVOUR_DONE: Record<FavourKind, string> = {
  timber: '{name} comes back from the woodlot with {got}.',
  catch: '{name} brings in a catch: {got}.',
  garden: '{name} has worked the garden: {got}.',
  clear: '{name} puts in a day clearing the wild land ({got}).',
  visit: '{name} has been round to see {other}. {other} is glad of the company.',
  mend: '{name} has gone to make peace with {other}.',
};

// ---------------------------------------------------------------- more variety (M4)

addLines(FAVOUR_YES.timber, {
  plain: ['Fine. Timber.', "I'll fetch the axe."],
  formal: ['Timber, then. I shall return with plenty.'],
  warm: ['Happy to. A bit of fresh air will do me good.', "Leave it with me. I'll bring a good load."],
  chatty: ['Chop chop! Literally!', 'Axe, gloves, off I go!'],
  dreamy: ['The trees and I have an understanding.'],
});
addLines(FAVOUR_YES.catch, {
  plain: ['Fish it is.'],
  formal: ['I shall try my luck at the water.'],
  warm: ["I'd love to. It's peaceful by the water."],
  chatty: ['Supper, coming up! Hopefully!', 'Fish! Me! Watch this!', 'Back with a basketful or my name is mud!'],
  dreamy: ['I will ask the brook nicely.', 'The water will give what it gives.', 'Something silver, if I am patient.'],
});
addLines(FAVOUR_YES.garden, {
  plain: ['Garden. Right.'],
  formal: ['I would be glad to tend the garden.'],
  warm: ['I love a bit of time in the garden.'],
  chatty: ['Dirt under the nails! Lovely!'],
  dreamy: ['The garden has been calling me anyway.'],
});
