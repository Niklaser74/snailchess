// Battle light: a capture on the board is played out as a short Snäckmageddon
// duel on a small arena. The attacker (the piece that captures) shoots once at
// the defender. The chess rules have already decided the outcome, so the
// attacker always wins: if the shot somehow misses, the defender is finished
// off anyway ("the salt got it"). Everything here runs on the vendored
// simulation in js/game/ (deterministic, headless-capable), so the duel can be
// tested in Node and later replayed on another device.
import { Game } from './game/game.js';
import { THEME_IDS } from './game/themes.js';
import { LOOKS, SIDE_COLORS } from './pieces.js';

// Which weapons a piece brings to a duel. The AI plans with bazooka, granat and
// slem, but its grenades land badly on the small arena (~55 % hits), so the
// grenade waits until that is fixed upstream. Bazooka hits ~97 %, slime ~80 %.
export const DUEL_WEAPONS = {
  p: ['slem'], n: ['slem'], b: ['bazooka'], r: ['bazooka'], q: ['bazooka', 'slem'], k: ['bazooka'],
};
export const ARENA = { width: 900, height: 450 };
const DEFENDER_HP = 15; // any hit is enough
const MAX_TICKS = 60 * 45; // safety net: nothing in a duel takes longer than this
const FILES = 'abcdefgh';

// A well-mixed seed from the move, so the same capture always plays the same duel.
export function duelSeed(moveNo, from, to) {
  let h = 0x9e3779b1 ^ (moveNo * 64 + squareIndex(from));
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) ^ squareIndex(to);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) & 0x7fffffff;
}
function squareIndex(sq) { return FILES.indexOf(sq[0]) + (Number(sq[1]) - 1) * 8; }
// The arena depends on where on the board the capture happens.
export function duelTheme(square) { return THEME_IDS[(squareIndex(square) % 3)]; }

// spec: { attacker: { type, color }, defender: { type, color }, from, to, moveNo, names: { attacker, defender } }
export function duelConfig(spec) {
  const look = (type) => ({ shell: 'spiral', hat: LOOKS[type].hat });
  return {
    seed: duelSeed(spec.moveNo, spec.from, spec.to),
    theme: duelTheme(spec.to),
    width: ARENA.width, height: ARENA.height,
    snailsPerTeam: 1,
    spawns: [[230], [ARENA.width - 230]],
    turnTime: 20, suddenDeath: 0, wind: 'normal',
    style: 'cartoon',
    teams: [
      { name: spec.names?.attacker || spec.attacker.type, color: SIDE_COLORS[spec.attacker.color], ai: 'hard', look: look(spec.attacker.type) },
      { name: spec.names?.defender || spec.defender.type, color: SIDE_COLORS[spec.defender.color], ai: false, look: look(spec.defender.type) },
    ],
  };
}

// Builds the duel. canvas may be null (headless). Returns { game, attacker, defender, tick, done, result }.
export function createDuel(canvas, spec) {
  const config = duelConfig(spec);
  const duel = { game: null, attacker: null, defender: null, done: false, result: null };
  duel.game = new Game(canvas, config, {
    onGameOver: (winner) => { duel.done = true; duel.result = winner && winner.index === 0 ? 'attacker' : (winner ? 'defender' : 'draw'); },
  });
  const g = duel.game;
  duel.attacker = g.teams[0].snails[0];
  duel.defender = g.teams[1].snails[0];
  duel.attacker.name = config.teams[0].name;
  duel.defender.name = config.teams[1].name;
  duel.defender.hp = DEFENDER_HP;
  g.say({ key: 'msg.turn', name: duel.attacker.name }, 2); // startTurn() already said it with the snail's random name
  // only the piece's own weapons
  const allowed = new Set(DUEL_WEAPONS[spec.attacker.type] || DUEL_WEAPONS.q);
  for (const w of g.weapons) if (!allowed.has(w.id)) g.teams[0].ammo[w.id] = 0;
  // face each other
  duel.attacker.facing = 1;
  duel.defender.facing = -1;

  // One simulation step plus the "attacker always wins" guarantee.
  duel.tick = () => {
    if (duel.done) return;
    g.tick();
    const d = duel.defender;
    const settled = g.phase === 'settle' && g.projectiles.length === 0 && g.pendingBooms.length === 0;
    const overdue = g.tickCount > MAX_TICKS || (g.hasFired && settled) || g.turnCount > 1;
    if (overdue && d.alive && d.hp > 0) { g.say({ key: 'duel.salt', name: d.name }, 2); g.damage(d, 999, 'salt'); }
    if (g.tickCount > MAX_TICKS + 120 && !duel.done) { duel.done = true; duel.result = 'attacker'; }
  };
  return duel;
}

// Browser driver: runs the duel on a canvas at real speed and resolves when it
// is over (plus a moment to look at the empty shell). onSkip() from the UI
// fast-forwards headlessly.
export function runDuel(canvas, spec, { holdMs = 1300 } = {}) {
  const duel = createDuel(canvas, spec);
  const TICK = 1 / 60;
  let raf = 0, last = 0, acc = 0, skipped = false, finished = false;
  const ctl = { duel, promise: null, skip: null };
  ctl.promise = new Promise((resolve) => {
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      resolve(duel.result || 'attacker');
    };
    ctl.skip = () => {
      if (finished) return;
      skipped = true;
      let n = 0;
      while (!duel.done && n++ < MAX_TICKS + 200) duel.tick();
      duel.game.render();
      finish();
    };
    const frame = (ts) => {
      if (skipped || finished) return;
      if (!last) last = ts;
      acc += Math.min(0.1, (ts - last) / 1000);
      last = ts;
      let n = 0;
      while (acc >= TICK && n++ < 6 && !duel.done) { duel.tick(); acc -= TICK; }
      duel.game.render();
      if (duel.done) { setTimeout(finish, holdMs); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
  return ctl;
}
