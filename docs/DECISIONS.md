# Townlet decisions

These are decisions that change what gets built. Each entry says what was chosen, what was rejected, and why. Newest entries go at the top.

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
