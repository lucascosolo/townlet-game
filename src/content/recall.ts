// Memories in conversation (2026-10-08): how residents retell what they lived through.
// A retelling is a clause ("you built the bakery for me") set in a line in their register, with
// when it happened. {clause} and {when} are filled in; the first letter is capitalised after.

import type { Lines } from './voice.js';

export const RECALL_LINES: { good: Lines; bad: Lines } = {
  good: {
    plain: ['{clause}, {when}. I haven\'t forgotten.', 'I remember {when}: {clause}. Good, that.'],
    formal: ['I still recall that {clause}, {when}.', 'I have not forgotten that {clause}, {when}. It meant a great deal.'],
    warm: ['I keep thinking about how {clause}, {when}.', 'Do you know, I still smile about it: {clause}, {when}.'],
    chatty: ['Remember {when}? {clause}! I still smile about it!', '{clause}, {when}! I tell everyone!'],
    dreamy: ['{when}, {clause}. I keep it like a pressed flower.', 'I still think of it: {clause}, {when}.'],
  },
  bad: {
    plain: ['{clause}, {when}. Still sore about it.', 'I remember {when}: {clause}. Not forgotten.'],
    formal: ['I have not forgotten that {clause}, {when}.', 'I confess it still weighs on me that {clause}, {when}.'],
    warm: ['It still stings that {clause}, {when}.', 'I try not to dwell on it, but {clause}, {when}.'],
    chatty: ['And {when}? {clause}! Don\'t think I\'ve forgotten!', '{clause}, {when}! Honestly!'],
    dreamy: ['{when}, {clause}. It\'s still in me, like a splinter.', 'Something still aches: {clause}, {when}.'],
  },
};

/** The number words a resident says, for "three days ago". */
export const DAY_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
