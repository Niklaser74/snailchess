# js/game/

Copies from [Niklaser74/snailmageddon](https://github.com/Niklaser74/snailmageddon)
(`js/`): the deterministic simulation that plays the battle duels and the
renderers that draw the snails, without a build step or a runtime dependency
on the game's deployment.

- Source commit: `ec141be1ac1a6142b84f9707ae1c53aea3f95c55` (synced 2026-09-11)
- Files: game.js, terrain.js, themes.js, snails.js, cosmetics.js, audio.js, rng.js, dmath.js
- Import graph: game.js → terrain.js, themes.js, snails.js, audio.js, rng.js, dmath.js; snails.js → cosmetics.js; terrain.js → dmath.js, themes.js. Nothing here touches the network.

**Do not edit these files.** Change them in the game repo and run
`npm run sync:game` (env `GAME_DIR` points at the checkout, default
`../dev-snailmageddon`).
