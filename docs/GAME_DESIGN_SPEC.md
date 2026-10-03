# Townlet — High-Level Game Design Specification

Version 0.2, 2026-10-03. Status: draft. The first four open questions (platform, AI approach, next milestone, team) were answered on 2026-10-03 and are recorded in [DECISIONS.md](DECISIONS.md); sections 4.6, 8.2 and 11 reflect them. Everything else is still open.

Working title: **Townlet** (townlet.app). Genre: cozy-to-light management simulation. Target for the first release: a vertical slice playable in the browser at townlet.app, wrapped for desktop (Windows, Steam Deck) later.

---

## 1. Elevator pitch and vision

**Pitch.** *Townlet is a cozy management sim about tending one small settlement, where each of the fifteen people who live there remembers what you did.* You place homes, workshops, paths and gardens, keep a light economy ticking over, and steer the place through four seasons from a clearing with a few tents to a chartered little town. The residents aren't scripted villagers or chatbots. Each one has a personality, needs, routines, relationships and memories, and forms opinions about you, about each other, and about the town you are building. Every placement decision lands on people you have come to know.

**Vision.** Most city builders get bigger to get deeper. Townlet goes the other way: it stays small enough that you know everyone, and puts the depth into how people react. The town's layout decides who meets whom on their way to work, the bakery's smell drifts into a neighbour's mornings, and the old oak you cut down was where two residents had their first conversation. Management is still what the player does with their hands. The simulated residents are why those choices feel like they matter.

### Design pillars

These are the tests every feature has to pass. A proposed feature that doesn't serve at least one of them, or that undermines any of them, gets cut.

1. **Small enough to know everyone.** The cap is roughly 15 residents in the slice and perhaps 25 in expansions. Every resident gets a name, a face and a story the player can follow. If a feature only works at large population counts, it doesn't belong in Townlet.
2. **Decisions land on people.** Every build, policy or event choice should produce a visible reaction from at least one specific resident, and it should be one that resident will remember.
3. **Legible minds.** The player can always find out *why* someone feels the way they do. Depth that can't be seen doesn't count as depth, and an inspectable mind is a feature to be shown off.
4. **Gentle pressure, never punishment.** The game has stakes and tradeoffs, but no deaths, starvation or game-over. Things go wrong slowly, with warnings and time to recover.
5. **The town tells its own story.** The game keeps a record of what happened, through residents' memories and a town chronicle, so that a year in the town ends up as a story the player can retell.

---

## 2. Player fantasy and emotional goals

**Fantasy: the steward, not the mayor or the god.** The player looks after the place. They hold its resources and can build, but they can't order people around. They can ask, offer, suggest and decide civic questions, and residents respond according to who they are and how much they trust the steward. The closest analogy is a gardener who knows every plant by name, and the furthest is a city planner looking at zoning maps.

The game is aiming for these emotions, roughly in this order of importance:

| Emotion | What produces it |
|---|---|
| **Recognition** ("she remembered!") | Residents referring back to past events, to the player's promises and to each other, unprompted and correctly. |
| **Belonging and attachment** | A small cast followed over a year, with personal arcs, and places in the town that come to carry meaning. |
| **Quiet competence** | A light economy that the player can read at a glance and keep balanced without spreadsheets. |
| **Delight at small emergent moments** | Two residents who end up sharing a bench every evening because of where the player put the lamp. |
| **Gentle responsibility** | Dilemmas where residents want different things and the player has to choose with care. |
| **Pride of place** | A town that looks and feels like the player's own, with its own identity, a name, and a chronicle to share. |

**Anti-goals.** The game must avoid guilt-tripping (sad residents should read as solvable, not as an accusation), spreadsheet optimisation as the dominant way to play, fail states and restarts, the uncanny feeling of talking to a chatbot, and a "content treadmill" in which residents just generate quests.

---

## 3. Core gameplay loop

The game runs on four nested loops. In time terms, one in-game day lasts about 6 minutes at 1× speed, a season is 7 days, and the vertical-slice year is 4 seasons, or 28 days. That comes to about 2.8 hours of sim time. With pauses, planning and 2×/3× speed, that lands in the 2–4 hour target.

