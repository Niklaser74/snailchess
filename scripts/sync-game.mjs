#!/usr/bin/env node
// Refreshes js/game/ from the Snäckmageddon repo: the simulation that plays
// the duels and the renderers that draw the snails on the board.
//   GAME_DIR=../dev-snailmageddon node scripts/sync-game.mjs
import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = resolve(root, process.env.GAME_DIR || '../dev-snailmageddon');
const FILES = ['game.js', 'terrain.js', 'themes.js', 'snails.js', 'cosmetics.js', 'audio.js', 'rng.js', 'dmath.js'];

if (!existsSync(join(game, 'js', 'game.js'))) {
  console.error(`No game checkout at ${game} (set GAME_DIR).`);
  process.exit(1);
}
for (const f of FILES) copyFileSync(join(game, 'js', f), join(root, 'js', 'game', f));
const hash = execSync('git rev-parse HEAD', { cwd: game }).toString().trim();
const date = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, 'js', 'game', 'README.md'), `# js/game/

Copies from [Niklaser74/snailmageddon](https://github.com/Niklaser74/snailmageddon)
(\`js/\`): the deterministic simulation that plays the battle duels and the
renderers that draw the snails, without a build step or a runtime dependency
on the game's deployment.

- Source commit: \`${hash}\` (synced ${date})
- Files: ${FILES.join(', ')}
- Import graph: game.js → terrain.js, themes.js, snails.js, audio.js, rng.js, dmath.js; snails.js → cosmetics.js; terrain.js → dmath.js, themes.js. Nothing here touches the network.

**Do not edit these files.** Change them in the game repo and run
\`npm run sync:game\` (env \`GAME_DIR\` points at the checkout, default
\`../dev-snailmageddon\`).
`);
console.log(`synced ${FILES.length} files from ${game} @ ${hash.slice(0, 7)}`);
