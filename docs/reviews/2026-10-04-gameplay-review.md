# Townlet: harsh pre-Steam review

## What I played

All runs are in `scratchpad/review/`.

- **quiet, seed 3, 21 days, considerate steward** (`quiet-considerate.txt`)
- **quiet, seed 3, 21 and 30 days, favours steward** (`quiet-favours.txt`, `quiet-favours-30.txt`)
- **quiet, seed 3, 21 days, no steward** (`quiet-none.txt`)
- **Me as the player, seed 7, 30 days** (`player.ts` → `player7.txt`). I:
  - answered two requests a day by building;
  - built a cottage every other day, a bakery on day 5, a granary on day 8 and a second on day 12;
  - asked about 85 favours: timber, clearing, catches, one mend and one visit;
  - spammed Bram with 5 asks on day 8;
  - felled the oak on day 10;
  - alternated approve and decline on proposals;
  - held 5 talks a day.
- **Trajectory probe** (`moods.ts`): 4 stewards × 2 seeds, sampled at days 7, 14, 21 and 28.
- **Screenshots:** all 13 in `/tmp/claude-0/sp/review2/`.

## Verdict

**Fun score: 4/10.** Townlet has a lovely premise, a good-looking diorama and a real cognitive sim under the hood, and for about the first 20 minutes it charms. The day-1 asks, the contraption, Ada's orchard ("She would have liked this") and the oak grief all land.

Then it shows that nothing you do matters much, and that everyone loves you anyway:

- **Your choices barely move the town.** Mean mood sits at 0.82–0.86 on day 28 whether you build 30 things or nothing at all.
- **The economy runs out of pressure.** Timber hits its 100 cap by day 22, and favours are almost always yes.
- **The winter quest has no teeth.** Falling 157 food short changes nothing.
- **The prompts dry up.** In the considerate town, days 10–21 bring zero asks and zero proposals.
- **The talk is a fan club.** A quarter of everything residents say is about how the steward listens.

The minds are deep in the inspector and shallow on screen. Lines repeat constantly ("A proper place of work! That bodes well." 29 times in 21 days), and the surfaces contradict each other. As it stands, a Steam reviewer would call it "a pretty screensaver with a to-do list" and refund before the 2-hour mark. The bones are worth fixing.

## Core loop as it actually plays

- **Minute to minute:** read bubbles (no speaker name), open the journal, ask a favour. Every favour is a yes unless you spam, so it is a button, not a decision.
- **Hour to hour:** watch. Between dawn boards there is nothing to respond to.
- **Day to day:**
  - dawn board → build what was asked (flower bed 0 timber, hedge 1, bench 2) → maybe approve or decline one of only **3** dilemma types (`src/sim/story/dilemmas.ts`: market_day, night_baking, contraption);
  - in the considerate run, asks per day went 3,2,1,1,1,0,1,1,1, then **0 for days 10–21**;
  - the board in screenshot 12 says it outright: "A quiet night. Nothing needs you." That is at day 17, mid-quest.
- **Week to week:** wishes are granted in a day or two, dreams advance by themselves, and newcomers arrive whenever you place a cottage, up to 18 by about day 20. Nothing is at risk.
- **Year:** no tiers, charter, almanac or town naming. `grep charter|tier|chronicle` finds nothing in `src` or `web/src`. Year 2 is the same quest with a bigger number (target 450).

## Top 12 problems, ranked by impact on fun

### 1. The player can't move how people feel (GAMEPLAY, L)

**Evidence** (`moods.ts`, mean mood on day 28; disposition and steward affinity in brackets):

| Steward | Mean mood, day 28 | Disposition | Steward affinity |
|---|---|---|---|
| None, seed 3 | 0.85 | 0.56 | −0.52 |
| Considerate, seed 3 | 0.84 | 0.93 | +0.96 |
| Favours, seed 3 | 0.86 | — | — |
| None, seed 11 | 0.84 | — | — |

- The minimum mood in any run never went below 0.65.
- In the 21-day neglected town, residents still say "Days like this are why I stay" and "I'm happy today. Properly happy."
- Cause: `src/sim/sim.ts:1085` sets mood to 0.75 × needs wellbeing + 0.25 × emotions, and the founding town's routine already meets every need. The player's buildings only touch the 25% emotion slice and the steward relationship.

**Why it hurts:** this breaks pillar 2 ("Decisions land on people"). Your choices never show up as a happier or sadder person, only as a "thinks better/less of the steward" ledger line.

**Fix:**
- Make needs depend on what the player shapes:
  - comfort from home ambience via `prefScore` (`src/sim/needs.ts`);
  - delight from loved places that still exist;
  - company from layout reach;
  - meagre meals that actually hurt.
