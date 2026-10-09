// Talking back (bar round 1): what the steward can say after an answer, and how residents take it.
// Responses are in the resident's register; {aspect} is not used, the grievance is implied.

import { ownNote, type ReplyKind, type ReplyOffer, type ReplyStance } from '../sim/replies.js';
import type { Lines } from './voice.js';

/** The steward's side, as the chat shows it. */
export const REPLY_SAID: Record<ReplyKind, string> = {
  agree: "That's fair.",
  disagree: "I don't see it that way.",
  sorry: "I'm sorry.",
  explain: 'Let me explain.',
};

/**
 * The steward's side, naming what it answers (bar round 2): "I'm sorry I took away the old oak",
 * "Let me explain why I said no to your idea", "That's fair, about the well". `subject` turns a
 * subject id into words; without one, agree and disagree stay plain.
 */
export function replySaid(offer: ReplyOffer, subject?: (id: string) => string): string {
  const about = offer.about;
  switch (offer.kind) {
    case 'sorry':
      return about ? `I'm sorry ${ownNote(about)}.` : REPLY_SAID.sorry;
    case 'explain':
      return about ? `Let me explain why ${ownNote(about)}.` : REPLY_SAID.explain;
    case 'agree':
      if (offer.tone === 'hope') return offer.rest ? 'Take your time.' : 'I hope it comes true.';
      if (offer.tone === 'mood') return offer.well ? "Good. I'm glad." : "That's hard. I'm listening.";
      if (offer.tone === 'complaint') return "That's fair. I hear you.";
      if (offer.tone === 'praise') return 'Thank you. That means something.';
      return about && subject ? `That's fair, about ${subject(about)}.` : REPLY_SAID.agree;
    case 'disagree':
      if (offer.tone === 'hope') return offer.rest ? "Don't settle for too little." : 'Is that really what you want?';
      if (offer.tone === 'mood') return offer.well ? "You don't seem it." : "It can't be all bad.";
      if (about === 'steward') return offer.tone === 'praise' ? "I don't deserve that." : "I don't see myself that way.";
      return about && subject ? `I don't see ${subject(about)} that way.` : REPLY_SAID.disagree;
  }
}

