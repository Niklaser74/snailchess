// Battle light duels, headless: whatever the pieces, the attacker wins, the
// duel is over within the tick budget, and the same capture replays the same.
//   node test/duel.test.mjs
import assert from 'node:assert/strict';
import { createDuel, duelSeed, duelTheme, hittingVariant, duelRecording, weaponsFor, DUEL_WEAPONS } from '../js/duel.js';
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

test('a shown duel never needs the salt: the hitting variant really hits, for every attacker type', () => {
  let salted = 0, total = 0;
  for (let m = 1; m <= 12; m++) for (const a of 'pnbrqk') {
    const spec = { attacker: { type: a, color: m % 2 ? 'w' : 'b' }, defender: { type: 'p', color: m % 2 ? 'b' : 'w' }, from: 'e2', to: 'abcdefgh'[m % 8] + (1 + (m * 3) % 8), moveNo: m };
    const v = hittingVariant(spec);
    const d = play({ ...spec, variant: v });
    total++;
    if (d.forced) salted++;
    assert.equal(d.result, 'attacker');
    assert.equal(hittingVariant(spec), v, 'variant choice must be deterministic');
  }
  assert.equal(salted, 0, ` of  shown duels would have needed the salt`);
});

test('battle mode (mustWin false): a miss is a miss, no salt, and hits are still the majority', () => {
  let miss = 0, hit = 0;
  for (let m = 1; m <= 40; m++) for (const a of 'rp') {
    const d = createDuel(null, { attacker: { type: a, color: 'w' }, defender: { type: 'n', color: 'b' }, from: 'd4', to: 'abcdefgh'[m % 8] + (1 + (m * 5) % 8), moveNo: m }, { mustWin: false });
    let n = 0;
    while (!d.done && n++ < 60 * 60) d.tick();
    assert.ok(d.done, 'battle duel must end');
    assert.equal(d.forced, false, 'no salt in battle mode');
    if (d.result === 'miss') { miss++; assert.ok(d.defender.alive, 'a miss leaves the defender alive'); }
    else { hit++; assert.equal(d.result, 'attacker'); }
  }
  assert.ok(miss > 0, 'some shots should miss');
  assert.ok(hit > miss * 2, `hits  should clearly outnumber misses `);
});

test('kaos: both shoot, hp carries in, the duel ends with a winner (or both gone) within the budget', () => {
  const res = { attacker: 0, defender: 0, draw: 0 };
  for (let m = 1; m <= 16; m++) {
    const d = createDuel(null, { attacker: { type: 'p', color: 'w' }, defender: { type: 'q', color: 'b' }, from: 'c4', to: 'abcdefgh'[m % 8] + (1 + (m * 3) % 8), moveNo: m }, { mustWin: false, kaos: { attackerHp: 60, defenderHp: 25 } });
    assert.equal(d.attacker.hp, 60); assert.equal(d.defender.hp, 25);
    assert.ok(d.game.teams[1].ai, 'the defender shoots back in kaos');
    assert.equal(d.game.teams[1].ammo.bazooka, Infinity, 'everyone gets the bazooka in kaos');
    let n = 0;
    while (!d.done && n++ < 60 * 200) d.tick();
    assert.ok(d.done, 'kaos duel must end');
    assert.equal(d.forced, false);
    res[d.result]++;
    if (d.result === 'attacker') assert.ok(!d.defender.alive && d.attacker.alive);
    if (d.result === 'defender') assert.ok(d.defender.alive && !d.attacker.alive);
  }
  assert.ok(res.attacker > 0, 'a wounded queen should lose to a fresh pawn now and then');
});

// A hand-played duel: aim up for a while, then hold fire to charge and let go.
function playByHand(spec, opts, { aimTicks = 30, chargeTicks = 45 } = {}) {
  const d = createDuel(null, spec, { control: 'me', ...opts });
  const g = d.game;
  let n = 0;
  for (let i = 0; i < aimTicks && !d.done; i++) { g.input.up = true; d.tick(); }
  g.input.up = false;
  for (let i = 0; i < chargeTicks && !d.done; i++) { g.input.fire = true; d.tick(); }
  g.input.fire = false;
  while (!d.done && n++ < 60 * 200) d.tick();
  return d;
}

