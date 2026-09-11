// Battle light duels, headless: whatever the pieces, the attacker wins, the
// duel is over within the tick budget, and the same capture replays the same.
//   node test/duel.test.mjs
import assert from 'node:assert/strict';
import { createDuel, duelSeed, duelTheme, DUEL_WEAPONS } from '../js/duel.js';
import { LOOKS } from '../js/pieces.js';

let failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
function play(spec) {
  const d = createDuel(null, spec);
  let n = 0;
  while (!d.done && n++ < 60 * 60) d.tick();
  return d;
}

test('every piece type has duel weapons and a look', () => {
  for (const t of 'pnbrqk') {
    assert.ok(DUEL_WEAPONS[t]?.length, `no weapons for ${t}`);
    assert.ok(LOOKS[t], `no look for ${t}`);
  }
});

test('the attacker wins every duel, for every attacker type and both sides', () => {
  let moveNo = 1, hits = 0, total = 0;
  for (const a of 'pnbrqk') for (const dType of 'pkq') for (const color of ['w', 'b']) {
    const spec = { attacker: { type: a, color }, defender: { type: dType, color: color === 'w' ? 'b' : 'w' }, from: 'e2', to: 'e7', moveNo: moveNo++ };
    const d = play(spec);
    assert.ok(d.done, `duel ${a} vs ${dType} never ended`);
    assert.equal(d.result, 'attacker', `duel ${a} vs ${dType}: ${d.result}`);
    assert.equal(d.defender.alive, false);
    assert.ok(d.game.tickCount < 60 * 45, `duel ${a} vs ${dType} took ${d.game.tickCount} ticks`);
    total++;
    if (d.game.hasFired) hits++;
  }
  assert.equal(hits, total, 'the attacker should actually fire in every duel');
});

test('the same capture gives the same duel; another square gives another arena', () => {
  const spec = { attacker: { type: 'r', color: 'w' }, defender: { type: 'b', color: 'b' }, from: 'a1', to: 'a8', moveNo: 12 };
  const a = play(spec), b = play(spec);
  assert.equal(a.game.stateHash(), b.game.stateHash());
  assert.equal(a.game.tickCount, b.game.tickCount);
  assert.notEqual(duelSeed(12, 'a1', 'a8'), duelSeed(13, 'a1', 'a8'));
  assert.notEqual(duelSeed(12, 'a1', 'a8'), duelSeed(12, 'a1', 'b8'));
  assert.ok(['garden', 'beach', 'jungle'].includes(duelTheme('e4')));
  assert.notEqual(duelTheme('a1'), duelTheme('b1'));
});

test('weapons are limited to the piece and the arena is the small one', () => {
  const d = createDuel(null, { attacker: { type: 'p', color: 'w' }, defender: { type: 'q', color: 'b' }, from: 'd4', to: 'e5', moveNo: 3 });
  assert.equal(d.game.W, 900);
  assert.equal(d.game.teams[0].ammo.bazooka, 0);
  assert.ok(d.game.teams[0].ammo.slem > 0);
  assert.equal(d.defender.hp, 15);
  assert.equal(d.attacker.x, 230);
  assert.equal(d.defender.x, 670);
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall duel tests passed');