- Add a standing-to-mood term so a resident who feels let down is visibly low.
- Add a soak or test criterion that the day-28 mean mood differs by at least 0.15 between `none` and `considerate`, and that at least one resident in `none` drops below 0.5.

### 2. The economy has no tension, just piles (GAMEPLAY, M)

**Evidence:**
- In my run, timber reached its cap of 100 on day 22 and stayed there to day 31.
- 78 of about 85 favours were yes. The only refusals were my deliberate spam ("One thing at a time!", "Again? You've asked me loads this week!") and one cold.
- Costs (`src/content/buildings.ts`): flower bed 0, hedge 1, woodlot 2 (and it *produces* 0.3 timber an hour), garden 3, jetty 3.
- Favours cost the town nothing, because the asked resident's own job output isn't lost.
- Spec 4.3 names "winter firewood is the main seasonal pressure", and it isn't implemented.

**Why it hurts:** there is no "should I build X or Y?". You always can.

**Fix:**
- In `Simulation.finishFavour`/`favourMinute` (`src/sim/sim.ts`), make a favour's hours replace the resident's normal job output, so asking Bram for timber costs bread.
- Raise woodlot and flower bed costs, and give stacked woodlots diminishing yield.
- Add winter firewood upkeep per home (a daily timber draw in `storesDawn` for winter).
- Lower the timber cap, or let it decay.

### 3. The Winter stores quest is toothless (GAMEPLAY, M)

**Evidence:**
- **Falling short changes nothing.** Favours run: "Winter comes with 168 of 325 food put by. Juniper: 'It will have to do. We eat carefully…'". Over the whole winter the granary only fell from 168 to 139 food, then it was feasted away (`quiet-favours-30.txt` lines 1164 and 1552). The only penalty is a −0.2 standing nudge for Juniper (`src/sim/stores.ts` "short" branch).
- **Meeting it is trivial.** In my run the 225 target was met by day 19 just by building a granary on day 8. The granary never drained in winter, and stayed at 376 the whole season.
- **The target grows silently.** It is 25 per resident (`stores.ts:47`), so a player who builds cottages gets 325 posted with 9 days left and no warning.
- **Winter doesn't bite.** The bakery, jetty and glasshouse aren't seasonal, so winter production (30 a day for 18 residents on day 24) roughly matches what the town eats.
- Juniper reacts to the granary she begged for with "Somewhere to make things. I wonder what."

**Fix:**
- Apply season multipliers to the bakery (flour) and jetty (ice) in `src/sim/sim.ts` around lines 113–117, so winter needs about 30% from stores.
- Make "short" bite: meagre meals for N days, visible worry thoughts, and a cold resident or two.
- Narrate progress at 25/50/75% and when the target grows ("Two more mouths: we'll need 50 more").
- Give "met" a reward, such as an unlock or a festival.

### 4. Dead stretches, and only 3 dilemmas in the whole game (GAMEPLAY, M)

**Evidence:**
- Considerate run, days 10–21: 0 requests and 0 proposals.
- The favours run had 2 proposals in 30 days.
- `dilemmas.ts` defines 3 types.
- Board text at day 17: "Nobody is asking for anything just now."
- At 6 real minutes a day, that is more than an hour with nothing to decide.

**Fix:**
- In `src/sim/story/director.ts` (the dilemma storylet near line 459), guarantee at least one player-facing prompt per day.
- Grow the set to 10 or more, and draw them from live resident conflicts:
  - two residents want the same plot;
  - a newcomer wants a noisy workshop next to a quiet-lover;
  - a rival pair asks you to take sides;
  - the trade cart offers timber for food.
- Make them multi-option, not just approve/decline.

### 5. The steward fan club (AI, M)

**Evidence:**
- 153 of 625 quoted lines (24%) in the 21-day favours log mention the steward:
  - "Listen, listen: the steward listens!" ×6;
  - "The steward? Marvellous!" ×9;
  - "Whoever the steward is, they care about this place." ×10.
- Steward affinity saturates: Ada is at +1.00 with "the steward listens", and her inspect sources are mostly "recalled: told Fen", "told Wren". Telling people rehearses the belief, so gossip about the steward keeps reinforcing itself.
- `src/sim/mind/thoughts.ts:95` weights the steward topic at 0.2 + 0.4·|standing|. At standing 1 that is 0.6, which beats the dream (0.45) and festivals.

**Why it hurts:** it reads as sycophantic and fake. That is the "chatbot" anti-goal in the spec, and it drowns out residents talking about each other.

