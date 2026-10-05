# Townlet decisions

These are decisions that change what gets built. Each entry says what was chosen, what was rejected, and why. Newest entries go at the top.

## 2026-10-05: Worn tracks worn by feet, and playtest round 2

**The asks (owner):**
- "Why do the paths shift and change when I place a new object?"
- "Worn tracks shouldn't instantly move around when I place something, they should be worn down by character activity."
- Also: a broken talk line ("You wa kind when I needed it"), an odd one ("I cannot quite let go of you"), the fishing jetty sitting on dry land, an offset green square while placing, houses lit while everyone sleeps, a cramped desktop bottom bar, the rolled-up journal over the top bar, and a "Getting to know" note about something the resident never said.

**Chosen:**
- **Worn tracks come from footsteps.** The simulation keeps a wear count per tile. It rises each time a resident steps there off a laid path, and fades a little every dawn. The view only draws it. The founding town starts with its everyday walks worn in, so day 1 doesn't look untrodden.
  - *Why in the sim and not the view:* a save is the command log replayed, so wear kept in the sim comes back exactly on load. The view never sees the ticks a load replays.
- **Route ties are left as they were.** Over open ground many routes cost the same, and which one wins depends on how the search unfolds, so a building elsewhere can switch someone's walk to another route of the same length. Two fixes were tried. Both held routes still, but both changed everyday walks enough to fail tuned earlier measures:
  - Breaking ties toward the straight line pushed the busiest place's share of socialising to 0.607 (band: under 0.6) and failed the bench-memory twin.
  - A fixed per-tile grain left no rivalry forming in the M3a relationships test.
  - *Why leave it:* trying tie-breaks until the old tests pass would be fitting the town to its tests. What the owner saw, tracks jumping, is fixed by footstep wear on its own: a switched walk only wears in gradually. The criterion stays as a visible expected failure.
- **Feelings about the steward said to the steward have their own lines,** written for "you", not run through the "the steward" → "you" rewrite. The rewrite also now turns "was" into "were" and keeps verbs like "misses" whole.
- **A jetty must be beside the brook,** and its boards run out over the water.
- **A house is lit only while someone inside is awake.** Once all are asleep, its windows and porch lantern go out. Street lamps and the teahouse's lanterns stay lit, so the town still reads at night.
- **A fact you learn in talk is said in the reply.** Each question still reveals one fact a day for the Folk album, but now the resident says it ("I can't abide noise, especially at night."), so the "Getting to know…" note matches what you heard.
  - *Rejected:* dropping the fact notes from talk. Learning about people by talking to them is the album's point.
- **On desktop the journal scroll hangs below the top bar,** rolled or not, so neither covers the other.

**Rejected:**
- *Recomputing the tracks from routes, only more stably.* The owner asked for tracks worn by activity, and a recomputed track still jumps the moment a building changes a route.
- *Wear kept only in the view.* It would vanish on reload and differ between a played and a loaded town.
- *Drawing the jetty over the water anywhere it is placed.* A jetty in a field is still a jetty in a field.

## 2026-10-05: Paths you lay down

**The ask (owner):** "Maybe make a way to add new paths."

**The owner's answers:**
- **What laid paths do:** residents use them. They prefer them and walk faster on them.
- **Worn tracks:** keep them, fainter. A worn track where people walk off your paths hints at where a new path is wanted.

**Chosen:**
- **A Path tile in the build tray, free.** Drag to lay a line of it, on a desktop or a phone. The Remove tool takes it up.
- **Residents route around things.** Walks used to be a straight L-shape through anything, buildings included. Now residents find the cheapest way round, and never cross another building's footprint.
  - **Cost per tile:** a path costs 1, open ground 2, the commons 2 (people cut across a green), and the brook 6. The brook is a shallow ford, so it is never a wall.
  - **Speed:** on a path they cover two tiles a minute instead of one.
  - **Fallback:** when no way round exists, they walk the old L-shape.
- **Worn tracks are drawn at about half strength.** Laid paths are drawn as crisp stone.