export const REPLY_LINES: Record<ReplyStance, Lines> = <Record<ReplyStance, Lines>>{
  warm: {
    plain: ['Good.', 'Glad you see it.', 'Right, then.'],
    formal: ['I am glad we understand each other.', 'Thank you for hearing me.', 'That is good of you to say.'],
    warm: ["Thank you. That means a lot.", "I'm glad you think so.", 'See, we do all right, you and I.'],
    chatty: ['Ha! Knew you would get it!', 'See? Easy!', 'That is what I like to hear!'],
    dreamy: ['Then we are in step, a little.', 'Good. The air feels clearer.', 'I thought you might.'],
  },
  respect: {
    plain: ["Fair enough. Straight talk, I'll take it.", 'At least you say so to my face.', "Hm. We'll see who's right."],
    formal: ['Then we differ, and I respect you for saying so.', 'I would rather an honest disagreement than a kind evasion.', 'Noted. I can live with being disagreed with.'],
    warm: ["Well, that's honest of you. I can respect that.", 'We can disagree and still be friends, I hope.', 'All right. I hear you, even if I don\'t agree.'],
    chatty: ['Oh, you think so? Fine, fine! Honest, at least!', "Ha! A spine! I like that!", 'Well! We shall see!'],
    dreamy: ['Two weathers in one sky. That is allowed.', 'Then we see different colours in it.', 'I can hold that. Thank you for saying it.'],
  },
  sulk: {
    plain: ["Suit yourself.", 'Hmph.', "Didn't ask for your opinion of my opinion."],
    formal: ['I see. Then there is little more to say.', 'You are entitled to your view, however mistaken.', 'Very well. I shall keep my own counsel.'],
    warm: ["Oh. Well. I thought you'd understand.", "That's a bit hurtful, honestly.", "Fine. Let's not talk about it, then."],
    chatty: ['Oh, is that so!', 'Well, excuse ME!', "Fine! Fine! Don't listen, then!"],
    dreamy: ['The light has gone a little grey.', 'A door shuts somewhere.', 'I shall keep it to myself, then.'],
  },
  forgiven: {
    plain: ["All right. Said is said.", "Fine. Let's leave it there.", 'Took you long enough. But all right.'],
    formal: ['Thank you. That was not easily said, and I accept it.', 'I appreciate that. We shall say no more about it.', 'Then let us put it behind us.'],
    warm: ["Oh, thank you. That helps, it really does.", "It's all right. I know you didn't mean it badly.", 'Come here. We are fine, you and I.'],
    chatty: ['Well! About time! Hug it out!', 'Forgiven! Mostly!', 'Ha! Apology accepted, you rascal!'],
    dreamy: ['Something unclenches. Thank you.', 'The splinter works loose a little.', 'I will try to let it go.'],
  },
  enough: {
    plain: ["You've said. Don't keep saying it.", 'Enough sorry. Do better.', 'Heard you the first time.'],
    formal: ['You have apologised already. Actions would serve better than words now.', 'Once was sufficient.', 'I would rather see it than hear it again.'],
    warm: ["You don't need to keep saying sorry. Just... show me.", "I know, I know. It's all right.", 'Sorry again? Let it be, now.'],
    chatty: ['Again? Stop it! I forgave you already!', 'Sorry sorry sorry! Enough!', 'Oh, hush. Buy me a bun instead!'],
    dreamy: ['The word wears thin with use.', 'I heard it the first time. Let it settle.', 'Enough. Let the quiet do the rest.'],
  },
  convinced: {
    plain: ["Fair. I didn't know that.", 'All right, that makes sense.', 'Could have said so sooner.'],
    formal: ['I see. That puts a different light on it.', 'Thank you. I understand your reasoning now.', 'That is reasonable. I withdraw my complaint, mostly.'],
    warm: ["Oh. I wish I'd known. That makes sense.", "Well, when you put it that way...", 'Thank you for telling me. It helps to know why.'],
    chatty: ['Ohhh! Well, why didn\'t you say!', 'Fine, fine, that is fair!', 'Ha! All right, you had reasons!'],
    dreamy: ['Ah. The shape of it changes.', 'So that was the reason. It sits easier now.', 'I see further into it now.'],
  },
  unconvinced: {
    plain: ['Reasons. Hmph.', "Don't want reasons. Wanted it done.", 'Save it.'],
    formal: ['Reasons are easily found after the fact.', 'I am not persuaded, I am afraid.', 'That may be so. It does not change the outcome.'],
    warm: ["I'm sure you had your reasons. I'm still hurt, though.", "Maybe. It still feels like you didn't care.", "I hear you. I don't quite believe you yet."],
    chatty: ['Excuses, excuses!', 'Oh, reasons! Lovely! Still no!', 'Talk is cheap, you know!'],
    dreamy: ['Words. The thing itself is still missing.', 'An explanation is not a mend.', 'I hear it. It does not land.'],
  },
  puzzled: {
    plain: ['Sorry for what?', 'Eh?'],
    formal: ['I am not sure what you are apologising for.', 'There is nothing to forgive, that I know of.'],
    warm: ["Sorry? Whatever for?", "You've nothing to be sorry about, love."],
    chatty: ['Sorry? What did you do?!', 'Eh? What for?'],
    dreamy: ['The apology floats past, looking for somewhere to land.', 'For what? The day is clear.'],
  },
};