**Fix:**
- Weight the steward topic by *recent change* in standing, not its absolute value.
- Let affinity relax toward a baseline.
- Stop counting re-telling as fresh evidence for the teller (`src/sim/mind/memory.ts` recall path).
- Allow at most one steward line per resident per day in chat.

### 6. The minds contradict themselves across surfaces (AI, M)

**Evidence:**
- **Juniper on Ada.** Day 2 talk: "Something went sour between me and Ada." Day 3, asked what she thinks of Ada: "I haven't felt anything about Ada yet." (`player7.txt` lines 97 and 163.) Cause: `feelingAbout` maps anything within ±0.05 to neutral (`src/sim/talk.ts:16-27`), and fresh grudges are ignored.
- **Juniper, one answer:** "The town is in kind hands. The steward sits in my chest like a stone." (line 1029)
- **Bram, day 1:** takes up the bakery at 10:00, then at 10:09 and 18:13 says "I'm going to find a bakery to work in!" Dream steps only advance at 06:05.
- **Cal:** takes the garden job on day 2, then sighs "Idle hands! Give me a job, anyone!" on day 3.
- **Ada:** her journal says "Wants some quiet", and her talk answer says "Thriving".
- **Teal:** woken by the bakery on **17** nights, never asks for a hedge, and then "has decided the bakery is a lovely spot" while still "thinks less of the steward: put the bakery there."

**Fix:**
- In `talkAnswer`, include argument and grudge memory in person opinions.
- Remove a topic from an answer if an opposite-valence topic about the same subject is already in it (`talk.ts`, `thoughts.ts`).
- Advance an aspiration step at the moment its condition is met (`src/sim/story/aspirations.ts`), not at dawn.
- Gate the `need:purpose` idle line on not having a job (`src/content/thoughts.ts:47`).
- Let sustained sleep loss always produce `quieter_home` (`src/sim/asks.ts:63-67`). It currently needs a belief of strength ≥ 0.35, which mixed-valence evidence can cancel.

### 7. Repetition kills the illusion (WRITING, M)

**Evidence:**
- 21-day favours log: 625 quotes, only 329 unique.
- Top repeats:
  - "A proper place of work! That bodes well." 29 times;
  - "Work! Trade! Things are happening!" 12;
  - "I keep picturing it. I just need to get to know the neighbours." 11 (22 in my run);
  - "A place of my own. I could cry." 9, said by newcomers about a *shared* garden plot.
- Causes:
  - reaction lines have one line per register (`src/content/voice.ts:287-314`);
  - `TALK_ME` has one line per band per register (`src/content/talk.ts:102`), so Fen answered "what do you think of me" identically 5 times out of 5;
  - newcomers share 5 registers, so every warm newcomer sounds alike;
  - each trade has 2 backgrounds (`src/content/newcomers.ts:94`), so Jory and Rosa are both "Ran a busy tavern in town… wanted to belong somewhere", and Kit and Otto share theirs;
  - every newcomer's dream is "Settle into the valley / Get to know the neighbours" (`src/sim/story/dreams.ts:93-97`), even though the trades carry unused `hopes`.

**Fix:**
- Write 4–6 lines per cell.
- Add a per-resident recent-line memory in `Narrator.utter`: no repeat for 3 days, and share across residents for reactions.
- Give each newcomer a generated pet phrase.
- Use the trade's `hopes` as the newcomer's first dream.
- Batch building reactions: "Bram, Cal and Tilly look over the new granary" instead of 9 separate lines.

### 8. Text bugs a reviewer will screenshot (WRITING, S)

**Evidence:**
- "Might the town have a orchard?" and "Give me a garden plots" (`voice.ts:322,324,357`: `a {what}` with no article logic, and plural building names).
- "Right?, did I tell you…" (`src/narrate/narrator.ts:252`: a tic ending in "?" gets a comma appended).
- "Ada? I like it, yes." ×10 and "Ada? Good stuff!" These are place lines used for people (`talk.ts:59,66,67`).
- "Honestly, you know, I've decided…" (two stacked tics).

**Fix:**
- Add an `aOrAn()` helper and singular display names ("garden plot").
- Handle "?" in the tic branch.
- Split `TALK_OPINION` into person and place sets.

### 9. No save, and the same town every time (UX, M)

**Evidence:**
- No `localStorage` or serialisation anywhere in `web/src`. A refresh loses the town.
- `web/src/main.ts:15` defaults to seed 1 and the fixed 24×24 bakery map, so every new player gets the same six people in the same houses.

**Fix:**
- `Game` already keeps a replayable `commandLog` plus seed (`web/src/game.ts`). Persist those and replay on load.
- Add a "New valley" screen with a random seed and a town name. The name also serves the spec's pride-of-place pillar.

