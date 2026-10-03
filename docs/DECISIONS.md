# Townlet decisions

These are decisions that change what gets built. Each entry says what was chosen, what was rejected, and why. Newest entries go at the top.

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

**Team and timeline: solo plus Claude, no deadline.** Scope stays lean. M1 uses 6 of the eventual 15 residents. Content numbers in the spec are targets, not commitments.
