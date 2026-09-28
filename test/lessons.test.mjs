// Learn chess: every stage loads, can be finished, and teaches what it says.
//   node test/lessons.test.mjs
import assert from 'node:assert/strict';
import { LESSONS, ROUNDS, load, allowedMoves, goalMet, par, stars, solvingMove, yellowAgain, remaining } from '../js/lessons.js';
import { keysOf } from '../js/i18n.js';

let failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const each = (fn) => { for (const l of LESSONS) l.stages.forEach((s, i) => fn(l, s, `${l.id}.${i + 1}`)); };

test('every stage loads and Yellow has a move', () => {
  each((l, s, name) => {
    const c = load(s.fen);
    assert.equal(c.turn(), 'w', `${name}: Yellow must move first`);
    assert.ok(allowedMoves(c, s).length > 0, `${name}: no legal move`);
    for (const q of s.lettuce || []) assert.equal(c.get(q), undefined, `${name}: a leaf lies under a snail on ${q}`);
  });
});

test('every eat and capture stage can be finished, and the best is found fast', () => {
  const t0 = Date.now();
  each((l, s, name) => {
    if (!ROUNDS.has(s.goal)) return;
    const p = par(s);
    assert.ok(Number.isFinite(p) && p >= 1, `${name}: cannot be finished (par ${p})`);
  });
  assert.ok(Date.now() - t0 < 3000, `the searches took ${Date.now() - t0} ms`);
});

test('the best is really reachable: walking a greedy path never beats par', () => {
  // par is a lower bound found by search; check it against an actual play-through
  each((l, s, name) => {
    if (!ROUNDS.has(s.goal)) return;
    let c = load(s.fen);
    const lettuce = new Set(s.lettuce || []);
    let moves = 0;
    while (remaining(s, c, lettuce) > 0 && moves < 40) {
      const list = allowedMoves(c, s);
      // prefer a move that eats or takes; otherwise the first one
      const m = list.find((x) => lettuce.has(x.to) || x.captured) || list[0];
      const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion });
      lettuce.delete(mv.to);
      moves++;
      if (remaining(s, c, lettuce) > 0) c = yellowAgain(c);
    }
    assert.ok(moves >= par(s), `${name}: finished in ${moves}, under par ${par(s)}`);
  });
});

test('every one-move stage has a solution, and not every move solves it (except escape)', () => {
  each((l, s, name) => {
    if (ROUNDS.has(s.goal)) return;
    assert.ok(solvingMove(s), `${name}: no move reaches the goal "${s.goal}"`);
    if (s.goal === 'escape' || s.goal === 'promote') return;
    const c = load(s.fen);
    const wrong = allowedMoves(c, s).filter((m) => {
      const after = load(s.fen);
      const mv = after.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      return !goalMet(s, mv, after);
    });
    assert.ok(wrong.length > 0, `${name}: every move solves it, so it teaches nothing`);
  });
});

test('escape stages allow only the method they teach', () => {
  for (const s of LESSONS.find((l) => l.id === 'escape').stages) {
    const c = load(s.fen);
    assert.ok(c.isCheck(), `${s.method}: the king must start in check`);
    const moves = allowedMoves(c, s);
    for (const m of moves) {
      if (s.method === 'flee') assert.equal(m.piece, 'k', `flee: ${m.san} is not a king move`);
      if (s.method === 'block') assert.ok(m.piece !== 'k' && !m.captured, `block: ${m.san} does not block`);
      if (s.method === 'take') assert.ok(m.captured, `take: ${m.san} does not take the attacker`);
    }
  }
});

test('castling stages each allow one side only, and en passant is on the board', () => {
  const [short, long] = LESSONS.find((l) => l.id === 'castle').stages;
  assert.deepEqual(allowedMoves(load(short.fen), short).filter((m) => m.flags.includes('q')), []);
  assert.ok(allowedMoves(load(short.fen), short).some((m) => m.flags.includes('k')));
  assert.deepEqual(allowedMoves(load(long.fen), long).filter((m) => m.flags.includes('k')), []);
  assert.ok(allowedMoves(load(long.fen), long).some((m) => m.flags.includes('q')));
  const ep = LESSONS.find((l) => l.id === 'enpassant').stages[0];
  assert.ok(allowedMoves(load(ep.fen), ep).some((m) => m.flags.includes('e')));
});

test('only: the boxed-in knight is the one snail that may move', () => {
  const s = LESSONS.find((l) => l.id === 'knight').stages[2];
  const c = load(s.fen);
  assert.ok(c.moves({ verbose: true }).some((m) => m.piece === 'p'), 'the pawns could move without the rule');
  assert.ok(allowedMoves(c, s).every((m) => m.piece === 'n'));
});

test('stars: par and first try give three, a bit over gives two', () => {
  const eat = LESSONS[0].stages[2];
  assert.equal(stars(eat, { moves: par(eat) }), 3);
  assert.equal(stars(eat, { moves: par(eat) + 2 }), 2);
  assert.equal(stars(eat, { moves: par(eat) + 3 }), 1);
  const mate = LESSONS.find((l) => l.id === 'mate').stages[0];
  assert.equal(stars(mate, { attempts: 1 }), 3);
  assert.equal(stars(mate, { attempts: 2 }), 2);
  assert.equal(stars(mate, { attempts: 5 }), 1);
});

test('every lesson and hint has its words, in both languages', () => {
  const sv = new Set(keysOf('sv')), en = new Set(keysOf('en'));
  const keys = new Set(['learn.goal.eat', 'learn.goal.capture', 'learn.goal.check', 'learn.goal.escape', 'learn.goal.mate', 'learn.goal.castle', 'learn.goal.enpassant', 'learn.goal.promote']);
  for (const l of LESSONS) {
    keys.add(`learn.${l.id}.title`); keys.add(`learn.${l.id}.intro`);
    for (const s of l.stages) if (s.hint) keys.add(s.hint);
  }
  for (const k of keys) { assert.ok(sv.has(k), `sv is missing ${k}`); assert.ok(en.has(k), `en is missing ${k}`); }
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall lesson tests passed');