### 10. The board and log are bookkeeping, not story (UX, M)

**Evidence:**
- 237 of 356 board items (67%) in the 30-day favours run are "has decided X is a lovely spot (time and again)", "now counts", or "thinks better/less".
- Boards average 12 items, with a peak of 24.
- Speech bubbles carry no speaker name (screenshots 02, 05, 08: "You know, the steward? Marvellous!" floats over an anonymous figure).
- Wish cards say "Ada: 0% green enough" (screenshots 10, 11).
- On phone, the panel covers about 55% of the screen.

**Fix:**
- In the narrator's dawn rendering, fold belief and friendship updates into one "Around town" line, and show steward-standing changes only when they cross a band.
- Add a name or portrait chip to bubbles (`web/src/view/scene.ts`).
- Write wish progress in words ("Ada still has nothing green by her door").
- On phone, default the panel to a peek height.

### 11. No medium or long arc (GAMEPLAY, L)

**Evidence:**
- Spec §3 promises Clearing → Hamlet → Village → Townlet tiers, a charter and an Almanac. None of these exist in code.
- Cleared land is aimless. 9 plots opened in my run, yet the open-plot count stayed at about 6. There is no reason to build out there, and no visible frontier in screenshot 09.
- The 18-resident cap is reached by about day 20 just by placing cottages.

**Fix:**
- Tiers gated on population, wishes granted and plots cleared, each unlocking buildings and a new arrival type.
- Newcomers that need a reason to come (an unmet trade the town wants), not just an empty house.
- A day-28 charter scene that replays the narrator's Highlights as the Almanac.

### 12. Social monoculture, no friction (AI/GAMEPLAY, M)

**Evidence:**
- The teahouse is mentioned 146 times in 21 days.
- "X has decided the teahouse is a lovely spot" floods the board.
- The same newcomer asked for "place_to_gather" on days 13, 17, 24 and 30, although I built a bench beside them each time. Benches don't relieve the crowd, because the ask reopens as long as the teahouse is crowded (`asks.ts:98`).
- **0 rival pairs** in all 8 runs at day 28.
- Only one argument storyline repeats (Juniper and Ada, "You never listen, Ada", in all three seed-3 runs).

**Fix:**
- In place choice (`src/sim/mind/structured.ts`), penalise crowding by occupancy.
- Count `place_to_gather` as met when *that resident's* evenings get less crowded.
- Seed friction from conflicting wants: a noise lover next to a quiet lover, two people competing for one job, envy when one dream is granted and another isn't.

## Quick wins (size S, high impact)

1. **Grammar and tic fixes:** `aOrAn`, singular building names, "?" tics (`voice.ts`, `narrator.ts:252`).
2. **Separate person and place opinion lines** (`talk.ts:55-80`).
3. **Steward topic weighted by recent change** instead of |standing| (`thoughts.ts:95`), capped at one steward line per resident per day.
4. **The requester reacts as the requester.** When a built building fulfils someone's open request, they say a gratitude line ("You built it!") instead of the generic `work`/`pretty` reaction (`voice.ts` reactions and the notice path in `sim.ts`).
5. **Advance a dream step immediately** when its building appears (`aspirations.ts`), which kills "find a bakery" after the bakery exists.
6. **Fold belief and friendship updates on the dawn board** into one digest line (narrator board rendering).
7. **Speaker name on bubbles** (`web/src/view/scene.ts`).
8. **Costs:** flower bed 1, woodlot 6, and a favour displaces the resident's own job output (`buildings.ts`, `sim.ts`).
9. **Seasonal bakery and jetty output in winter**, plus a meagre-meal mood hit, so the granary matters (`sim.ts` ~113–117, the meal code).
10. **Quest progress lines** in the log at 25/50/75%, and when the target grows (`stores.ts` `storesHourly`/`storesDawn`).
11. **Save via the command log** in `localStorage` (`web/src/game.ts`).
12. **Random seed by default** for new games (`web/src/main.ts:15`).

## Caveats

- **Headless only.** I did not play the live web build. The UX points come from the 13 screenshots plus source.
- **Two seeds.** The mood-invariance numbers come from seeds 3 and 11. Other seeds may vary, but the mechanism (sim.ts:1085, with routine needs met) makes me confident it generalises.
- **Teal's silent suffering is a guess at the cause.** The `noisy_at_night` belief probably stays under 0.35 because the bakery's positive evidence cancels it. I did not trace it.
- **Second-person talk.** Talk answers read in the third person ("the steward listens") headless. The browser rewrites them to second person through `toSteward`, so that part is fine in game.
