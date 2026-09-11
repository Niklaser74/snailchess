// The service worker must only cache files that exist, under its own prefix
// (everything on snails.se shares one origin), and every shipped JS file must
// be in the list so the game works offline.
//   node test/sw.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const version = sw.match(/const VERSION = '([^']+)'/)[1];
assert.match(version, /^snailchess-v\d+$/, 'cache name must be prefixed snailchess-');
assert.ok(sw.includes("k.startsWith('snailchess-')"), 'activate must only delete own caches');

const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
const missing = assets.filter((a) => !fs.existsSync(path.join(root, a)));
assert.deepEqual(missing, [], 'cached assets that do not exist');

function jsFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(dir + '/' + e.name) : (e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
}
const notCached = jsFiles('js').filter((f) => !assets.includes(f));
assert.deepEqual(notCached, [], 'JS files missing from the service worker');
console.log(`ok   sw: ${version}, ${assets.length} assets exist and every JS file is cached`);