// Bar round 3: how a reply lands depends on what it answered.
Object.assign(REPLY_LINES, {
  owned: {
    plain: ['At least you own it.', 'Fair. Said is half done.', "Good. Now fix it.", 'Not many say that. Noted.', "Right. That's a start."],
    formal: ['I appreciate your candour.', 'That is a good deal more than I expected.', 'Owning it does you credit.', 'Then we understand each other on that.', 'I shall hold you to it.'],
    warm: ["Thank you for not pretending.", "That means more than you'd think.", "Well. That helps, honestly.", "I didn't expect you to say so. Thank you.", "Then I can let it go a little."],
    chatty: ['Oh! Well! That was easy!', 'A steward who admits things! Write it down!', 'Ha! Fair play to you!', 'Well, now I have nothing to grumble about! Rude!', "Look at that! Honesty! In this town!"],
    dreamy: ['The knot loosens a little.', 'Said aloud, it weighs less.', 'There. The air is clearer already.', 'A true word, and the day turns.', 'I hear it. It lands softly.'],
  },
  insist: {
    plain: ["Don't argue. I mean it.", 'Take it. It was meant.', "Too modest. Stop it.", 'I said what I said.', "You did. Leave it there."],
    formal: ['Modesty becomes you, but I stand by it.', 'I do not offer praise lightly. Accept it.', 'Nevertheless, it is so.', 'You may demur. I shall not change my mind.', 'Allow me my opinion, steward.'],
    warm: ["Oh, hush. You do.", "Don't be daft. I meant every word.", "You can't talk me out of it, you know.", "Let someone be grateful for once.", "Well, I think so, and that's that."],
    chatty: ['Ha! Too late! Already said it!', 'Nope! Compliment delivered! No returns!', 'Modest AND good! Unbearable!', 'Stop it! Take the nice thing!', "I'll say it louder if you like!"],
    dreamy: ['A kind word does not need your permission.', 'It is true whether you hold it or not.', 'Let it sit. It suits you.', 'You can put it down, but it stays yours.', 'The praise is out now. It has flown.'],
  },
  differ: {
    plain: ['We differ, then.', "Suit yourself. I know what I think.", 'Each to their own.', "We'll see.", 'Not how I see it, but all right.'],
    formal: ['Then we must agree to differ.', 'A reasonable person might think so. I do not.', 'I hold my view, and you yours.', 'Interesting. I remain unpersuaded.', 'We shall have to see who is right.'],
    warm: ["Oh? Well, we can see it differently.", "Maybe. I still think what I think.", "Fair enough, it's not for everyone.", "Hm. I'll think about that.", "We don't have to agree, do we?"],
    chatty: ['Ooh, a debate! Wrong, but a debate!', 'Agree to disagree! Loudly!', 'You and your opinions! Ha!', "Well, I'm right, but go on!", 'Ha! Bold of you!'],
    dreamy: ['Two windows on the same garden.', 'We see different weather, you and I.', 'Perhaps it changes with the light.', 'It may look otherwise from where you stand.', 'Then let it be two things at once.'],
  },
  seen: {
    plain: ["...No. You're right.", 'Hm. Caught me.', "Not as fine as I said, maybe.", "You're sharp.", 'All right. Bit of a day.'],
    formal: ['You are perceptive. I am a little out of sorts.', 'Perhaps I overstated it.', 'I confess it has not been the easiest day.', 'You see more than you let on.', 'I would rather not dwell on it, but you are right.'],
    warm: ["You noticed. That's kind of you.", "Oh, you can tell? It's been a bit much.", "Thank you for asking properly.", "I'm all right. Mostly. Thank you.", "It helps that you see it, honestly."],
    chatty: ['Busted! Fine, fine, a bit tired!', "Ha! Can't fool you!", 'Oh, you saw that? Sneaky!', "Well, since you ask properly!", "Fine! A small grumble! Happy?"],
    dreamy: ['You looked past the curtain.', 'The weather in me is greyer than I said.', 'You see the cloud behind the smile.', 'Yes. There is a shadow on it.', 'Kind of you to look closer.'],
  },
  with_you: {
    plain: ['Glad you see it.', 'Right, then.', "Thought you might.", 'Good.', 'Same mind, us.'],
    formal: ['I am glad we see it alike.', 'It is pleasant to be agreed with.', 'Then we are of one mind.', 'Good. I hoped you would.', 'That settles it.'],
    warm: ["Oh, good. I thought it was just me.", "See? You get it.", "Isn't it nice to agree?", "I'm glad you think so too.", 'That makes two of us.'],
    chatty: ['Yes! Exactly! See!', 'Ha! Great minds!', 'Finally, someone agrees with me!', "That's what I keep saying!", 'Two of us! A movement!'],
    dreamy: ['Then we are looking at the same sky.', 'Agreed, like two notes in tune.', 'It is good to stand on the same side.', 'Yes. You see it too.', 'Then the thought is shared.'],
  },
  // Bar round 5: "You don't seem it" to someone who really is well; a nudge between dreams; a sorry
  // that comes too late to someone who has given up on you.
  fine: {
    plain: ["No, really. I'm fine.", 'Honest. All good.', "I'm well. Don't fuss.", "Fine. Really. Promise.", "Nothing wrong with me."],
    formal: ['I assure you, I am quite well.', 'You are kind to wonder, but there is no need.', 'Truly, I am in good spirits.', 'I would tell you if it were otherwise.', 'I am well. Better than well, in fact.'],
    warm: ["No, honestly, I'm happy! It's nice of you to check.", "I really am fine, you sweet thing.", "Truly! It's a good stretch, this.", "I mean it. I'm doing well.", "You're kind to ask twice. I'm all right, really."],
    chatty: ['Me? Fine! Fabulous! Ask anyone!', "No no no, I'm great! Look at me!", 'Fine! Promise! Cross my heart!', "Ha! I'm the happiest person you'll meet today!", 'Seem it? I AM it!'],
    dreamy: ['The day sits lightly on me. Truly.', 'No shadow today. I promise.', 'I am well, like a field after rain.', 'It is a good season in me.', 'Look closer. It is real.'],
  },
  nudged: {
    plain: ["Not settling. Resting.", "Something'll come. Don't rush me.", "Fair. I'll think bigger.", "Maybe. I'm not done yet.", "I hear you. Give it a week."],
    formal: ['I am not settling, merely pausing.', 'You may be right. I shall not rest too long.', 'A fair challenge. Something larger will come to me.', 'I take your point. I have not stopped wanting things.', 'Rest is not retreat. But I hear you.'],
    warm: ["You're right, I shouldn't get too comfortable.", "Oh, I won't! I just need a breather.", "That's sweet. I'll dream something big, promise.", "Ha, you sound like my mother. But yes.", "You think I could do more? Maybe I could."],
    chatty: ['Settle? Me? Never! Just pausing!', "Ooh, a challenge! Fine! Something BIG next!", "Too little? Watch this space!", "You're right! What's the biggest thing I could do?", 'Pausing! Not stopping! Big difference!'],
    dreamy: ['The next wish is gathering itself.', 'I am only between tides.', 'You may be right. I will listen for something larger.', 'Fallow fields grow the best crops.', 'Perhaps I have been dreaming too small.'],
  },
  cheap: {
    plain: ["Words are cheap.", "Sorry won't mend it.", "Show me, don't tell me.", "Heard sorry before.", "Do something, then."],
    formal: ['An apology is easy. Amends are not.', 'I would sooner see it in what you do.', 'Words cost you nothing, steward.', 'I have heard fine words before.', 'Forgive me if I wait for deeds.'],
    warm: ["I'd like to believe you. Show me.", "It's a bit late for sorry, honestly.", "Saying it doesn't make it better.", "I want things to change, not words.", "I'm too tired to accept that right now."],
    chatty: ['Sorry? SORRY? Ha!', "Prove it! Then we'll talk!", "Words! Lovely! Where's the doing?", "Sorry's free! Try something that costs you!", "Nope! Not today!"],
    dreamy: ['Words fall like leaves. I am waiting for the tree.', 'A sorry is a seed. Let me see it grow.', 'Too late, and too light.', 'The wound is older than your words.', 'I hear you. The ache does not.'],
  },
  // Bar round 4: a hope cheered on, doubted by the steady, doubted by the touchy.
  encouraged: {
    plain: ['Thanks. Means something, that.', "We'll see. But thanks.", 'Good to hear.', "Ta. I'll keep at it.", 'Right. Onward, then.'],
    formal: ['That is kind of you. I shall hold you to it.', 'Thank you. It helps to be believed in.', 'I am obliged. One does like a little encouragement.', 'Then I shall try not to disappoint you.', 'Thank you. I mean to see it through.'],
    warm: ["Oh, thank you. That really helps.", "You're sweet. I hope so too.", "That means more than you know.", "Fingers crossed, then! Thank you.", "Thank you. I'll tell you how it goes."],
    chatty: ["You think so? You do? Brilliant!", 'Ha! With you on my side, how can I fail!', "Yes! It will! I'll make sure of it!", "That's the spirit! Mine, I mean! And yours!", 'Oh, I could hug you! I won\'t. But I could!'],
    dreamy: ['Then it is a little more real now.', 'A wish said twice grows roots.', 'I shall carry that with me.', 'Thank you. It glows a little brighter.', 'Then two of us are hoping.'],
  },
  mulled: {
    plain: ["Hm. Fair question. Still want it.", "I've asked myself that. Yes.", "Maybe. I'll think on it.", 'Good question. Not sure.', "Honest of you. I'll chew on it."],
    formal: ['A fair question. I believe it is, but I shall consider it.', 'You are right to ask. I have asked myself the same.', 'Hm. Perhaps I want the idea of it more than the thing.', 'I shall think on that. Thank you for asking it plainly.', 'It is, I think. But I am glad someone asked.'],
    warm: ["Oh. Do you know, I'm not sure. Let me think.", "That's a good question, actually. Yes, I think so.", "Hm. You might have a point. I'll mull it over.", "I think so. But thank you for asking, really.", "Nobody's asked me that before. I'll think about it."],
    chatty: ['Ooh! Good question! Let me think! Yes! Probably!', 'Is it? Is it! Hm! I think so!', "Now you've got me wondering!", "Ha! Sharp! I'll have to think about that one!", 'Do I? I do! Mostly! I think!'],
    dreamy: ['Perhaps it is the wanting I love, and not the thing.', 'I shall sit with that question a while.', 'You have turned it in the light for me.', 'Maybe. Dreams are slippery.', 'I will ask the evening and see what it says.'],
  },
  bristled: {
    plain: ["It is. Thanks for asking.", 'Yes. It is.', "Didn't ask for a vote.", 'My business, that.', "I know what I want."],
    formal: ['I am quite certain, thank you.', 'I hardly think that is yours to judge.', 'I know my own mind, I assure you.', 'Yes. I did not expect to be questioned on it.', 'I shall pretend you did not ask that.'],
    warm: ["Oh. Yes, it is. I thought you'd be pleased for me.", "That's a bit deflating, honestly.", "I do know what I want, you know.", "Oh. Well. I thought you'd understand.", 'That stung a little.'],
    chatty: ['Of course it is! What a question!', "Excuse me! It's my dream!", 'Yes! Obviously! Honestly!', "Don't you start!", 'Rude! But yes!'],
    dreamy: ['You have put a crack in it.', 'It was whole until you asked.', 'Some things are not for doubting aloud.', 'The wish goes quiet when it is questioned.', 'I will keep it closer, then.'],
  },
});