**Rejected:**
- *Paths that only look nice.* The owner chose paths that matter.
- *Speed bonuses without routing around buildings.* Residents would cut through houses to reach a path, which reads as a bug.
- *Charging timber for paths.* Laying out the town should be free to try; the cost is the space a path takes.

## 2026-10-04: M4, a fun game on phones and desktops — directions chosen

**The ask (owner):** "Make it a super fun mobile game with a good UI for mobile, but the desktop UI should be fun on desktop and use the extra space appropriately."

**The harsh gameplay review** (docs/reviews/2026-10-04-gameplay-review.md) scored the game 4/10. Its main findings:
- Player choices barely move how residents feel.
- Timber and food pile up, and favours are almost always yes.
- There are dead stretches with nothing to decide.
- Residents talk about the steward too much.
- Lines repeat.
- There is no save.
- There are no tiers or long arc.

**The owner's answers:**
- **Phone: portrait first.** One-handed play: a bottom tab bar, controls within thumb reach, and sheets that peek so the town stays visible. Landscape still works, with less polish.
- **The fun to push: goals and rewards, and collecting residents.**
- **Desktop: dashboard style.** Docked widgets (goals, people, board and log, the selection, stores) that the player can show or hide around the town.

**Chosen for M4:**
- **Today's goals.** Each morning brings three small goals, drawn from what the town needs right now (answer an ask, talk to someone you haven't, fill the granary by an amount, ask a favour, build what someone wants). Each completed goal earns renown, with a bonus for all three.
- **Renown and tiers.** The spec's tiers arrive: Clearing → Hamlet → Village → Townlet.
  - **Renown comes from** goals, granted asks and wishes, dreams seen through, the winter stores and newcomers.
  - **Each tier** raises the resident cap and unlocks a new building: beehives at Hamlet, a chicken coop at Village, a fountain at Townlet.
  - **Each tier-up** is celebrated.
  - **Buildings already in the game stay unlocked**, so earlier milestones keep their meaning.
- **The Folk album.** A card for every resident. You fill it in by talking: each question reveals facts (what they like and dislike, what they value, their quirks, their dream, their closest friend). Each new fact earns a little renown. Residents you haven't spoken to show as "not met yet".
- **The review's quick wins**, which are cheap and remove things a reviewer would screenshot:
  - grammar (a/an, singular building names, stacked tics);
  - separate opinion lines for people and for places;
  - the steward topic weighted by recent change rather than standing;
  - dream steps that advance when their building appears;
  - a digest of belief updates on the board;
  - speaker names on bubbles;
  - progress lines for the stores quest;
  - fewer repeated lines.
- **Economy tension:**
  - A favour's hours come out of the resident's own job output.
  - Flower beds and woodlots cost more.
  - The bakery and jetty make less in winter, so the stores matter.
- **Save.** The game already keeps a replayable command log and a seed. Both are saved in the browser and replayed on load. There is also a "New valley" button.
- **Layouts:**
  - **Phone (portrait):** a bottom tab bar with Town, Goals, Folk, Build and Log. Sheets have peek, half and full heights. Tapping a resident opens a small card with Talk, Favour and Profile.
  - **Desktop:** a dashboard of docked widgets in left and right columns. The town keeps the middle, and the build tray stays along the bottom.