```
 ┌─────────────────────────── YEAR (2–4 h): Clearing → Hamlet → Village → Townlet charter ───────────────────────────┐
 │  ┌──────────────────── SEASON (~40 min): wishes, festival, new blueprints, arrivals/departures ────────────────┐  │
 │  │  ┌──────────── DAY (~6 min): dawn notices → work & build → evening gathering → night consolidation ──────┐  │  │
 │  │  │  ┌── MOMENT (seconds): observe → place/adjust → read a thought → respond to a resident ──┐           │  │  │
 │  │  │  └────────────────────────────────────────────────────────────────────────────────────────┘           │  │  │
 │  │  └────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
 │  └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Moment (seconds).** The player watches the town, places or moves buildings and decor, clicks a resident to see their current thought and mood, and answers requests ("Could we have a bench by the brook?"). Hovering over any feeling shows its cause.

**Day (about 6 minutes).**
- *Dawn* opens with the **notice board**, which summarises what changed overnight. It includes opinions that firmed up during residents' sleep ("Ada has decided she likes the new well"), new requests, and any event on the horizon.
- *Day* is when work happens. Workplaces produce, residents run their routines and bump into each other, and the player builds and handles small events.
- At *evening* the residents gather at the commons, the tavern or wherever the layout puts them. This is the most social stretch of the day, when relationships visibly shift and gossip spreads.
- During the *night* the residents sleep and their memories **consolidate**: the day's notable experiences turn into lasting beliefs and opinions, and minor ones fade (section 4.2). The player can plan in a calm, paused "lamplight" mode.

**Season (about 40 minutes).** Each season brings two or three **Town Wishes**, which are collective goals that come out of residents' aggregated needs and opinions ("We'd love somewhere to dance"). It also brings one festival that the player plans, new blueprints, and usually one newcomer arriving, or occasionally a resident thinking about leaving. The seasons change production, needs and atmosphere.

**Year (2–4 hours).** The town grows through four tiers, from Clearing to Hamlet to Village to Townlet. The year ends with the charter ceremony, where the town's name, banner and motto become official and the Almanac (the year's chronicle) is presented. After the charter the town carries on as an open-ended sandbox.

### A worked example: one day's interlocking systems

The player builds a bakery two tiles from Ada's cottage. The bakery gives off a *Smell: bread* ambient quality, and Ada values Comfort and has a "homebody" trait, so her home satisfaction rises. Bram, the baker, starts work at 4 a.m., and the bakery also gives off *Noise* before dawn. Ada is a light sleeper, so her Rest need drops. During the night, consolidation weighs the two experiences against each other. The noise came up three times, so it wins, and Ada forms the belief *"the bakery ruins my sleep"*, which attaches to both Bram and the player's decision. The next evening she grumbles about it to Fen, who trusts her, and Fen's opinion of the bakery drops a little even though Fen has never heard the noise. On the notice board the next morning, Ada asks the player to "plant a hedge or something." The player can plant a hedge, which damps the noise, move the bakery, or ask Bram to start later, which depends on Bram's trust in the player and his own aspiration to "bake for the whole valley." Whichever choice the player makes, Ada will remember it, and so will Bram.

None of this is scripted. It comes out of ambient qualities, needs, appraisal, consolidation and gossip. The only authored pieces are the voice lines and the shape of the request.

---

## 4. Key systems

### 4.1 Building and layout

**Grid.** The town sits on a square tile grid. Buildings occupy 1×1, 2×1 or 2×2 tiles, while decorations can be placed off-grid and rotated freely. Paths, fences, walls and hedges auto-join, and roofs and walls are chosen from a modular kit based on the neighbouring tiles. This gives some of Townscaper's softness while keeping adjacency easy to compute. (Grid shape is open question Q7.)

**Building set for the vertical slice** (about 18 buildings and about 20 decor pieces):

| Category | Buildings |
|---|---|
| Homes | Tent (starting), Cottage, Terrace pair, Loft-over-shop (attaches to a workplace) |
| Work | Garden plots, Orchard, Woodlot/Carpentry, Quarry cart, Bakery, Workshop (wares), Fishing jetty, Market stall |
| Social/civic | Well, Notice board, Commons (green), Teahouse/Tavern, Bridge, Bathhouse or Library nook (identity-dependent) |
| Decor/utility | Benches, lamps, flower beds, hedges, fences, banners, planters, signposts, bird feeders, etc. |

**Ambient qualities: the main lever in layout.** Every building and decor piece gives off qualities that spread a short distance over nearby tiles. In the slice these are **Noise, Bustle, Green, Light, Scent, Water and View**. Residents have preferences over these qualities, which come from their traits and values, so where they live, work and linger affects their needs and mood. An overlay ("the town's senses") shows the qualities as soft colour washes. This is the core of the game's design: **layout choices become personal experiences**, and the AI turns those experiences into opinions.

**Layout shapes the social graph.** Residents walk the path network. Where paths cross, where benches and lamps make lingering spots, and how homes cluster all decide **who bumps into whom and how often**. Familiarity grows from these encounters, and relationships grow from familiarity. Players learn to "garden" the social life of the town through its layout: a bench between two lonely residents' homes is a real social intervention.

**Homes are chosen, not assigned.** When a home becomes free, residents pick based on their preferences, their neighbours and their relationships. The player can *suggest* a home, and a resident accepts more often the more they trust the player. Newcomers need a free home before they will settle.

**Expansion.** Land is cleared at a small resource cost. The map is a single valley about 40×40 tiles, unlocked in rings as the town moves up a tier.

**Demolition carries memory.** Tearing down or moving a place that residents have memories attached to ("where we met," "my first shop") causes a reaction. A **farewell** option lets the player keep a keepsake, such as a stone, a sign or a cutting, and place it elsewhere, which turns the loss into a moment.

### 4.2 AI residents and social simulation

This system is what sets Townlet apart, so this section is the longest. Section 4.6 covers which AI technology runs it.

#### 4.2.1 What a resident is

| Layer | Contents | Changes over |
|---|---|---|
| **Identity** | Name, age band, background hook, appearance, voice profile | Never (authored) |
| **Personality** | 5 bipolar traits: *Sociable–Reserved, Steady–Excitable, Curious–Traditional, Generous–Thrifty, Tidy–Easygoing*; plus 1–2 quirks (e.g. light sleeper, early riser, loves rain) | Never (authored) |
| **Values** | Weights over what they care about in a town: *Beauty, Quiet, Community, Craft, Nature, Prosperity* | Slowly, through major arcs |
| **Needs** | *Rest, Food, Comfort, Company, Purpose, Delight* (plus seasonal *Warmth*), each with a personal setpoint | Hours |
| **Mood** | Current emotional state from recent appraisals | Hours |
| **Disposition** | Baseline outlook towards the town and the player | Weeks |
| **Memories** | Episodic memories and consolidated beliefs (4.2.3) | Days to seasons |
| **Relationships** | Directed edges to every other resident and to the steward (4.2.5) | Days to seasons |
| **Routine** | Daily schedule template (work hours, meals, haunts) | Rarely |
| **Aspirations** | 1–2 personal goals with an authored arc (4.2.8) | Over the year |

**Needs are homeostats.** Each need has a setpoint that differs from person to person, and behaviour aims to keep the need near that setpoint. For example, a Reserved resident's Company setpoint is low, so a busy tavern *overshoots* it. Mood comes from the gap between needs and their setpoints, not from need levels alone. Two residents placed in the same spot can therefore react in opposite ways, which is the point.

#### 4.2.2 Choosing what to do

Behaviour selection is **utility AI layered over a routine skeleton**. The routine fixes the default activity for each block of the day. At each decision point the resident scores the available actions (work here, go to the commons, visit a friend, rest at home, wander to the brook, and so on) against needs, personality, relationships, current mood and the ambient qualities of each destination, then picks with some weighted randomness from a seeded RNG. The whole simulation is deterministic given the seed and the player's inputs.

#### 4.2.3 Memory: salience, consolidation, forgetting

Memory is what turns a simulated person into a *character*.

- **Episodes.** Every notable sim event (a conversation, a gift, a building going up, noise at night, a festival moment) is a candidate episode, recorded as *what, who, where, when, valence, intensity* and the resident's appraisal of it.
- **Salience gate.** An episode only goes into memory if its appraised intensity clears the resident's threshold. Routine events don't, while surprises, emotionally charged events and things that touch a resident's values do. This stops memory turning into a log.
- **Short-term buffer by day, consolidation by night.** Episodes from the day sit in a buffer. During sleep, a consolidation pass merges them with what the resident already knows. Repeated or intense episodes strengthen into **beliefs** ("The bakery ruins my sleep," "The steward keeps promises," "Fen is good company on rainy days"). Contradicting episodes weaken those beliefs, and episodes that are never rehearsed fade.
- **Two timescales.** Mood reacts within hours, while beliefs and disposition move over days and weeks. A single bad day doesn't sour someone, but a bad season does.
- **Use it or lose it.** Beliefs and relationship strength decay unless reinforced, so memory stays bounded at roughly 40 episodes and 20 beliefs per resident and the town keeps changing.
- **Cue-driven recall.** Places, people, seasons and objects act as retrieval cues. Walking past the spot where the oak stood can bring a memory back, which then shows up as a thought bubble, a line of dialogue, or a change in behaviour. This is what makes "she remembered!" moments happen without anything being scripted.
- **Collective memory.** Festivals and major events also write to a **town memory** that every resident who was present shares. This feeds the chronicle and gives the town in-jokes and traditions.

#### 4.2.4 Appraisal and emotion

Events are appraised against each resident's values, goals and relationships. The model is a simplified version of the classic appraisal-theory structure (OCC). It produces a small set of emotions: *joy, contentment, pride, gratitude, admiration, worry, annoyance, loneliness, envy, grief*. Each emotion has an intensity, a decay rate, and a target (an event, a person or the steward). Emotions drive mood, bias action choice, colour dialogue, and set salience.

#### 4.2.5 Relationships

Relationships are directed (A→B can differ from B→A). Each edge has three dimensions: **Affinity** (liking), **Familiarity** (how well they know each other) and **Trust** (how reliable they think the other is). Each edge can also carry **tags**: friend, close friend, sweetheart, rival, mentor/apprentice, family. Familiarity grows through encounters, which is why layout matters. Affinity and Trust move through interactions and witnessed or heard-about behaviour.

The **steward is a node in the graph too**. Each resident holds Affinity and Trust towards the player, which go up when the player answers requests, keeps promises and makes choices that line up with that resident's values, and go down when the player does the opposite. Trust towards the steward is the main "currency" of influence: it decides whether suggestions such as "would you take the workshop job?" get accepted.

#### 4.2.6 Social interactions

The slice ships about 25 **social exchanges**, which are small authored interaction patterns whose outcome comes from traits, relationship state, mood and context. Examples are chat, share news, gossip, complain, comfort, compliment, give a gift, ask for help, help with work, share a meal, argue, apologise, tease, flirt, reminisce, introduce a newcomer, and plan together. The approach follows the social-practice research tradition (Prom Week's *Comme il Faut*, Versu), scaled down to a cozy register. Exchanges are visible in the world as two characters facing each other with emotes and short speech bubbles, and they get logged.

#### 4.2.7 Opinions, gossip and knowledge

Residents **don't know everything**. They know what they witnessed and what they were told. Knowledge spreads through gossip, and how much a resident believes it depends on how much they trust whoever told them. This gives the game three things.

- **"Word got around."** A choice the player made out of sight still reaches people, slightly distorted on the way.
- **Opinions with provenance.** A resident's opinion on a topic (a building, a policy, another resident, the steward) is derived from their beliefs and values, and the inspector can trace it back to its sources.
- **Town sentiment.** Opinions are aggregated per topic and shown at **Town Meetings**, which are occasional consultations where residents speak for or against a proposal before the player decides.

#### 4.2.8 Aspirations and personal arcs

Each resident has one main **aspiration** (open a shop, learn a craft, find a sweetheart, make up with a sibling, see the valley from the old tower, be trusted with the festival) and sometimes a minor one. An aspiration is an authored **storylet chain** of 3–5 beats. Each beat has *preconditions on sim state* rather than fixed timing. For example, a beat might fire when the resident has a close friend with the Craft value and a workshop exists. The authored beats provide the quality of a written story, and the simulation decides when, whether and with whom each beat happens. Completing an aspiration often unlocks something for the town, such as a blueprint, a festival tradition or a new identity trait.

#### 4.2.9 Expression: how residents speak

Dialogue is **generated from structured state**, not typed freely. A line comes from a storylet or exchange template, filled through a grammar with the resident's voice profile (vocabulary, sentence length, verbal tics) and with references to their actual memories ("Since the oak came down I don't walk that way much").

- **Thought bubbles** run up to about 12 words and appear constantly. They are the main way the player learns what residents are thinking.
- **Conversations with the steward** are choice-based (Ask about…, Thank, Request, Consult, Reassure) and lead to an authored response that reflects the resident's state.
- **The "Why?" inspector.** Clicking any mood, opinion or relationship shows the chain behind it, for example: *annoyed at the steward ← belief "the bakery ruins my sleep" ← 3 nights of noise + Fen agreeing*. Pillar 3 depends on this being a pleasant, diegetic UI (a journal page) and not a debug panel.

#### 4.2.10 Arrivals, departures, the cast

The town starts with **4 residents** and grows to **12–15**. Newcomers are drawn by town identity and Town Wishes being met, and each arrives with a short introduction scene. A resident who stays chronically unhappy enters a visible **"thinking of leaving"** state lasting about a week of in-game time, during which the player can help. If the resident does leave, they leave on decent terms and may write a letter later. Nobody dies in the base game, and aging is open question Q5.

The slice cast is **15 hand-designed residents**. Their identity, personality, aspiration and voice are authored, and everything else is simulated. Some examples of the intended texture:

| Resident | Traits / quirk | Values | Aspiration |
|---|---|---|---|
| **Ada**, retired schoolteacher | Reserved, Steady, Traditional; light sleeper | Quiet, Nature | Plant an orchard her late sister planned |
| **Bram**, baker | Sociable, Excitable, Generous; early riser | Craft, Community | Bake for the whole valley's festival |
| **Fen**, river fisher | Reserved, Easygoing; loves rain | Nature, Quiet | Build a proper jetty and teach someone to fish |
| **Juniper**, tinkering newcomer | Curious, Excitable, Thrifty | Craft, Prosperity | Build a glasshouse (unlocks it for the town) |
| **Marlow**, merchant's son | Sociable, Curious; restless | Prosperity, Community | Decide whether to stay or follow the trade cart |
| **Wren**, teenager | Excitable, Easygoing; sketches everything | Beauty | Paint the town's banner |

### 4.3 Economy and needs

The economy is **light by design**. It exists to make building choices cost something and to create gentle seasonal pressure, not to be optimised.

- **Resources (5):** **Food, Timber, Stone, Wares** (crafted goods) and **Coin**. Quantities stay small (tens, not thousands). There are no production chains longer than two steps (orchard → bakery → food).
- **Labour.** Residents take jobs that fit their aptitude and aspiration. The player posts "help wanted" on the notice board and residents apply, so the player can't force anyone into a job. Workplace output depends on the worker's skill and **mood**, which is the main way the social system feeds back into the economy.
- **Civic needs.** These are Water, Food security, Shelter, Gathering, Beauty, and Warmth in winter. Each one has a simple coverage measure shown on a gentle dashboard.
- **The trade cart.** Once a week, a visiting merchant buys surplus and sells seeds, rare decor and the odd blueprint. It acts as the economy's outlet and as a recurring visitor with personality.
- **Soft failure only.** A shortage leads to grumbling, slower work, a lower mood and then departure warnings, never to death or collapse. Winter firewood is the main seasonal pressure.
- **Contentment and Character as progression currencies.** Tiers unlock through population, average contentment and identity (4.5), not through Coin alone.

### 4.4 Events and seasons

**Seasons** affect production (no orchard yield in winter), needs (Warmth), activity options (swimming in summer, skating in winter), moods (some residents love rain), visuals and music.

**Event types (about 40 in the slice):**
- **Systemic:** these come out of sim state. Examples are a quarrel escalating, a budding romance, a birthday, a resident catching a cold, someone thinking of leaving, or an aspiration beat firing.
- **Environmental:** storms, a harvest glut, an early frost, the brook flooding, migrating birds, the first snow.
- **Visitors:** the trade cart, a travelling musician, a resident's relative, a would-be newcomer.
- **Festivals (one per season):** these are planned by the player, who chooses the location, layout and offerings. How each resident takes part reflects their relationships, and every festival produces collective memories.

**Dilemmas.** Many events are framed as choices where residents have competing stakes. For example, the old oak could be felled for winter timber, which Bram wants, or kept, because it holds Ada's memory of her sister. Every option has winners and losers, and they all remember.

**The storyteller.** An event director paces the year, in the spirit of RimWorld's storytellers but tuned for coziness. It follows a pacing curve with deliberate quiet stretches, favours events that involve residents with unresolved threads, never stacks negative events, and avoids repeating a beat on the same resident too soon.

### 4.5 Town identity and progression

**Tiers.**

| Tier | Population | Gate | Unlocks |
|---|---|---|---|
| Clearing | 3–4 | Start | Tents, well, garden plots, woodlot |
| Hamlet | 6 | Shelter + Food covered | Cottages, bakery, commons, notice board, trade cart |
| Village | 10 | + Contentment threshold, first identity trait | Workshop, teahouse, bridge, town meetings, second ring of land |
| Townlet | 12–15 | + Identity established, 3 Town Wishes met | Charter ceremony, signature building, Almanac |

**Identity.** The town's character comes out of what the player builds and what residents do. It is tracked on a few axes, for example *Orchard* (green, produce), *Market* (bustle, wares, coin) and *Hearth* (quiet, comfort, community). Identity attracts newcomers who fit it, unlocks a **signature building** for each identity, and colours festivals and the chronicle's voice. The player names the town, and residents vote on a motto at the Village tier.

**The Chronicle and the Almanac.** The game keeps a **chronicle** of notable events drawn from collective memory and aspiration beats, written in a storybook voice and illustrated with auto-captured snapshots. At the charter it becomes the **Almanac**, the year's story, which the player can export or share. This is pillar 5's payoff and the game's main shareable artefact.

### 4.6 The resident mind: technology options and recommendation

This section answers the brief's question about options for the residents other than standard game AI or modern LLMs, and it covers the **brain-sim** research project as one of those options.

#### 4.6.1 Options compared

| Option | What it is | Strengths | Weaknesses | Fit for slice |
|---|---|---|---|---|
| **A. Classic game AI** | Needs, schedules, utility AI, behaviour trees (The Sims lineage) | Cheap, deterministic, proven | Residents feel shallow over time; no memory or opinions to speak of | Too thin alone |
| **B. Structured cognitive simulation** | A on top, plus appraisal, salience-gated episodic memory, night consolidation into beliefs, gossip, relationship graph, storylets and grammar-generated dialogue | Deterministic, inspectable, cheap (15 agents is trivial), runs offline on any hardware, authorial control over tone, save-friendly, testable | Content cost of storylets and grammar; risk of residents sounding samey if voice work is thin | **Recommended core** |
| **C. LLM-driven agents** | Generative Agents / Smallville style: an LLM plans, reflects and speaks | Freeform conversation, surprising language | Per-player inference cost or a heavy local model; latency; state drift and inconsistency; hard to save and test; content-safety burden; weak link between talk and mechanics; a share of players are hostile to generative AI in games | Not for core |
| **D. B + small local LM as a "voice" layer** | B decides everything, and an on-device small model only paraphrases B's structured lines for variety | More varied phrasing with state still authoritative | Model size on disk (~0.5–1 GB+), GPU/CPU cost, localisation, review burden; inZOI's on-device Smart Zoi showed the performance and acceptance costs | Post-slice experiment, optional toggle |
| **E. Spiking-network minds (brain-sim)** | Each resident runs a biologically grounded spiking network that learns from a sensory stream | Genuinely novel; memories as measurable physical changes; fits "inspectable mind" | Not yet ready: see 4.6.3 | Research track, gated |

**Decision (2026-10-03): build B now, with fuller brain-sim minds as the long-term direction.** B is "brain-inspired, not brain-simulated". It is the only option that meets every pillar on modest hardware with no per-player running cost, and it is the option where the design (what residents remember and how they feel about it) is directly authorable and testable. Option D stays open as a later experiment that can't change game state. Option E is the long-term direction for the residents themselves, not only for a single creature. It is pursued as a research track with explicit gates (below). To keep that path open, the sim core reaches every resident's cognition through a `Mind` interface (perceive, decide, choose a social exchange, consolidate overnight). The structured mind is the first implementation, and a brain-sim-backed mind can replace it one resident at a time.

#### 4.6.2 What brain-sim lends to the design today

brain-sim is a spiking neural network simulator built as a research project with strict rules: no LLM at runtime, kill tests fixed before code, and every proxy labelled as a proxy. Several of its mechanisms carry over directly as **design principles** for option B, even though the network itself doesn't:

| brain-sim mechanism (SPEC.md section) | Townlet translation |
|---|---|
| Rate setpoints and homeostatic scaling (2.4) | Needs as homeostats with *personal* setpoints, so the same input overshoots one person and satisfies another (4.2.1) |
| Wake/sleep schedule, sleep-only consolidation, two-timescale weights (2.7) | Day buffer and night consolidation into beliefs; mood (fast) vs disposition (slow) (4.2.3) |
| Structural plasticity, use-it-or-lose-it pruning (2.5) | Beliefs and relationships decay unless reinforced, keeping memory bounded and the town changing |
| Strongly driven cells protected from depression, a "plateau override" (8.28) | Salience gate: only intense or value-relevant experiences write lasting memories |
| Hippocampal pattern completion from a partial cue (8.2, K1.1) | Cue-driven recall: a place or person brings back an associated memory |
| Trained vs never-trained **twin** baselines | **Twin tests** in Townlet's test suite: clone a resident, give only one of them an experience, and check that their behaviour diverges measurably and in the intended direction. This is the test that proves memory matters. |
| Predeclared kill tests; "proxies labelled, not claimed as biology" | Design validation by predeclared measurable criteria (section 9); the UI never claims residents literally feel, only shows what the model holds |

#### 4.6.3 brain-sim as a resident mind: current status and gate

brain-sim's current state, from its SPEC.md and the 2026-10-03 recovery notes:
- The repository is a **partial recovery** after a data loss. The recovered SPEC.md may be older than the last master, so the details below should be re-checked against the recovered master once it is found.
- **The plant** has about 2,600 leaky integrate-and-fire neurons in three regions (sense, cortex-like, hippocampus-like) and roughly 150k–600k synapses. It runs on single-threaded CPU NumPy with a 1 ms tick, and its UI speed target is **≥ 0.5× real time for one brain** on a desktop i5-12600KF (SPEC section 4).
- **Memory results so far.** The episode-recall kill test K1.1 is still **FAIL** under the official protocol: the latest recorded run (8.47) has assemblies of 40–61 cells against a limit of 20. The 8.46 line shows trained brains beating never-trained twins on half-cue recall on six brains, but in 8.48 the gain halved by about 10 s and held only towards about 37 s. A second pattern doesn't erase the first, but the dual-pattern test was rejected on one brain.
- There is no sequence memory (Stage 2) and no language. Language is planned for Stage 4 at the earliest.

On that basis, **brain-sim can't drive 15 residents in the slice.** Running 15 brains at 2,600 neurons in real time alongside a game on consumer hardware is outside its current performance envelope. Memories that fade in seconds can't support relationships that last a season. Without sequence memory or language there is no way for a resident to form plans or speak.

**There is a contained way to use it after the slice: one creature, not the residents.** One small non-speaking creature, such as the town cat, a hedgehog under the commons or a heron at the brook, could run a real brain-sim network. Its sense-nerve would carry a few town channels (who is nearby, time of day, food, noise), and its learned assemblies would bias a small set of behaviours (approach, avoid, follow, wait). A "look inside" view, which builds on brain-sim's existing viewer and its "make change visible" intent, would let curious players watch what it has learned, labelled honestly. This fits both projects. Townlet gets a unique, true hook ("one creature in this town has a working spiking brain"), and brain-sim gets a live sensory environment richer than four fixed patterns. The creature stays off the critical path: if it doesn't work, the game is unaffected.

**The path from one creature to the residents.** The creature is the first rung. A brain-sim mind could then sit *beside* the structured mind for one resident, supplying recall and association signals while the structured mind still handles speech and plans. Full replacement would come only after brain-sim's Stage 2 (sequences) and a way to read out symbols exist. Each rung has its own gate, and the game never waits on the next one.

**Proposed gate for the creature** (to be agreed with brain-sim's owner, in brain-sim's own kill-test style):
1. An episode-recall criterion owner-accepted for this use, met on all seeds. This doesn't require the official K1.1 size clause, but the trained-minus-twin margin must hold.
2. Persistence of a learned association across at least one in-game day, about 6 real minutes, with sleep in between.
3. Several associations coexisting without erasure on all brains.
4. One brain running at ≥ 1× real time on a mid-range laptop CPU alongside the game. This probably means porting the tick loop out of Python, either to compiled code linked in-process or as a sidecar process.

---

## 5. Differentiation

| Comparable | What they do well | Where Townlet differs |
|---|---|---|
| **Townscaper, Tiny Glade** | Beautiful, frictionless building toys | Townlet has people with stakes; the layout matters because of who lives in it |
| **Dorfromantik, Islanders** | Elegant placement scoring | Adjacency scoring becomes *personal* through ambient qualities and individual preferences |
| **Littlewood, Stardew Valley** | Lovable authored villagers, cozy loop | Townlet's villagers *react* to the player and to each other and remember; their arcs are authored beats triggered by simulation, not a fixed calendar |
| **Fabledom, other cozy city builders** | Charming management with light resident flavour | Far fewer residents, each far deeper; the social sim is half the game, not decoration |
| **RimWorld, Dwarf Fortress** | Deep emergent stories from simulated people | Same "stories from systems" idea at cozy intensity: no death, no fail state, small scale, legible minds |
| **The Sims, inZOI** | Individual-level life simulation | Townlet's unit is the *town*: placement and civic decisions are the verbs, and residents are the audience and the stakes; no high-end GPU or on-device LLM required |
| **LLM agent experiments** (Stanford's Generative Agents/Smallville, AI Town, Project Sid, *Heard of the Story?*) | Freeform, surprising agent behaviour and speech | Townlet is a game first: residents are consistent, saveable, testable and cheap; memories and opinions plug into mechanics; offline with no inference bill |

**Positioning line:** *"A cozy builder where every resident remembers."* How AI is mentioned in marketing is a real decision (Q3). "Residents with memories and opinions" lands with cozy players, while "AI agents" invites comparison with chatbots and puts off people who dislike generative AI. If the game ships option B with no generative models, **"no generative AI"** is a credible and currently valuable claim.

---

## 6. Art direction options

Four options for the slice's single biome, a **temperate riverside valley** (brook, meadow, orchard slope, woodlot edge), which shows all four seasons well:

| Option | Look | Pros | Cons |
|---|---|---|---|
| **A. Toy diorama** | Soft 3D, pastel palette, rounded auto-joining modular kit, tilt-shift depth of field (Townscaper/Tiny Glade lineage) | The strongest screenshots and trailer; building feels tactile | Procedural and modular mesh work is the most expensive tech-art; invites direct comparison with the best in the genre |
| **B. Storybook isometric 2D** | Hand-painted isometric sprites, watercolour textures, ink outlines; picture-book feel | Cheapest pipeline for a small team; very readable; fits the chronicle/Almanac aesthetic | No camera rotation; each building variant and season multiplies art cost; can look generic |
| **C. Low-poly lantern-light** | Flat-shaded low-poly 3D, strong time-of-day and seasonal lighting, warm lamplight at night | The cheapest 3D; lighting and weather do most of the atmospheric work; scales well to seasons | Less distinctive by default; needs a strong palette and lighting direction to stand out |
| **D. Felt and paper craft** | 3D models textured as felt, paper and wood, slightly stop-motion animation | Very distinctive and warm, so it stands out in a crowded store | Texture and shader R&D up front; animation style is fiddly |

**Recommendation: C for the slice, pushed towards A's softness** (rounded bevels, auto-joining roofs and fences), with D kept as a stretch identity if a technical artist joins. Whichever option is chosen, the following rules apply.
- **Residents are chunky and readable from far away.** Each of the 15 has a unique silhouette and colour accent, so the player recognises them at a glance. Because the cast is small, this is affordable.
- **Emotion is visible at a distance**, through posture, walk speed, emote icons and thought bubbles.
- **The UI is diegetic paper.** The notice board, the journal pages used for the "Why?" inspector, and the Almanac all share one stationery look.
- **Audio** is a soft acoustic score that changes with the season, ambient sound tied to the ambient qualities (you can *hear* Bustle), and residents speaking in gibberish voices (Animal Crossing-style murmur) rather than voice acting.

---

## 7. Monetization

**Premium, one-time purchase.** The model is the cozy-genre norm and fits the design.
- **Early Access or full release on Steam** at a price in line with comparable cozy builders at launch time (roughly the $15–25 band today, to be checked against the market at launch).
- A **free demo** for Steam Next Fest, plus a short **browser demo on townlet.app** if the engine choice allows it. Wishlists are the main pre-launch metric.
- **Paid expansions after launch:** new biomes (coast, highlands, fen) each with a new cast and aspirations; "neighbour" resident packs with authored arcs; perhaps a multi-townlet region mode. Free updates fund goodwill.
- **No free-to-play, energy timers, gacha or ads.** They work against pillar 4 and against attachment to residents.
- **No ongoing per-player cost** comes with the recommended AI option (B). That is a structural advantage: an LLM-core design would need a subscription or a large local model, and Townlet needs neither. If the optional voice layer (D) ever ships, it runs locally and is included in the price.
- **Later:** a soundtrack and artbook DLC, and console ports (the lightweight AI makes Switch-class hardware realistic).

---

## 8. Technical considerations and recommended stack

### 8.1 Architectural principles

1. **Simulation core separate from presentation.** The sim is plain code with no scene-graph dependencies. It runs headless for tests, balancing and soak runs, and the renderer only observes its state and events.
2. **Deterministic fixed tick.** The sim ticks at a fixed rate (e.g. 10 Hz sim time) using seeded RNG streams per system. Given the same seed and inputs, it produces the same town every time, which is essential for debugging emergent behaviour.
3. **Event-sourced.** Every meaningful thing that happens is an event record (`{tick, type, actors, place, data}`). The same stream feeds residents' perception (and so their memories), the chronicle, the debug log and replays.
4. **Data-driven content.** Residents, buildings, ambient qualities, exchanges, storylets and grammars live in data files (JSON or YAML) that can be edited and hot-reloaded without code changes, and they are designed so the game can be modded later.
5. **Versioned saves.** A save is a snapshot plus a schema version, with migrations from the start. Resident memories are compact records, so saves stay small.

### 8.2 Recommended starting stack

**Decision (2026-10-03): web-first TypeScript.** The sim core is plain TypeScript with no DOM or engine dependencies, so it runs headless under Node for tests, soak runs and the M1 "radio play", and the same code runs in the browser. The presentation layer (from M2) is Three.js, built with Vite, and Tauri wraps it for desktop. The Godot option is kept below for reference.

**Previously recommended: Godot 4 (4.7 is the current stable release, from June 2026) with GDScript.**
- It is free and open source with no royalties. It is strong for small 3D and 2D games, ships to Windows, Linux and Steam Deck, and exports to the web for the townlet.app demo.
- **GDScript rather than C#**, because C# web export in Godot is still experimental. At 15 agents performance isn't the constraint, and GDScript's iteration speed matters more. Performance-sensitive parts, if any appear, can move to a GDExtension later.
- The sim core is written as pure GDScript classes (no Node dependencies). A headless runner (`godot --headless`) drives tests and multi-year soak simulations.
- Dialogue and storylets use **an in-house lightweight storylet and grammar format in JSON** rather than a third-party narrative plugin. The needs are narrow (preconditions on sim state, weighted selection, templated lines with voice substitution), and this avoids plugin-maintenance and C#-only dependencies. Ink or Yarn Spinner can be reconsidered later if writers need more tooling.
- Testing uses GUT or gdUnit4 for unit tests, plus the headless soak harness.

**The chosen option,** web-first TypeScript, Three.js and Vite, wrapped with Tauri for desktop. It gives the best browser experience and the fastest web deploys, but no editor, so more custom tooling, and the desktop and console path is weaker. It also fits brain-sim's existing vanilla-JS UI if the creature's "look inside" viewer is ever reused directly.

### 8.3 Tooling that is part of the design, not an afterthought

The AI is the product, so these tools are first-class from the first milestone:
- A **resident inspector** showing needs against setpoints, mood, emotions, memories, beliefs with provenance, relationships and the current utility scores. The player-facing "Why?" journal is a skinned subset of it.
- A **relationship graph view** and **event log viewer** with filters.
- **Time controls** (pause, step, 1–10× speed, jump to dawn).
- A **headless soak runner** that simulates 10 to 100 town-years overnight across seeds and reports degenerate states: universal hostility, permanent isolation, a need stuck at an extreme, a relationship graph collapsing to one clique, or story density dropping.
- **Story metrics** for balancing: notable events per in-game day, recall events per hour, the spread of sentiment, and how often each exchange and storylet fires.

### 8.4 Performance and platform budget

- 15 residents re-evaluating utility a few times per in-game hour, 25 exchanges and nightly consolidation are trivial costs. The budget goes to rendering.
- The target is 60 fps on integrated laptop GPUs, with Steam Deck Verified as a goal.
- The saving from not running a local LLM is part of why console ports later look realistic.

### 8.5 Localisation

Grammar-generated dialogue is the hardest thing to localise, because of gender and plural agreement, word order and the voice profiles. The grammar format has to support per-language rules from the start, even though the slice ships in English only. This is listed again as a risk.

---

## 9. Scope: vertical slice vs later

### 9.1 Vertical slice (v0.x)

| Area | Slice content |
|---|---|
| Biome | 1, the temperate riverside valley |
| Buildings | ~18 buildings + ~20 decor |
| Residents | 15 authored (start with 4), 1 aspiration arc each (3–5 beats) |
| Social | ~25 exchanges, gossip, opinions, town meetings, "Why?" inspector |
| Memory | Salience gate, night consolidation, decay, cue recall, collective memory |
| Time | 1 year: 4 seasons × 7 days, 4 festivals |
| Events | ~40 events plus the storyteller |
| Economy | 5 resources, trade cart, civic coverage |
| Progression | 4 tiers, 3 identity axes with 1 signature building each, chronicle and Almanac |
| Platform | Windows + Steam Deck; English; optional web demo |

**Explicitly not in the slice:** aging, children and generations; the LLM voice layer; the brain-sim creature; multiple biomes; multiple towns; modding tools; localisation; console.

### 9.2 Later expansion candidates

- More biomes, each with a new cast, buildings and identity axes.
- A **region map** with 2–4 townlets that trade and whose residents visit and move between them. This keeps each town intimate while extending the long game.
- **Generations:** aging, children growing up and inheriting relationships, elders retiring.
- **Procedural newcomers** assembled from authored modules once the hand-authored cast has proven the format.
- **Resident cards:** export a resident (personality, memories of their old town) as a visitor to a friend's town.
- Modding of residents, storylets and buildings, with Steam Workshop.
- Photo mode; Almanac export as a printable book.
- The optional local LM voice layer (option D).
- The brain-sim creature, once its gate passes (4.6.3).
- Localisation and console ports.

### 9.3 Milestones

| Milestone | Goal | Proof of success (predeclared) |
|---|---|---|
| **M0: Paper and spreadsheet sim** (2–3 wk) | Ambient qualities, needs, a toy memory model on paper and in a spreadsheet | The bakery example from section 3 can be played through by hand |
| **M1: Headless "radio play"** (4–6 wk) | Sim core with 6 residents, a text-only event log and an inspector; no graphics | Read a 3-day text log cold: at least 3 moments are worth retelling, twin tests pass for memory and gossip, a 10-year soak shows no degenerate state |
| **M2: Greybox playable** (6–8 wk) | Grid, building, paths, residents walking, notice board, one season | A first-time player can explain *why* one resident is unhappy, using only in-game UI |
| **M3: Vertical slice** (3–4 mo) | Full slice content, art pass, audio | A playtest group finishes the year; most can name three residents and retell one story unprompted |

M1 is the most important de-risking step: **if the town isn't interesting as text, graphics won't save it.**

---

## 10. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Invisible depth** | The simulation is rich, but the player sees generic villagers; this is the single biggest risk for any AI-forward game | Pillar 3; thought bubbles, the "Why?" journal, notice-board summaries, chronicle; M2 legibility test |
| **Samey or flat emergent stories** | Systemic stories feel random or repetitive after an hour | Authored aspiration beats; storyteller pacing; strong per-resident voice; story-density metrics; twin tests |
| **Simulation degeneracy** | Runaway negativity, everyone becoming friends, a stable but boring equilibrium | Homeostatic setpoints, decay, damping on gossip; headless soak runs across seeds |
| **Management vs social imbalance** | One half of the game makes the other irrelevant (optimal layout ignores people, or people ignore layout) | Ambient qualities as the single bridge between the two; tune so the best layout is always a *people* question |
| **Dialogue content cost** | Grammar and storylet writing scales with residents × situations | Structured voice profiles, reusable exchange templates, writing tools; cap the slice at 15 residents |
| **Cozy violation** | Negative emotions read as guilt or punishment | Soft framing, recoverable states, no death; "thinking of leaving" always gives a window and a path to fix it |
| **"AI" expectation mismatch and backlash** | Players expect to chat freely, or reject anything labelled AI | Market as "residents who remember"; be explicit about what is and isn't generative (Q3) |
| **Localisation of generated text** | Grammar output breaks in other languages | Per-language grammar rules from day one; budget for it before the 1.0 decision |
| **Scope creep** | Generations, multi-town and LLM voice are all tempting | Section 9.1's "not in the slice" list is binding; new ideas go to 9.2 |
| **Coupling to research** | Waiting on brain-sim stalls the game | The creature is post-slice and off the critical path; its gate is explicit (4.6.3) |
| **Browser 3D performance** | Three.js on integrated GPUs and in the Tauri webview may be heavier than a native engine | Low-poly art direction (section 6), instancing, a performance budget from M2, measured on a low-end laptop |

---

## 11. Open design questions

These are ordered by how much each answer changes what gets built next.

1. ~~**Platform priority.**~~ Decided 2026-10-03: web-first TypeScript (see DECISIONS.md).
2. **AI ambition for 1.0.** Partly decided 2026-10-03: a structured sim now, with fuller brain-sim minds as the long-term direction. Still open: whether the brain-sim creature is a 1.0 goal or a post-launch experiment, and whether the local LM voice layer is ever wanted.
3. **"No generative AI" stance.** Should the game commit publicly to no generative models, which closes off option D, or keep that door open?
4. **Embodiment.** Is the steward an avatar walking the town, which is more intimate, allows conversations in place and suits gamepads, or a disembodied cursor and camera, which is simpler and closer to a builder?
5. **Life cycle.** Do residents age, have children or pass away in the base game, or is time "seasonal but timeless" (as in the slice)?
6. **Resident agency over layout.** Can residents ever act on the town themselves (plant a garden, rearrange decor, build a shed) or only react to it?
7. **Grid.** Square grid with auto-joining (recommended), hex, or Townscaper-style irregular grid?
8. **Conversation depth.** Should talking to residents remain choice-based, or is any freeform input (typed or keyword-based) wanted eventually?
9. ~~**Team and timeline.**~~ Decided 2026-10-03: solo plus Claude, no deadline. The slice keeps 15 residents as the target but proves the format with 6 first (M1).
10. **Art direction.** Which option from section 6, and is there budget for a technical artist?
11. **End of the slice.** After the charter, does the game end with the Almanac and a "new town" button, or carry on as an open-ended sandbox?
12. **The creature.** If brain-sim does reach its gate, which creature should it be, and what can players see when they look inside?
