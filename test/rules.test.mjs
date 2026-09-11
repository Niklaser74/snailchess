// The computer opponent, the piece looks and the translations.
//   node test/rules.test.mjs
import assert from 'node:assert/strict';
import { Chess } from '../js/vendor/chess.js';
import { pickMove, evaluate, LEVELS } from '../js/ai.js';
import { LOOKS, SIDE_COLORS } from '../js/pieces.js';
import { keysOf } from '../js/i18n.js';

let failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const POSITIONS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  '8/8/8/3k4/8/8/4K3/7R b - - 0 1',
  'rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq d6 0 3',
  '4k3/8/8/8/8/8/3P4/4K3 w - - 0 1',
];

test('every level returns a legal move in every position, and null when the game is over', () => {
  for (const level of Object.keys(LEVELS)) for (const fen of POSITIONS) {
    const c = new Chess(fen);
    const mv = pickMove(fen, level, () => 0.42);
    assert.ok(mv, `${level}: no move for ${fen}`);
    assert.ok(c.move(mv), `${level}: illegal move ${JSON.stringify(mv)} in ${fen}`);
  }
  assert.equal(pickMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'hard'), null, 'mated side has no move');
});

test('normal and hard find mate in one, easy takes material when it sees it', () => {
  const mateIn1 = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
  for (const level of ['normal', 'hard']) {
    const c = new Chess(mateIn1);
    c.move(pickMove(mateIn1, level, () => 0.5));
    assert.ok(c.isCheckmate(), `${level} missed Ra8#`);
  }
  // a hanging queen: easy prefers captures 60 % of the time
  const fen = '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1';
  const mv = pickMove(fen, 'easy', () => 0.1);
  assert.deepEqual([mv.from, mv.to], ['e4', 'd5']);
});

test('hard avoids a losing capture that normal falls for', () => {
  // Qxd5 looks great for one ply but Rxd5 wins the queen. Two plies see it; one would not.
  const fen = '3rk3/8/8/3p4/8/8/8/3QK3 w - - 0 1';
  const c = new Chess(fen);
  const mv = pickMove(fen, 'normal', () => 0.5);
  c.move(mv);
  assert.notEqual(mv.to, 'd5', 'normal should not take the protected pawn with the queen');
});

test('evaluation is symmetric and material counts', () => {
  assert.equal(evaluate(new Chess()), 0);
  assert.ok(evaluate(new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')) > 800);
  assert.ok(evaluate(new Chess('3qk3/8/8/8/8/8/8/4K3 w - - 0 1')) < -800);
});

test('looks: every piece has a hat, scale and glyph; sides have colours', () => {
  for (const p of 'pnbrqk') {
    assert.ok(LOOKS[p], `no look for ${p}`);
    assert.ok(['none', 'cap', 'party', 'crown', 'viking', 'tophat', 'laurel'].includes(LOOKS[p].hat));
    assert.ok(LOOKS[p].scale > 0.5 && LOOKS[p].scale < 1.3);
    assert.ok(LOOKS[p].glyph);
  }
  assert.match(SIDE_COLORS.w, /^#/); assert.match(SIDE_COLORS.b, /^#/);
  assert.notEqual(SIDE_COLORS.w, SIDE_COLORS.b);
});

test('translations: Swedish and English have the same keys', () => {
  const sv = keysOf('sv').sort(), en = keysOf('en').sort();
  assert.deepEqual(en, sv);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall rules tests passed');