test('aiming it yourself: the attacker has no computer, and nothing happens until you fire', () => {
  const spec = { attacker: { type: 'r', color: 'w' }, defender: { type: 'n', color: 'b' }, from: 'a1', to: 'a8', moveNo: 7 };
  const idle = createDuel(null, spec, { mustWin: false, control: 'me' });
  assert.equal(idle.game.ai, null, 'the player aims, not the computer');
  assert.ok(idle.myTurn(), 'the duel waits for the player');
  assert.ok(idle.canFire());
  for (let i = 0; i < 60 * 10; i++) idle.tick();
  assert.equal(idle.game.hasFired, false, 'no shot without input');
  // sitting on your hands until the clock runs out is a miss
  let n = 0;
  while (!idle.done && n++ < 60 * 60) idle.tick();
  assert.equal(idle.result, 'miss');

  const shot = playByHand(spec, { mustWin: false });
  assert.equal(shot.game.hasFired, true, 'holding fire shoots');
  assert.ok(['attacker', 'miss'].includes(shot.result));
  assert.equal(shot.myTurn(), false, 'the duel is over');
});

test('a hand-played duel replays tick for tick from its recording (Snigelpost)', () => {
  for (const [mode, opts] of [['battle', { mustWin: false }], ['kaos', { mustWin: false, kaos: { attackerHp: 60, defenderHp: 60 } }]]) {
    const spec = { attacker: { type: 'q', color: 'w' }, defender: { type: 'r', color: 'b' }, from: 'd1', to: 'd7', moveNo: 4 };
    const live = playByHand(spec, opts);
    const rec = duelRecording(live);
    assert.ok(rec.inputs.length > 1, `${mode}: the inputs should be recorded`);
    assert.ok(JSON.stringify(rec).length < 20000, `${mode}: the recording must stay small`);
    // the other device rebuilds the duel from the same spec plus the recording
    const rerun = createDuel(null, { ...spec, variant: rec.variant }, { ...opts, control: 'ai', replay: rec });
    assert.equal(rerun.game.ai, null, `${mode}: no AI during a replay`);
    let n = 0;
    while (!rerun.done && n++ < 60 * 200) rerun.tick();
    assert.equal(rerun.result, live.result, `${mode}: the replay ended differently`);
    assert.equal(rerun.game.tickCount, live.game.tickCount, `${mode}: the replay took another number of ticks`);
    assert.equal(rerun.game.stateHash(), live.game.stateHash(), `${mode}: the replay diverged`);
    assert.equal(rerun.myTurn(), false, `${mode}: a replay is never the player's turn`);
  }
});

test('everyone keeps a weapon: the slime runs out in kaos, the bazooka does not', () => {
  assert.deepEqual(weaponsFor('p', false), ['slem']);
  assert.deepEqual(weaponsFor('p', true), ['slem', 'bazooka']);
  assert.deepEqual(weaponsFor('r', true), ['bazooka']);
  const d = createDuel(null, { attacker: { type: 'p', color: 'w' }, defender: { type: 'n', color: 'b' }, from: 'e2', to: 'd3', moveNo: 9 }, { mustWin: false, kaos: { attackerHp: 60, defenderHp: 60 } });
  assert.equal(d.game.teams[0].ammo.bazooka, Infinity, 'a pawn falls back on the bazooka in kaos');
  assert.equal(d.game.weaponId, 'slem', 'but starts on its own weapon');
  assert.equal(d.game.teams[0].ammo.granat, 0, 'and never gets the ones it should not have');
  const mine = createDuel(null, { attacker: { type: 'p', color: 'w' }, defender: { type: 'n', color: 'b' }, from: 'e2', to: 'd3', moveNo: 9 }, { mustWin: false, kaos: { attackerHp: 60, defenderHp: 60 }, control: 'me' });
  for (let i = 0; i < 120; i++) mine.tick();
  assert.equal(mine.game.weaponId, 'slem', 'the reserve bazooka must not take over the pawn turn');
  let n = 0;
  while (!d.done && n++ < 60 * 200) d.tick();
  assert.ok(d.done, 'a kaos duel must end, not stall when the slime runs out');
  assert.notEqual(d.result, 'draw');
});

if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall duel tests passed');
