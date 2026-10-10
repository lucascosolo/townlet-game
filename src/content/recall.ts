// Memories in conversation (2026-10-08): how residents retell what they lived through.
// A retelling is a clause ("you built the bakery for me") set in a line in their register, with
// when it happened. {clause} and {when} are filled in; the first letter is capitalised after.

import type { Lines } from './voice.js';

export const RECALL_LINES: { good: Lines; bad: Lines } = {
  // Bar round 7: eight ways each, rested a week ("Do you know, I still smile about it" ten times in a month).
  // Bar round 8: twelve for warm voices, the commonest among newcomers (five times in a grown town's month).
  good: {
    plain: ["{clause}, {when}. I haven't forgotten.", 'I remember {when}: {clause}. Good, that.', '{when}, {clause}. Still pleased about it.', 'Think on it often: {clause}, {when}.', '{clause}, {when}. That was a good day.', 'Not forgotten: {clause}, {when}.', '{clause}, {when}. Made my week.', 'Good memory, that: {clause}, {when}.'],
    formal: ['I still recall that {clause}, {when}.', 'I have not forgotten that {clause}, {when}. It meant a great deal.', 'It gives me some pleasure to recall that {clause}, {when}.', 'I think often of how {clause}, {when}.', 'I treasure it still: {clause}, {when}.', 'Allow me to remember that {clause}, {when}. It did me good.', 'I count it among the good things that {clause}, {when}.', 'It was a fine thing that {clause}, {when}.'],
    warm: ['I keep thinking about how {clause}, {when}.', 'Do you know, I still smile about it: {clause}, {when}.', "It warms me still that {clause}, {when}.", 'I hold on to it: {clause}, {when}.', "{clause}, {when}. I'll not forget that.", 'Funny what stays with you. {clause}, {when}.', "I've been glad all week that {clause}, {when}.", 'Little things matter. {clause}, {when}.', "It still makes me happy that {clause}, {when}.", '{clause}, {when}. That meant the world.', 'I was so pleased when {clause}, {when}.', "Remember? {clause}, {when}. Lovely, that was."],
    chatty: ['Remember {when}? {clause}! I still smile about it!', '{clause}, {when}! I tell everyone!', '{when}! {clause}! Best day!', 'Did I ever tell you? {clause}, {when}!', '{clause}, {when}! Still grinning!', 'Oh, and {when}! {clause}! Lovely!', '{clause}, {when}! Told everyone twice!', 'Guess what still makes me happy? {clause}, {when}!'],
    dreamy: ['{when}, {clause}. I keep it like a pressed flower.', 'I still think of it: {clause}, {when}.', '{clause}, {when}. It glows a little, still.', 'There is a small lamp in me from it: {clause}, {when}.', '{when}, {clause}. I carry it about.', 'Some days are kept. {clause}, {when}.', '{clause}, {when}. A bright stone in my pocket.', 'I keep returning to it: {clause}, {when}.'],
  },
  bad: {
    plain: ['{clause}, {when}. Still sore about it.', 'I remember {when}: {clause}. Not forgotten.', '{clause}, {when}. Rankles.', "{when}, {clause}. Haven't let it go.", 'Still think on it: {clause}, {when}.', '{clause}, {when}. Not right, that.', '{clause}, {when}. Not over it.', 'Still bothers me: {clause}, {when}.'],
    formal: ['I have not forgotten that {clause}, {when}.', 'I confess it still weighs on me that {clause}, {when}.', 'It troubles me yet that {clause}, {when}.', 'I find I cannot set aside that {clause}, {when}.', 'I remain unhappy that {clause}, {when}.', 'It is not forgotten that {clause}, {when}.', 'I am still aggrieved that {clause}, {when}.', 'It sits ill with me that {clause}, {when}.'],
    warm: ['It still stings that {clause}, {when}.', "I try not to dwell on it, but {clause}, {when}.", "It's still with me that {clause}, {when}.", "I keep coming back to it: {clause}, {when}.", '{clause}, {when}. It hurt, honestly.', "I'd like to forget that {clause}, {when}. I can't yet.", "I haven't quite made peace with it: {clause}, {when}.", 'It still smarts that {clause}, {when}.'],
    chatty: ["And {when}? {clause}! Don't think I've forgotten!", '{clause}, {when}! Honestly!', '{when}! {clause}! Still cross!', 'Oh, {when}? {clause}! Not forgotten! Not forgiven!', '{clause}, {when}! The cheek of it!', "Don't get me started on {when}. {clause}!", '{clause}, {when}! I could scream!', "Oh, and {when}! {clause}! Still not over it!"],
    dreamy: ["{when}, {clause}. It's still in me, like a splinter.", 'Something still aches: {clause}, {when}.', '{clause}, {when}. A cold spot I keep walking into.', '{when}, {clause}. The weather has not cleared.', 'It sits in me still: {clause}, {when}.', '{clause}, {when}. A bruise that does not fade.', '{clause}, {when}. A shadow that will not move.', 'It lingers: {clause}, {when}.'],
  },
};

/** The number words a resident says, for "three days ago". */
export const DAY_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
