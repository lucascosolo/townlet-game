# Brief for bar review 9 (2026-10-11): a targeted review

This review is narrower than reviews 1 to 8. It checks the four phases of the plan of 2026-10-11
(spec 9.3, "the plan of 2026-10-11") as a player would meet them, and it answers one question the
owner asked: what did I decide on days 15 to 30?

Score the five counts of the bar (spec 9.4) as before, out of 10 with 8 as the pass mark, but spend
the time on the three things below. Read the spec's Phase A to D criteria and statuses first; the
numbers there are the builder's, and your job is to see whether they hold up at the screen.

## 1. Phones and desktops (Phase A)

Play a fresh bakery town through its intro and the first five days on each of these, with touch
emulation on the phones:

- 390×844 upright, then turned to 844×390 mid-game (not reloaded).
- 360×780 upright.
- 1280×800 desktop with a mouse.

On each: can you read the clock, the stock and the renown at every moment, with nothing over them?
Does any tab, sheet or card cover the HUD? Can you build (choose a card, place, rotate, cancel),
talk (tap or click someone, ask, reply) and read the Goals tier card? Are the buttons big enough for a
thumb? Turned sideways, is the layout still the phone's, with the sheet rolled away and the town
tappable? On the desktop, does Goals show its goals and the tier line whole, and does the tier line
open? Screenshot anything that overflows, clips or covers.

Also: what do residents say they love? Ask "how are you" and read the Folk pages. Report every
"loves" line you see and whether any resident's loved thing seems unearned.

## 2. Saves (Phase B)

In the 1280×800 game, on day 3 and again on day 12: close the page and reopen the plain URL. Is the
town where you left it (same minute, same buildings, same people, the log intact)? Then simulate an
older save: in the console, read `localStorage['townlet.save.v1']`, delete its `snapshot` and
`simVersion` keys, set `version` to 1, write it back, and reload. The town should come back at the
same minute by replay. Report what happened each time and how long the reload took.

## 3. What did I decide on days 15 to 30? (Phase D criterion 6)

Play the 1280×800 bakery town to day 30 as an engaged steward (answer proposals, grant asks, talk at
noon, one favour a day), as review 8 did. From day 15, keep a diary: each day, list what the game put
in front of you to decide (proposals, asks, favours offered, dreams waiting on you, newcomers, anyone
thinking of leaving) and what you did about it. At the end, answer in a paragraph: was the second
fortnight as full as the first, and did any of it matter? Count the diary against the spec's numbers
(a considerate steward's days 15–28 hold about 16 to 21 things to decide).

## Harness

Build with `npm run build` and serve with `npm run preview` (port 4173) or `vite preview --port 4174`;
drive the real UI with Playwright as before. Use the debug handle only to advance time (`runTicks`)
and to bring a tile on screen (`focus`); every action a player takes goes through the on-screen
controls. Save screenshots under `docs/reviews/shots-9/`. Report crashes, console errors and load
times, and say what you could not check.

Write the review as `docs/reviews/2026-10-11-bar-review-9.md`, in the form of review 8: what you
played, the five scores with a verdict, and the problems ranked by how much they hold the game back,
with the targeted findings above first.
