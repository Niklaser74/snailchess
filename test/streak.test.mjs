// Svitlistan's local count: days in a row in Swedish time, today or yesterday
// as the last day, and that every RPC the streak module calls exists in a
// migration with a grant.
//   node test/streak.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stockholmDay, prevDay, currentStreak, withDay } from '../js/streak.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

test('the day is Swedish time', () => {
  assert.equal(stockholmDay(new Date('2026-10-03T22:30:00Z')), '2026-10-04', 'half past midnight in Sweden is the next day');
  assert.equal(stockholmDay(new Date('2026-10-03T21:30:00Z')), '2026-10-03');
  assert.equal(prevDay('2026-03-01'), '2026-02-28');
  assert.equal(prevDay('2026-01-01'), '2025-12-31');
});

test('a streak ends today or yesterday, and counts back without gaps', () => {
  const days = ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
  assert.equal(currentStreak(days, '2026-10-03'), 4);
  assert.equal(currentStreak(days, '2026-10-04'), 4, 'today not played yet: yesterday still counts');
  assert.equal(currentStreak(days, '2026-10-05'), 0, 'a whole day missed');
  assert.equal(currentStreak([], '2026-10-03'), 0);
  assert.equal(currentStreak(['2026-10-03'], '2026-10-03'), 1);
});

test('adding a day is idempotent and keeps the list sorted and short', () => {
  assert.deepEqual(withDay(['2026-10-02'], '2026-10-02'), ['2026-10-02']);
  assert.deepEqual(withDay(['2026-10-03', '2026-10-01'], '2026-10-02'), ['2026-10-01', '2026-10-02', '2026-10-03']);
  let many = [];
  let d = '2026-10-03';
  for (let k = 0; k < 450; k++) { many.push(d); d = prevDay(d); }
  assert.equal(withDay(many, '2026-10-04').length, 400);
});

test('every streak RPC exists in a migration and is granted', () => {
  const src = readFileSync(new URL('../js/streak.js', import.meta.url), 'utf8');
  const sql = readdirSync(new URL('../supabase/migrations/', import.meta.url)).map((f) => readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8')).join('\n');
  const calls = [...new Set([...src.matchAll(/online\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(calls.length >= 4, 'found the calls');
  for (const name of calls) {
    assert.match(sql, new RegExp(`function\\s+public\\.${name}\\s*\\(`), `${name} has no migration`);
    assert.match(sql, new RegExp(`'${name}\\(`), `${name} is not in a grants list`);
  }
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
