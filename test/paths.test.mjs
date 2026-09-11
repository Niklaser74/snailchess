// Snäckschack lives at snails.se/snailchess/ (the hub owns the root), so every
// path in the shipped files must be relative. A root-relative one would work on
// a dev server and break in production. Run with the other Node tests: npm test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function jsFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(dir + '/' + e.name) : (e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
}
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'css/style.css', ...jsFiles('js')];
const patterns = [
  /(href|src)=["']\/(?!\/)/,                                          // href="/x"
  /url\(["']?\/(?!\/)/,                                                // css url(/x)
  /["'`]\/(js|css|icons|sw\.js|manifest\.webmanifest)\b/,             // '/js/x' in scripts
  /register\(["']\//,                                                  // serviceWorker.register('/sw.js')
  /"(start_url|scope|src|url)":\s*"\/(?!\/)/,                          // manifest entries
];
// the manifest id is the app's identity on the shared origin, deliberately absolute
const allow = [/"id": "\/snailchess\/"/];

const bad = [];
for (const f of files) {
  fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
    if (allow.some((a) => a.test(line))) return;
    if (patterns.some((p) => p.test(line))) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}
assert.deepEqual(bad, [], 'root-relative paths found');
console.log(`ok   paths: ${files.length} files use relative paths only`);
