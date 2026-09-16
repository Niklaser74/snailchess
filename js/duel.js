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
// In kaos a snail shoots several times, so everyone falls back on the bazooka
// when the slime runs out. The order is the order of the weapon button.
export function weaponsFor(type, kaos = false) {
  const own = DUEL_WEAPONS[type] || DUEL_WEAPONS.q;
  return kaos && !own.includes('bazooka') ? [...own, 'bazooka'] : own;
}
export const ARENA = { width: 900, height: 450 };
const DEFENDER_HP = 15; // any hit is enough
const MAX_TICKS = 60 * 45; // safety net: nothing in a duel takes longer than this
const FILES = 'abcdefgh';

// A well-mixed seed from the move, so the same capture always plays the same duel.
export function duelSeed(moveNo, from, to, variant = 0) {
  let h = 0x9e3779b1 ^ (moveNo * 64 + squareIndex(from)) ^ Math.imul(variant + 1, 0x27d4eb2f);
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
    seed: duelSeed(spec.moveNo, spec.from, spec.to, spec.variant || 0),
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
// mustWin: battle light (the salt finishes a missed shot). false: battle mode, a
// miss is a miss and the duel ends with result 'miss'.
// kaos: { attackerHp, defenderHp } — both snails shoot in turn until one falls,
// hp carried over from earlier duels; result attacker | defender | draw.
// control: 'me' hands the attacker to the player (battle and kaos); the
// defender is always the computer. replay: a recording from duelRecording(),
// which drives both snails and disables the AI — that is how the opponent sees
// your shot in Snigelpost.
export function createDuel(canvas, spec, { mustWin = true, kaos = null, control = 'ai', replay = null } = {}) {
  const config = duelConfig(spec);
  if (kaos) config.teams[1].ai = 'hard';
  if (control === 'me') config.teams[0].ai = false;
  const duel = { game: null, attacker: null, defender: null, done: false, result: null, forced: false, variant: spec.variant || 0 };
  // Each turn starts on the piece's own weapon: startTurn() resets to the
  // bazooka, and fire() does not check ammo, so a pawn would otherwise shoot
  // one. Runs on both the live and the replaying device, so it stays in step.
  const armTurn = (g) => {
    if (!g.active) return;
    const ids = weaponsFor(g.active.team === 0 ? spec.attacker.type : spec.defender.type, !!kaos);
    const team = g.teams[g.active.team];
    // emptyInput() asks for the bazooka every turn, so set both: otherwise a
    // pawn with a bazooka in reserve (kaos) would switch away from its slime.
    g.weaponId = ids.find((id) => team.ammo[id] > 0) || ids[0];
    g.input.weapon = g.weaponId;
  };
  duel.game = new Game(canvas, config, {
    onTurn: armTurn,
    onGameOver: (winner) => { duel.done = true; duel.result = winner && winner.index === 0 ? 'attacker' : (winner ? 'defender' : 'draw'); },
  }, { replay: replay ? { rulesVersion: replay.rulesVersion, seed: replay.seed, inputs: replay.inputs } : null });
  const g = duel.game;
  duel.attacker = g.teams[0].snails[0];
  duel.defender = g.teams[1].snails[0];
  duel.attacker.name = config.teams[0].name;
  duel.defender.name = config.teams[1].name;
  duel.defender.hp = kaos ? kaos.defenderHp : DEFENDER_HP;
  if (kaos) duel.attacker.hp = kaos.attackerHp;
  g.say({ key: 'msg.turn', name: duel.attacker.name }, 2); // startTurn() already said it with the snail's random name
  // only the piece's own weapons
  for (const [i, type] of [spec.attacker.type, spec.defender.type].entries()) {
    const allowed = new Set(weaponsFor(type, !!kaos));
    for (const w of g.weapons) if (!allowed.has(w.id)) g.teams[i].ammo[w.id] = 0;
  }
  // kaos: several shots each, so nobody runs dry and stalls the duel
  if (kaos) for (const team of g.teams) team.ammo.bazooka = Infinity;
  armTurn(g); // the constructor's first turn ran before the ammo above was set
  // face each other
  duel.attacker.facing = 1;
  duel.defender.facing = -1;
  // Is the duel waiting for the player? Walking is allowed while retreating too.
  duel.myTurn = () => control === 'me' && !replay && !g.ai && !duel.done && g.active === duel.attacker
    && duel.attacker.alive && (g.phase === 'aim' || g.phase === 'retreat');
  duel.canFire = () => duel.myTurn() && g.phase === 'aim' && !g.hasFired;
  duel.weapons = () => weaponsFor(spec.attacker.type, !!kaos).filter((id) => g.teams[0].ammo[id] > 0);

  // One simulation step plus the "attacker always wins" guarantee.
  duel.tick = () => {
    if (duel.done) return;
    g.tick();
    if (kaos) { if (g.tickCount > MAX_TICKS * 4 && !duel.done) { duel.done = true; duel.result = 'draw'; } return; }
    const d = duel.defender;
    const settled = g.phase === 'settle' && g.projectiles.length === 0 && g.pendingBooms.length === 0;
    const overdue = g.tickCount > MAX_TICKS || (g.hasFired && settled) || g.turnCount > 1;
    if (overdue && d.alive && d.hp > 0) {
      if (mustWin) { duel.forced = true; g.say({ key: 'duel.salt', name: d.name }, 2); g.damage(d, 999, 'salt'); }
      else { duel.done = true; duel.result = 'miss'; g.say({ key: 'duel.miss', name: duel.attacker.name }, 3); g.paused = true; }
    }
    if (!mustWin && !duel.done && !duel.attacker.alive) { duel.done = true; duel.result = 'miss'; g.say({ key: 'duel.miss', name: duel.attacker.name }, 3); g.paused = true; }
    if (g.tickCount > MAX_TICKS + 120 && !duel.done) { duel.done = true; duel.result = 'attacker'; }
  };
  return duel;
}

// A shown shot must never miss. The duel is deterministic per seed, so try
// variants headlessly (a few milliseconds each) and pick the first one where
// the shot itself finishes the defender, without the salt. Deterministic too,
// so another device replaying the same capture picks the same variant.
export function hittingVariant(spec, maxTries = 16) {
  for (let v = 0; v < maxTries; v++) {
    const d = createDuel(null, { ...spec, variant: v });
    let n = 0;
    while (!d.done && n++ < MAX_TICKS + 200) d.tick();
    if (d.done && !d.forced) return v;
  }
  return 0; // give up: the salt will do it
}

// Browser driver: runs the duel on a canvas at real speed and resolves when it
// is over (plus a moment to look at the empty shell). onSkip() from the UI
// fast-forwards headlessly.
export function runDuel(canvas, spec, { holdMs = 2500, mustWin = true, kaos = null, speed = 1, control = 'ai', replay = null } = {}) {
  const variant = replay ? (replay.variant || 0) : (spec.variant ?? (mustWin && !kaos && control === 'ai' ? hittingVariant(spec) : 0));
  const duel = createDuel(canvas, { ...spec, variant }, { mustWin, kaos, control, replay });
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
      acc += Math.min(0.1, (ts - last) / 1000) * (duel.myTurn() ? 1 : speed); // never rush the player's own aim
      last = ts;
      let n = 0;
      while (acc >= TICK && n++ < 12 && !duel.done) { duel.tick(); acc -= TICK; }
      duel.game.render();
      if (duel.done) { setTimeout(finish, holdMs); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
  return ctl;
}

// What the other device needs to see this exact duel: the arena (variant and
// seed) and every input both snails made. Small — a turn records only changes.
export function duelRecording(duel) {
  const g = duel.game;
  return { variant: duel.variant, rulesVersion: g.rulesVersion, seed: g.seed, inputs: g.recording.inputs };
}
