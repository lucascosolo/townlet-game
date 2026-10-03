# Townlet

A cozy management sim where every resident remembers. The design is in [docs/GAME_DESIGN_SPEC.md](docs/GAME_DESIGN_SPEC.md), and decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

This repository currently holds **M1 and M1.5 of the headless "radio play"**. M1 is the TypeScript simulation core, with six residents, a text narrator, an inspector, a soak runner and twin tests. M1.5 adds the storyteller and gentle friction:
- seasonal festivals, visitors and weather;
- colds, birthdays and favours;
- quarrels that brew and boil over;
- proposals the steward approves or declines.

There are no graphics yet. The point is to check whether the town is interesting as text before building anything visual.

## Running it

Node 22.12 or later.

```sh
npm install
npm run radio -- --scenario bakery --seed 1 --days 12    # the radio play
npm run radio -- --scenario quiet --steward neglectful --days 28   # the same town, badly looked after
npm run inspect -- --scenario bakery --days 10 --resident ada   # one mind, with its "Why?" chains
npm run soak -- --seeds 10 --days 28                     # many towns, checked for degenerate states
npm test                                                  # determinism, memory, twin and invariant tests
npm run typecheck
```

Sample output is in `docs/samples/`.

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
| `test/` | Vitest suites |

## How it fits together

One tick is one in-game minute. The sim moves bodies, drifts needs and works out the ambient qualities at each tile. Everything cognitive goes through the `Mind` interface: perceiving, deciding, choosing an exchange, reacting on arrival, and consolidating overnight. `StructuredMind` is the only implementation today, and the interface is where a brain-sim-backed mind would plug in later (see DECISIONS.md).

Experiences are appraised and gated by salience into a daily buffer. During sleep, the buffer is added to traces, which persist for a few nights. Traces that pass a threshold become beliefs, keeping their provenance, and beliefs that aren't reinforced decay. Beliefs drive opinions, which in turn drive choices, gossip, relationships, requests to the steward, and whether a resident starts thinking about leaving.

All state is plain JSON-safe data. `Simulation.clone()` and save/load are just `structuredClone` and `JSON`. Every resident has their own RNG stream, so a twin test can change one resident's experience without reshuffling everyone else's choices.
