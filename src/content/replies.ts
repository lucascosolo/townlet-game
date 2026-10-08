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
      return about && subject ? `That's fair, about ${subject(about)}.` : REPLY_SAID.agree;
    case 'disagree':
      return about && subject ? `I don't see ${subject(about)} that way.` : REPLY_SAID.disagree;
  }
}

export const REPLY_LINES: Record<ReplyStance, Lines> = {
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
