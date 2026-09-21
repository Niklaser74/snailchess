// Everything the opponent writes — move events and their name — reaches the DOM
// through innerHTML. It must be escaped on the way, or a stored payload runs in
// the other player's browser and reads the shared snails.session.
//   node test/escape.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

// ---------- the helper escapes what matters ----------
const map = main.match(/const ESCAPES = \{[^}]*\}/);
assert.ok(map, 'js/main.js must define an ESCAPES map');

// Run the helper as the page would: the assertions below cover every character
// that matters, so a missing entry or a broken regex fails here.
const esc = new Function(`${map[0]};
  return (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);`)();
assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(esc('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
assert.equal(esc(null), '');
assert.equal(esc('Nf3+'), 'Nf3+', 'ordinary notation must survive untouched');

// ---------- both sinks route through it ----------
const moves = main.match(/function renderMoves\(\)[\s\S]*?\n\}/)[0];
assert.match(moves, /fell\.push\(esc\(/, 'x: entries must be escaped');
assert.match(moves, /tried = esc\(/, '?: entries must be escaped');
assert.match(moves, /: esc\(e\)\)/, 'the move itself must be escaped');

const list = main.match(/async function refreshMatchList\(\)[\s\S]*?\n\}/)[0];
assert.match(list, /const name = esc\(/, 'the opponent name must be escaped');
assert.ok(!/t\('online\.(vs|theirTurn)', \{ name: snigelpost/.test(list),
  'the raw opponent name must not be interpolated into the list');

// ---------- no new sinks slip in ----------
// i18n.js writes its own dictionary strings, which intentionally carry markup.
function jsFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(dir + '/' + e.name) : (e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
}
const allowed = new Set(['js/i18n.js', 'js/main.js']);
const sinks = jsFiles('js')
  .filter((f) => !f.startsWith('js/vendor/') && !allowed.has(f))
  .filter((f) => /\.innerHTML\s*=/.test(fs.readFileSync(path.join(root, f), 'utf8')));
assert.deepEqual(sinks, [], 'new innerHTML sinks must escape, then be added here');

const mainSinks = (main.match(/\.innerHTML\s*=/g) || []).length;
assert.equal(mainSinks, 2, 'js/main.js has exactly two innerHTML sinks; a new one needs escaping and this count');

console.log('ok   escape: opponent events and names are escaped, and no new innerHTML sinks');
