# Townlet

A cozy management sim where every resident remembers. The design is in [docs/GAME_DESIGN_SPEC.md](docs/GAME_DESIGN_SPEC.md), and decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

This repository currently holds **M1 and M1.5 of the headless "radio play"**. M1 is the TypeScript simulation core, with six residents, a text narrator, an inspector, a soak runner and twin tests. M1.5 adds the storyteller and gentle friction:
- seasonal festivals, visitors and weather;
- colds, birthdays and favours;
- quarrels that brew and boil over;
- proposals the steward approves or declines.

**M2** is the first browser build: a low-poly isometric greybox of the same sim. You can:
- watch the town with time controls;
- click anyone to read their journal and the "why" behind their opinions;
- answer proposals on the notice board;
- place or remove a handful of buildings.

**M2.5** made you part of the town: residents ask you for things, the town makes a wish each season, and a thin economy of food and timber pays for building.

**M3a** makes the minds more alive:
- each resident pursues a personal dream in steps, some of which need you;
- friends call on each other, walk together and sit side by side;
- passing thoughts and small talk come only from what is really on their mind.

The journal shows what someone is hoping for, their next step, and the top things on their mind with the reason for each.

**M3b and M3c (in progress)** give you ways to act through people:
- When one dream is done, a new one forms from what the resident has lived through.
- You can talk to anyone and ask them favours: cut timber, bring in a catch, work the garden, clear wild land, look in on someone, or make peace with someone. They say yes or no for real reasons.
- Wild woods ring the valley, and residents can clear them to make room.
- Build an empty cottage and someone new moves in. Each newcomer is generated with their own personality, which is shaped by the town you've built.

You are the steward.

## Running it

Node 22.12 or later.

```sh
npm install
npm run dev                                               # the browser greybox at http://localhost:5173
npm run build && npm run preview                          # the production build
npm run e2e                                               # browser tests (Playwright, headless Chromium)
npm run radio -- --scenario bakery --seed 1 --days 12    # the radio play
npm run radio -- --scenario quiet --steward neglectful --days 28   # the same town, badly looked after
npm run inspect -- --scenario bakery --days 10 --resident ada   # one mind, with its "Why?" chains
npm run soak -- --seeds 10 --days 28 [--newcomers]       # many towns, checked for degenerate states
npm test                                                  # determinism, memory, twin and invariant tests
npm run typecheck
```

In the browser, URL parameters choose the town: `?scenario=bakery&seed=2&steward=considerate&speed=1`. The default is the quiet town with no stand-in steward, so you answer everything yourself.

**Browser controls:**
- **Look:** drag to move the view, right-drag or middle-drag to turn it around the town, wheel or +/- to zoom. Q/E snap by quarter turns.
- **Time:** space pauses, 0–4 set the speed.
- **Building:** open **Build ▾** and pick a building; each card shows its timber cost, what it gives off, and who it's likely to please. Click a free spot to place it, R rotates, Esc returns to looking. The **Dreams** group holds the orchard, glasshouse and banner pole that residents' dreams ask for.
- **People:** click someone (or pick them in the Journal) to see their personality, mood and hopes. Talk with them, and ask a favour, from the panel there.
- **Land:** click a patch of wild woods to see whether it's open for clearing, and ask someone to help clear it.
- **The log:** Highlights, Story and Everything filters. Runs of lines about one person fold under "+N more".
- **Answering:** proposals pop up for a decision. The notice board, which rolls up like a scroll, shows the season's Town Wishes and what residents are asking of you. The **You** tab shows how each resident sees you, and why.

Sample output from the text tools is in `docs/samples/`.

**Scenarios:**
- `bakery`: the worked example from spec section 3. A bakery goes up beside Ada's cottage, the steward later plants a hedge, then the old oak comes down.
- `quiet`: the same town with no scripted building.
- `neglect`: noise next to a home, loved places removed one by one, and nobody answering.
- `caring`: neglect's twin, with the noise but a steward who listens.

**Stand-in stewards** answer requests and proposals in place of a player, and are chosen with `--steward`:
- `considerate`: plants hedges when asked, and approves what the town would welcome.
- `approve`, `decline`.
- `neglectful`: never answers.
- `random`: what the soak uses.
- `favours`: considerate, plus one favour a day and a cottage whenever no home is empty. M3c's tests use it.
- `none`.

## Layout

| Path | What it is |
|---|---|
| `src/sim/` | Sim core: plain-data state (`types.ts`), the tick loop and steward commands (`sim.ts`), needs as homeostats (`needs.ts`), ambient qualities and routes (`world.ts`), social exchanges (`social.ts`), seeded RNG, time |
| `src/sim/story/` | The storyteller: calendar, paced daily draw, weather, personal beats, gatherings, town memories (`director.ts`); proposals and how residents judge the steward's answers (`dilemmas.ts`) |
| `src/sim/mind/` | The `Mind` interface (`mind.ts`), the structured mind (`structured.ts`): utility choice, arrival appraisal and recall. Also memory (`memory.ts`: salience gate, overnight consolidation, decay) and relationships |
| `src/content/` | Authored data: buildings, the six residents, voice lines |
| `src/narrate/` | Event stream to radio-play text |
| `src/inspect/` | Resident inspector |
| `src/soak/` | Soak runs and degeneracy checks |
| `src/scenarios/` | Starting towns, scripted steward actions, and stand-in steward policies (`steward.ts`) |
| `web/` | The browser greybox: `game.ts` (clock, commands, replay log), `view/` (Three.js scene and meshes), `ui/` (notice board, log, journal, palette) |
| `test/` | Vitest suites (sim) |
| `e2e/` | Playwright suites (browser, M2 criteria) |
| `.github/workflows/` | CI (typecheck, unit and browser tests) and the GitHub Pages deploy from `main` |

## How it fits together

One tick is one in-game minute. The sim moves bodies, drifts needs and works out the ambient qualities at each tile. Everything cognitive goes through the `Mind` interface: perceiving, deciding, choosing an exchange, reacting on arrival, and consolidating overnight. `StructuredMind` is the only implementation today, and the interface is where a brain-sim-backed mind would plug in later (see DECISIONS.md).

Experiences are appraised and gated by salience into a daily buffer. During sleep, the buffer is added to traces, which persist for a few nights. Traces that pass a threshold become beliefs, keeping their provenance, and beliefs that aren't reinforced decay. Beliefs drive opinions, which in turn drive choices, gossip, relationships, requests to the steward, and whether a resident starts thinking about leaving.

All state is plain JSON-safe data. `Simulation.clone()` and save/load are just `structuredClone` and `JSON`. Every resident has their own RNG stream, so a twin test can change one resident's experience without reshuffling everyone else's choices.