**Deferred, and why:**
- *Making needs depend on the player's town* (review #1). This is the deepest fun problem, but it changes the mood model under every M1–M3 criterion. It needs its own chunk, with its own criteria and soaks.
- *More dilemmas* (review #4) and *seeded friction between residents* (review #12). These are content-heavy, and they are the natural next chunk after M4.
- *The charter and the Almanac.* Townlet tier is reached in M4. The ceremony comes later.
- *A random seed by default.* The six founders are authored, so a new seed changes less than the review implies. "New valley" picks a random seed, and the default stays seed 1 for now.

## 2026-10-04: Winter stores — Juniper's quest and the granary

**The ask (owner):** "Juniper is obsessed with storing up food for winter. That may be reasonable, but instead of a food number just climbing higher, we could make it a goal: store 150 food for the winter, and it goes in a special building for storing food. Like a quest."

**What the numbers showed first.** In the quiet town with the considerate steward, the larder reaches its cap of 80 by about day 7 and sits there. The town makes roughly 15 food a day and eats about 9, so 5–6 food a day was being thrown away at the cap. That is the "number just climbing higher", and it is also the missing food sink the owner asked for earlier.

**Chosen:**
- **A granary**, a new building (12 timber, 2×2). It holds up to 300 food, apart from the larder.
- **A yearly town quest, raised by Juniper:** "Winter stores: put by 150 food in the granary before the first day of winter." Juniper asks for a granary once the larder is overflowing or autumn arrives, whichever comes first. The target grows with the town: 25 food per resident, never below 150.
- **How food gets there.** Food that would spill over the larder's cap goes into the granary instead of being lost. In daylight, while the larder holds more than 24, surplus is carried across at 2 food an hour. The larder stops pinning at its cap, and the granary's count is the number that climbs, towards a target with a deadline.
- **What the stores do in winter.** Every winter dawn, the granary tops the larder back up to 24. A meal that finds the larder empty draws from the granary. Stores that are full on the first day of winter mean a winter without shortages.
- **The outcome is felt.** If the target is met on the first day of winter, the town is grateful to Juniper, and Juniper to the steward. If it falls short, Juniper says so, and the town eats what there is. The quest comes round again the next year.
- **Shown on the board.** A quest card shows "N of 150 put by", a progress bar and the days left until winter. The HUD shows the granary's count next to the larder once a granary stands.

**Changed mid-chunk, after the first measurements (before the criteria were checked):**
- **Each spring, what's left is shared out at a feast, and the granary starts again from empty.** Without this, nothing drained the granary: the town's winter production still outran what it ate, and year two began with more than 200 already put by, so the quest was met before it was posted. The granary would just have been a second climbing number, which is what the owner complained about. The feast lifts everyone's mood by an amount that grows with what is shared, so a good harvest still pays off.
- **Capacity is 300 per granary, not 300 in all.** With newcomers, the target (25 per resident) reached 450, more than one granary can hold, so the quest became impossible. The keeper now asks for another granary when the target outgrows the room. That gives a growing town something to build.

**Rejected:**
- *Adding the stores as more stages of Juniper's authored dream.* That would lengthen her first dream past winter, and it would move the M3a and M3b dream criteria without anyone deciding to. A quest beside the dream keeps those criteria as they were declared.
- *An automatic granary with no deadline.* Without "before winter" there is no goal, only a second number climbing.
- *Feasts, weddings and the trade cart as sinks.* They are planned for M3d (families and the food economy). The granary comes first because the owner asked for it by name.

## 2026-10-03: M3c, agency — playtest, and directions chosen

**The playtest (owner, after M3b part 1 went live):**
1. "There's a LOT going on in the logs / journals, so much that I'm not even following along."
2. "I have little agency or anything I can really do beyond use the initial Timber store to build some things. I can't make someone cut down wood to get more resources for me to build with. I can see this small space looking cluttered quickly if I keep building, and I feel like this is a really surface level interaction with the characters."
3. "The thought / chat bubbles overlap my scroll UI."

Points 1 and 3 were fixed at once:
- every line carries an importance;
- the log has Highlights, Story and Everything filters, and folds runs of lines about the same resident;
- the journal folds its detail sections;
- bubbles hide while they would overlap a panel.

**Chosen for point 2:**
- **Ask residents favours.** Favours are the main way the player acts on people. From the talk panel, you ask someone to cut timber, bring in a catch, work the garden, clear land, visit someone who needs company, or make up with someone.
  - Whether they agree depends on how they see you, how they are doing, and how much you have asked of them lately.
  - A refusal gives its real reason.
  - Work done fills the stores, and asking too much costs goodwill.
  - Resources come from people, not from a fixed pile.
- **Grow the valley.** The map is bigger than the settled land, and wild land around the town opens in plots as the town thrives. Clearing a plot is work, done as a favour, and it yields timber.
- **More residents.** Newcomers move in when there is a free home, food to spare, and a town that is doing well. Homes become buildable, and a pool of authored newcomers joins the original six.

**Not chosen this time:** assigning jobs directly (it treats people as units), and town projects.

**Changed mid-chunk (owner):** "just make it so i can build an empty house and a new person moves in. each new person should be unique with their own semi-random but coherent personality and sliders", then "things should be seeded also by the actions of the player". So the pool of six authored newcomers and the arrival gates (food, mood) were dropped.
- **Who comes:** newcomers are generated from a trade. Traits and values come from the trade's leanings plus noise, and voice, habits and background are read off the result.
- **What shapes them:** the steward's town draws matching trades, and the time and place of the new home seed the rest. Same seed and same actions give the same person.
- **Limit:** 18 residents for now, for performance and screen space.

**Order:** talking to a resident (from M3b) comes first, because favours live in it. Then favours, then the growing valley, then newcomers. M3b's moods and memories in talk follow after M3c. Their criteria stand as predeclared.

## 2026-10-03: M3b, deeper structured minds — directions chosen

The owner chose to deepen the structured minds next ("the minds chunk"), rather than start the brain-sim creature (spec 4.6.3), which stays a later rung.

**Chosen:**
- **Memories come back in talk.** Residents bring up shared past events, mark the anniversaries of town memories, and speak of people who have left.
- **Dreams that keep coming.** When a dream is done, a new one forms from what the resident has lived through: a friendship, a loss, a place they love. These are built from templates, not a single authored plan.
- **Moods with weather inside.** Longer states, such as a bad week, homesickness, a crush or restlessness, each with an onset reason, a build-up and an end. They show on the person and in the journal.
- **Talking to a resident.** The owner added this after the first answer: "Talking to a resident would be neat too." You click someone and ask a few fixed questions, and they answer honestly from their state. Asking is a steward action in the command log and can't be farmed.
- **Surfaces.** The town log and bubbles, as now, plus the talk panel.

**Not chosen this time:**
- Gossip about people, with reputations and taking sides.
- A chronicle page.

The criteria are predeclared in spec 9.3 before any M3b code.

## 2026-10-03: M3a, how "on their mind" works, and a missed bound left standing

**Chosen:**
- **One source of truth.** Everything a resident can think or say comes from one ranked list of what is on their mind (`src/sim/mind/thoughts.ts`). It is built only from their actual state: needs below their setpoint, current feelings and who they're about, their dream's next step, a festival tomorrow, the weather, a friend not seen in a day, a recent argument or a rival, their view of the steward, a belief formed in the last two days, and an empty larder.
- **Only the top three.** Passing thoughts, chats with content and the journal's "On their mind" all draw from the top three. A topic isn't repeated within six hours, and chat never discusses the listener in the third person.
- **Timing.** Thoughts surface at random moments, about one every three waking hours. They are drawn per minute rather than on the hour, so they don't all land at once. They use the resident's own random stream.
- **Narration only reads.** The narrator's line choice remains outside the simulation. The journal uses fixed labels, so looking at a resident never changes what they'll say next.

**Rejected:**
- **Changing Fen's and Marlow's plans so a do-nothing steward finishes fewer dreams.** That would have met the bound of at most 1.5, but a town where every dream hinges on the player feels like a to-do list. The miss is reported in spec 9.3, and the test is kept as an expected failure.
- **Thinking on the hour.** It was simpler, but every thought landed at :00 and read mechanically.

## 2026-10-03: M3a, alive minds — directions chosen

The owner chose these directions for the release gate (merged M2.5 first):

**1. Residents pursue their aspirations.** Each resident's aspiration becomes an authored plan of 3–5 stages. Each stage has conditions on the state of the sim, so the simulation decides when and whether it advances; the writing gives it quality.
- Ada plants her sister's orchard.
- Bram bakes for the whole valley at the Harvest Supper.
- Fen teaches someone to fish.
- Juniper builds a glasshouse for winter food.
- Wren paints the town's banner.
- Marlow decides whether to stay or leave with the trade cart. This is the one aspiration that can end in a departure caused by the story, not by neglect, and friendships and the steward can change it.

Some stages need the steward: a building, a decision, timber. So aspirations are also something the player can help along or neglect. The journal shows each resident's plan and their next step.

**2. Relationships you can see.**
- Friends invite each other along and walk together.
- At a gathering place, friends sit side by side and rivals keep apart.
- People face each other when they talk.
- Residents avoid places where their rivals are.

**3. Varied, contextual talk that honestly reflects their state** (the owner's own wording).
- Residents have a running "what's on my mind", chosen from their actual state: their most pressing need, their strongest current feeling and what it's about, their aspiration's next step, an upcoming event, the weather, a friend or a rival, or the steward.
- It appears as bubbles and in the journal, with the reason it's on their mind.
- Ordinary chats now carry that content, so what they say comes from what they feel, not from a stock line.
- Many more lines per voice.

- *Not chosen this time:* inner thoughts as a separate feature (folded into 3), and memories resurfacing in talk (partly covered by 3; a later chunk).

## 2026-10-03: Release gate — the minds must feel alive

The owner: "I definitely would prefer the minds to be more alive before we release."

**Decision:** "residents feel alive" is a gate for the first public release, and gets its own chunk after M2.5. The structured mind already remembers, forms opinions with reasons, gossips, holds grudges and reconciles. What's missing is the *felt* sense of an inner life.

Candidate directions for that chunk, to be put to the owner:
- residents who pursue their aspirations with visible plans;
- faster, visible decision-making early in the year;
- remembered moments that come back in conversation;
- inner thoughts the player can watch forming;
- relationships that show in behaviour, such as walking together and seeking each other out;
- a contained brain-sim experiment through the `Mind` interface.

## 2026-10-03: After the first playtest — M2.5, polish and agency

The owner playtested the deployed greybox. This chunk responds to that feedback, and the owner chose "both, wishes first" for agency.

**Camera: free yaw with the mouse.** The diorama tilt stays fixed. Holding the right or middle mouse button and dragging orbits the view around the town; left-drag still moves the view, and Q/E still snap by quarter turns.
- *Supersedes* the earlier "rotate in quarter turns" choice, which felt stuck in one view.

**You are the steward.** An introduction on first load explains that the player is the steward everyone talks about. In the browser, narration addresses the player in the second person ("You build a hedge"), while residents keep saying "the steward".

**Residents react when they see a change, not when it happens.** Sleepers notice new or missing buildings when they wake, people elsewhere notice when they pass by, and word of mouth reaches the rest within a day. Reactions name what changed for that person (quieter, greener, busier, the smell, somewhere to sit) instead of one generic line.

**Building UI:**
- R rotates a building while placing it, with real rotated footprints in the sim.
- A build menu, opened from one button, replaces the always-visible row of buttons. It is grouped by category and shows what each building gives off, what it costs, and who might care.
- The notice board and log panel rolls up and unrolls like a scroll.

**Agency: making the steward needed.** Wishes come first, in this order:
1. Residents ask the steward for specific things more often: somewhere to sit near home, more green, another place to gather, a place to work.
2. Seasonal Town Wishes gather those asks, with visible progress.
3. Changes in a resident's view of the steward are shown on screen, and a "How the town sees you" page explains them.
4. A thin economy: **food and timber** only. Gardens, the jetty and the bakery make food, and meals eat it. The woodlot makes timber, and buildings cost it.

- *Rejected:* agency without any economy, as too weightless.
- *Rejected:* the full economy now, as too big a chunk. Wares, coin, the trade cart's buying and selling, and tiers come later.

## 2026-10-03: After M1.5 — M2 greybox, scope, preview hosting, camera

These were decided by the owner after reviewing M1.5's results (spec 9.3, "M1.5 status").

**Next chunk: the M2 greybox in the browser.** It is built with Vite and Three.js on the existing sim core, in the low-poly lantern-light direction.
- *Rejected for now:* building the economy first (headless), and growing the cast and content depth first. Both remain on the list.

**Scope of the first browser build: watch and respond.** The player can:
- watch the town live, with time controls;
- click any resident to read their journal (needs, feelings, opinions and why);
- answer requests and approve or decline proposals on the notice board;
- place or remove a small set of buildings.

There is no economy, land clearing or tiers yet.
- *Rejected:* a watch-only viewer, as too small a step.
- *Rejected:* the full build loop, as too large a chunk.

**Preview hosting: GitHub Pages**, through a GitHub Actions workflow in this repository. townlet.app can point at it later.
- *Rejected for now:* Cloudflare Pages, and staying local-only.

**Camera: isometric**, with a fixed diorama tilt, rotation in quarter turns, pan and zoom. It keeps the town readable and suits the cozy diorama look.
- *Rejected:* free orbit, which is harder to keep readable.
- *Rejected:* top-down, which has less charm.

## 2026-10-03: After M1 — next chunk, friction, steward, art direction

These were decided by the owner after reviewing M1's results (spec 9.3, "M1 status").

**Next chunk: M1.5, storyteller and friction, still headless.** M1.5 adds the event director (spec 4.4): seasons, festivals, visitors, weather, small personal events, and dilemmas the steward decides. It also tunes friction, so the radio play reads well from day 1 and the town has some texture.
- *Rejected for now:* going straight to the M2 greybox, and doing a thin slice of both.
- *Why:* M1 showed days 1–3 are thin and story density depends on steward actions. Those are content and pacing problems that a renderer would hide, not fix.

**Friction: gentle.** The target is occasional squabbles and one or two simmering rivalries per year. A departure should happen only after real neglect, and it must always be recoverable.
- *Rejected:* moderate friction (factions, a likely departure every year), as too far from cozy.
- *Rejected:* leaving friction at the near-zero M1 level.

**Steward: disembodied.** The player is a cursor and camera, and talks to residents by clicking them. This is simpler and closer to a builder.
- *Rejected:* a walking avatar, which is more intimate but a lot more work.

**Art direction: low-poly lantern-light** (spec 6, option C), the cheapest 3D that still looks good in a browser, with time-of-day and seasonal lighting doing most of the atmosphere. It is the target for M2's greybox.

## 2026-10-03: Platform, AI approach, next milestone, team

These were decided by the project owner in answer to the first four open questions in the game design spec.

**Platform and stack: web-first TypeScript.** The game targets the browser at townlet.app first, using a TypeScript sim core, Three.js for presentation from M2 onwards, Vite for builds, and Tauri as the desktop wrapper later. The sim core has no DOM or engine dependencies and runs headless under Node.
- *Rejected:* Godot 4 desktop-first. It was the spec's original recommendation because it ships an editor and has a smoother desktop and console path, but the owner prioritised the web.
- *Rejected:* a throwaway Python prototype. It would have to be rewritten.
- *Consequence:* the M1 sim is written in the language it will ship in.

**Resident minds: a structured cognitive sim now, fuller brain-sim minds later.** The structured mind is option B in spec 4.6: needs as homeostats, utility choice, salience-gated memory, night consolidation, gossip, relationships. It ships first. brain-sim spiking-network minds are the long-term direction, both for a creature and eventually for residents, and they arrive through gated rungs (spec 4.6.3).
- *Consequence for the code:* every resident's cognition goes through a `Mind` interface, so a different mind can be swapped in one resident at a time.
- *Not decided:* whether the game makes a public "no generative AI" commitment, and whether a local LM voice layer is ever wanted.

**Next chunk: M1, the headless "radio play".** M1 is the sim core with 6 residents, a text event log, an inspector, twin tests and a soak runner, with no graphics. The reasoning is that if the town isn't interesting as text, graphics won't save it.
- *Rejected for now:* building the M2 greybox visuals first, and writing more design docs before any code.

**Team and timeline: solo plus Claude, no deadline, steady progress toward release.** There is no date, but development moves forward one chunk at a time towards a shippable release, not open-ended research. Each chunk ends with what was built, the honest findings, and a short round of questions to the owner before the next chunk starts. Scope stays lean. M1 uses 6 of the eventual 15 residents. Content numbers in the spec are targets, not commitments.
