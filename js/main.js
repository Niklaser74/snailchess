// Menu, game flow and the DOM. Rules: js/vendor/chess.js. Board: js/board.js.
// Computer: js/ai.js in a worker. Battle light duels: js/duel.js.
import { Chess } from './vendor/chess.js';
import { Board, SPEEDS } from './board.js';
import { runDuel } from './duel.js';
import { t, setLang, detectLang } from './i18n.js';
import { SIDE_COLORS } from './pieces.js';
import { setMuted, isMuted, unlockAudio } from './game/audio.js';
import { snigelpost } from './online.js';
import { push } from './push.js';
import { getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snailchess.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snailchess.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('snailchess.' + k); } catch { /* ignore */ } },
};

const DEFAULTS = { mode: 'gentle', opponent: 'normal', side: 'w', speed: 'normal', hints: true, badges: true, flip: false };
let settings = { ...DEFAULTS, ...store.get('settings', {}) };
if (settings.mode === 'battle' && settings.v !== 2) settings.mode = 'light'; // "battle" meant battle light before the battle mode existed
settings.v = 2;
let kingLost = null; // winner colour when a rescue shot missed in battle mode
// Kaos: damage follows the piece between duels. hp by square; missing = fresh (KAOS_HP).
// events: the saved game as a list — SAN, '--' (turn passed) or 'x:<sq>' (piece fell in a duel)
const KAOS_HP = 60;
let hp = {};
let events = [];
// Snigelpost: the match being played over the net (null = local game) and where my current ply started in events
let onlineMatch = null;
let plyStart = 0;
let chess = new Chess();
let humanSides = new Set(['w', 'b']);
let busy = false;
let over = false;
let selected = null;
let duelCtl = null;

setLang(detectLang());
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); refreshHud(); }));

const board = new Board($('board'));
board.onSquare = onSquare;

// ---------- menu ----------
const fields = ['mode', 'opponent', 'side', 'speed'];
const flags = ['hints', 'badges', 'flip'];
function readMenu() {
  for (const f of fields) settings[f] = $('opt-' + f).value;
  for (const f of flags) settings[f] = $('opt-' + f).checked;
  store.set('settings', settings);
  applySettings();
}
function writeMenu() {
  for (const f of fields) $('opt-' + f).value = settings[f];
  for (const f of flags) $('opt-' + f).checked = settings[f];
  $('opt-side').disabled = settings.opponent === 'human';
}
function applySettings() {
  board.speed = SPEEDS[settings.speed] || SPEEDS.normal;
  board.badges = settings.badges;
  $('opt-side').disabled = settings.opponent === 'human';
}
for (const f of [...fields, ...flags]) $('opt-' + f).addEventListener('change', readMenu);
writeMenu();
applySettings();

function showMenu() {
  const saved = store.get('game', null);
  $('btn-continue').hidden = !(saved && saved.moves && saved.moves.length && !saved.over);
  $('menu').hidden = false;
  $('hud').hidden = true;
  $('wait').hidden = true;
  stopPolling();
  onlineMatch = null;
  refreshMatchList();
}
$('btn-start').addEventListener('click', () => { readMenu(); newGame(); });
$('btn-continue').addEventListener('click', () => { readMenu(); if (!resumeGame()) newGame(); });
$('btn-menu').addEventListener('click', () => { if (busy) return; showMenu(); });
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
$('btn-again').addEventListener('click', () => { $('over').hidden = true; newGame(); });
$('btn-over-menu').addEventListener('click', () => { $('over').hidden = true; showMenu(); });
$('btn-undo').addEventListener('click', undo);
$('btn-flip').addEventListener('click', () => { board.flipped = !board.flipped; });
$('btn-mute').addEventListener('click', () => { setMuted(!isMuted()); store.set('muted', isMuted()); refreshMute(); });
$('btn-duel-skip').addEventListener('click', () => duelCtl?.skip());
setMuted(store.get('muted', false));
function refreshMute() {
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', t(isMuted() ? 'aria.unmute' : 'aria.mute'));
}
refreshMute();
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('help').hidden) $('help').hidden = true; else if (!$('promo').hidden) return; else if (!busy && $('menu').hidden) showMenu(); }
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
});

// ---------- game ----------
function sidesFor() {
  if (settings.opponent === 'human') return new Set(['w', 'b']);
  const side = settings.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.side;
  return new Set([side]);
}
function newGame() {
  onlineMatch = null;
  chess = new Chess();
  humanSides = sidesFor();
  over = false;
  kingLost = null;
  hp = {};
  events = [];
  startPlaying();
}
// Rebuild the rules engine from an event list (saved game or online match).
function chessFrom(list) {
  const c = new Chess();
  for (const e of list) {
    if (e === '--') c.move(null); // turn passed (battle: a miss, kaos: the attacker fell)
    else if (e.startsWith('x:')) c.remove(e.slice(2)); // kaos: a piece fell in a duel
    else if (e.startsWith('?:')) continue; // the capture that was attempted before a miss or a fall
    else c.move(e);
  }
  return list.some((e) => e.startsWith('x:')) ? new Chess(c.fen()) : c; // see piecesFall
}
function resumeGame() {
  const saved = store.get('game', null);
  if (!saved || !saved.moves) return false;
  try { chess = chessFrom(saved.moves); } catch { return false; }
  onlineMatch = null;
  events = [...saved.moves];
  hp = { ...(saved.hp || {}) };
  kingLost = null;
  settings = { ...settings, ...(saved.settings || {}) };
  writeMenu(); applySettings();
  humanSides = new Set(saved.humanSides || ['w', 'b']);
  over = false;
  startPlaying();
  return true;
}
function startPlaying() {
  $('menu').hidden = true;
  $('hud').hidden = false;
  $('over').hidden = true;
  selected = null;
  board.setSelection(null);
  board.setPosition(chess.board());
  board.marks = null;
  board.hp = settings.mode === 'kaos' ? hp : null;
  $('mate-note').hidden = true;
  const h = chess.history({ verbose: true });
  board.lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  board.flipped = humanSides.size === 1 && humanSides.has('b');
  orientForTurn();
  save();
  refreshHud();
  renderMoves();
  maybeComputer();
}
function orientForTurn() {
  if (settings.flip && humanSides.size === 2) board.flipped = chess.turn() === 'b';
}
function isHumanTurn() { return humanSides.has(chess.turn()); }
function save() {
  if (onlineMatch) return; // the server holds online games
  store.set('game', { moves: events, hp, settings: { mode: settings.mode, opponent: settings.opponent }, humanSides: [...humanSides], over });
}
// Keep the kaos hp map in step with a move that has been played.
function carryHp(move) {
  const victimSq = move.flags.includes('e') ? move.to[0] + move.from[1] : (move.captured ? move.to : null);
  const h = hp[move.from];
  delete hp[move.from];
  if (victimSq) delete hp[victimSq];
  if (h != null) hp[move.to] = h;
  if (move.flags.includes('k') || move.flags.includes('q')) {
    const rank = move.from[1], rf = (move.flags.includes('k') ? 'h' : 'a') + rank, rt = (move.flags.includes('k') ? 'f' : 'd') + rank;
    if (hp[rf] != null) { hp[rt] = hp[rf]; delete hp[rf]; }
  }
  board.hp = hp;
}
// Pieces fall outside the rules (kaos): remove them, then start a fresh Chess
// from the position. chess.js's history()/pgn() rebuild the board by replaying
// the moves, which would resurrect a removed piece, so the history must not
// reach back past a removal (events keeps the full list for the move panel).
// Returns false when the removal leaves the king in check (the piece shielded it).
function piecesFall(squares) {
  for (const sq of squares) { chess.remove(sq); delete hp[sq]; }
  if (chess.isCheck()) return false;
  for (const sq of squares) events.push('x:' + sq);
  chess = new Chess(chess.fen());
  return true;
}

function onSquare(sq) {
  if (busy || over || !isHumanTurn() || !$('menu').hidden) return;
  const piece = chess.get(sq);
  if (selected) {
    const moves = chess.moves({ square: selected, verbose: true });
    const m = moves.find((x) => x.to === sq);
    if (m) {
      if (m.promotion) return askPromotion(m);
      return play({ from: m.from, to: m.to });
    }
  }
  if (piece && piece.color === chess.turn()) select(sq);
  else deselect();
}
function select(sq) {
  selected = sq;
  board.setSelection(sq, settings.hints ? chess.moves({ square: sq, verbose: true }) : []);
}
function deselect() { selected = null; board.setSelection(null); }

function askPromotion(m) {
  $('promo').hidden = false;
  const onPick = (e) => {
    const p = e.target.closest('button')?.dataset.piece;
    if (!p) return;
    $('promo').hidden = true;
    $('promo').removeEventListener('click', onPick);
    play({ from: m.from, to: m.to, promotion: p });
  };
  $('promo').addEventListener('click', onPick);
}

async function play(mv) {
  const moveNo = events.length + 1;
  const move = chess.move(mv);
  if (!move) return;
  busy = true;
  deselect();
  board.checkSquare = null;
  $('hud-msg').textContent = '';
  let victimGone = false, mover = null;
  const lose = (winner) => {
    kingLost = winner;
    over = true;
    busy = false;
    board.setPosition(chess.board());
    afterMove();
  };
  if (move.captured && settings.mode !== 'gentle') {
    const victimSq = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
    const wasInCheck = (() => { chess.undo(); const c = chess.isCheck(); chess.move(mv); return c; })();
    const kaos = settings.mode === 'kaos' ? { attackerHp: hp[move.from] ?? KAOS_HP, defenderHp: hp[victimSq] ?? KAOS_HP } : null;
    const attackerPiece = await approach(move);
    const outcome = await duel(move, victimSq, moveNo, settings.mode === 'light', kaos);
    if (outcome.result === 'miss') {
      // battle mode: the piece stays and the turn passes. A missed rescue shot loses the king.
      chess.undo();
      if (wasInCheck) return lose(move.color === 'w' ? 'b' : 'w');
      chess.move(null);
      events.push('?:' + move.san, '--');
      $('hud-msg').textContent = t('battle.miss');
      if (attackerPiece) await board.crawl(attackerPiece, move.from); // slinks back
      board.setPosition(chess.board());
      board.lastMove = { from: move.from, to: move.from };
      busy = false;
      afterMove(true);
      return;
    }
    if (kaos && outcome.result !== 'attacker') {
      // kaos: the attacker fell (or both did). It leaves the board; the king cannot.
      chess.undo();
      const opponent = move.color === 'w' ? 'b' : 'w';
      if (wasInCheck || move.piece === 'k') return lose(opponent);
      events.push('?:' + move.san);
      if (!piecesFall(outcome.result === 'draw' ? [move.from, victimSq] : [move.from])) { events.pop(); return lose(opponent); }
      if (outcome.result !== 'draw') hp[victimSq] = outcome.defenderHp;
      chess.move(null);
      events.push('--');
      $('hud-msg').textContent = t(outcome.result === 'draw' ? 'kaos.both' : 'kaos.lost', { piece: t('piece.' + move.piece) });
      if (attackerPiece) await board.fade(attackerPiece);
      board.setPosition(chess.board());
      board.hp = hp;
      board.lastMove = { from: move.from, to: move.from };
      busy = false;
      afterMove(true);
      return;
    }
    if (kaos) hp[move.from] = outcome.attackerHp;
    victimGone = true;
    mover = attackerPiece;
  }
  if (settings.mode === 'kaos') carryHp(move);
  events.push(move.san);
  await board.animateMove(move, { victimGone, mover });
  board.setPosition(chess.board()); // reconcile
  board.marks = null;
  board.lastMove = { from: move.from, to: move.to };
  busy = false;
  afterMove();
}
async function afterMove(keepMessage = false) {
  orientForTurn();
  if (over || chess.isGameOver()) {
    over = true;
    save(); refreshHud(); renderMoves();
    if (onlineMatch) await submitPly();
    return finish();
  }
  save();
  refreshHud(keepMessage);
  renderMoves();
  if (onlineMatch) { await submitPly(); return; }
  maybeComputer();
}

// ---------- the duel (battle light) ----------
// The square next to the victim on the attacker's way there (for a knight: the
// diagonal step back towards where it came from).
function squareBefore(from, to) {
  const f0 = from.charCodeAt(0), r0 = +from[1], f1 = to.charCodeAt(0), r1 = +to[1];
  const df = Math.sign(f0 - f1), dr = Math.sign(r0 - r1);
  return String.fromCharCode(f1 + df) + (r1 + dr);
}
// Before a duel the attacker crawls up next to its victim and both get a
// moment to see what is coming. Returns the attacker's board piece.
async function approach(move) {
  const piece = board.pieceAt(move.from);
  if (!piece) return null;
  const pre = squareBefore(move.from, move.to);
  if (pre !== move.from) await board.crawl(piece, pre);
  await sleep(600);
  return piece;
}
async function duel(move, victimSq, moveNo, mustWin = true, kaos = null) {
  const victimType = move.captured;
  const attacker = { type: move.piece, color: move.color };
  const defender = { type: victimType, color: move.color === 'w' ? 'b' : 'w' };
  const name = (p) => `${t('piece.' + p.type)} (${t('team.' + p.color)})`;
  $('duel-title').textContent = t('duel.title', { attacker: name(attacker), defender: name(defender) });
  $('duel-msg').textContent = '';
  $('duel').hidden = false;
  duelCtl = runDuel($('duel-canvas'), { attacker, defender, from: move.from, to: move.to, moveNo, names: { attacker: t('piece.' + attacker.type), defender: t('piece.' + defender.type) } }, { mustWin, kaos, speed: kaos ? 1.8 : 1 });
  const msgTimer = setInterval(() => {
    const m = duelCtl?.duel.game.message;
    $('duel-msg').textContent = m && m.key ? t(m.key, m) : '';
  }, 100);
  const result = await duelCtl.promise;
  const d = duelCtl.duel;
  const outcome = { result, attackerHp: Math.max(0, d.attacker.hp), defenderHp: Math.max(0, d.defender.hp) };
  clearInterval(msgTimer);
  $('duel').hidden = true;
  duelCtl = null;
  if (result === 'attacker' || result === 'draw') {
    const victim = board.pieceAt(victimSq);
    if (victim) board.pieces = board.pieces.filter((p) => p !== victim);
  }
  return outcome;
}

// ---------- undo ----------
function undo() {
  if (busy || onlineMatch || !$('menu').hidden || chess.history().length === 0 || settings.mode === 'kaos') return; // kaos: no undo, damage is done
  chess.undo(); events.pop();
  if (humanSides.size === 1 && !isHumanTurn() && chess.history().length) { chess.undo(); events.pop(); }
  over = false;
  kingLost = null;
  $('over').hidden = true;
  deselect();
  board.setPosition(chess.board());
  const h = chess.history({ verbose: true });
  board.lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  afterMove();
}

// ---------- computer ----------
let worker = null, reqId = 0;
function askWorker(fen, level) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      try { worker = new Worker('js/ai-worker.js', { type: 'module' }); } catch (e) { return reject(e); }
      worker.onerror = (e) => { reject(e); worker = null; };
    }
    const id = ++reqId;
    const onMsg = (e) => { if (e.data.id !== id) return; worker.removeEventListener('message', onMsg); resolve(e.data.move); };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ id, fen, level });
  });
}
async function maybeComputer() {
  if (over || onlineMatch || isHumanTurn() || busy) return;
  busy = true;
  $('hud-msg').textContent = t('hud.thinking');
  const fen = chess.fen();
  const started = performance.now();
  let move = null;
  try { move = await askWorker(fen, settings.opponent); }
  catch { const { pickMove } = await import('./ai.js'); move = pickMove(fen, settings.opponent); }
  const wait = Math.max(0, 900 - (performance.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  busy = false;
  if (chess.fen() !== fen || !move) return; // the game changed underneath (undo, new game)
  play(move);
}

// ---------- game over ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function finish() {
  let why = '';
  if (chess.isCheckmate() && chess.history().length) why = await explainMate();
  showOver(why);
}
// Checkmate deserves a moment: replay the mating move slowly, then mark the
// attackers, their lines to the king and the squares the king cannot use.
async function explainMate() {
  const h = chess.history({ verbose: true });
  const move = h[h.length - 1];
  const loser = chess.turn(), winner = loser === 'w' ? 'b' : 'w';
  let king = null;
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === loser) king = p.square;
  const attackers = chess.attackers(king, winner);
  const { f, r } = Board.fr(king);
  const blocked = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const ff = f + df, rr = r + dr;
    if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
    const s = 'abcdefgh'[ff] + (rr + 1);
    const p = chess.get(s);
    if (!p || p.color !== loser) blocked.push(s);
  }
  const list = attackers.map((s) => t('mate.attacker', { piece: t('piece.' + chess.get(s).type + '.def'), sq: s })).join(t('mate.and'));
  const why = t('mate.why', { team: t('team.' + loser), sq: king, attackers: list });
  busy = true;
  board.checkSquare = king;
  $('hud-msg').textContent = t('mate.banner');
  await sleep(1200);
  // replay: back to before the move, then crawl again
  chess.undo();
  board.setPosition(chess.board());
  board.lastMove = null;
  chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  $('hud-msg').textContent = t('mate.replay');
  await sleep(700);
  await board.animateMove(move);
  board.setPosition(chess.board());
  board.lastMove = { from: move.from, to: move.to };
  board.checkSquare = king;
  board.marks = { king, attackers, blocked };
  $('hud-msg').textContent = t('mate.banner');
  // the note with a skip button; skipping ends the whole explanation
  let skipped = false;
  const skip = () => { skipped = true; };
  $('btn-mate-skip').addEventListener('click', skip);
  const note = (text) => { $('mate-text').textContent = text; $('mate-note').hidden = false; };
  const pause = async (ms) => { const end = performance.now() + ms; while (!skipped && performance.now() < end) await sleep(100); };
  note(why);
  await pause(2500);
  // what would happen if the king went each way: it crawls there, the piece that would take it lights up, it crawls back
  const kingPiece = board.pieceAt(king);
  const describe = (sqs) => sqs.map((s) => t('mate.attacker', { piece: t('piece.' + chess.get(s).type + '.def'), sq: s })).join(t('mate.and'));
  for (const s of blocked) {
    if (skipped || !kingPiece) break;
    // attackers of the square as if the king had left its own square (a rook's line runs on behind it)
    chess.remove(king);
    const att = chess.attackers(s, winner);
    chess.put({ type: 'k', color: loser }, king);
    board.marks = { king: s, attackers: att, blocked: [] };
    note(t('mate.ifKing', { sq: s, attackers: describe(att) }));
    await board.crawl(kingPiece, s);
    await pause(1400);
    if (skipped) break;
    board.marks = { king, attackers, blocked };
    await board.crawl(kingPiece, king);
    await pause(250);
  }
  if (kingPiece && kingPiece.sq !== king) { board.setPosition(chess.board()); }
  board.marks = { king, attackers, blocked };
  note(t('mate.ifKingStay', { attackers: describe(attackers) }) + ' ' + t('mate.tap'));
  if (!skipped) await new Promise((resolve) => {
    const done = () => { clearTimeout(timer); removeEventListener('pointerdown', done); $('btn-mate-skip').removeEventListener('click', done); resolve(); };
    const timer = setTimeout(done, 12000);
    $('btn-mate-skip').addEventListener('click', done);
    setTimeout(() => addEventListener('pointerdown', done), 300);
  });
  $('btn-mate-skip').removeEventListener('click', skip);
  $('mate-note').hidden = true;
  busy = false;
  return why;
}

// ---------- HUD ----------
function refreshHud(keepMessage = false) {
  const turn = chess.turn();
  const chip = $('hud-turn');
  chip.textContent = t('hud.turn', { team: t('team.' + turn) }) + (humanSides.has(turn) ? '' : ' ' + t('hud.ai'));
  chip.style.background = SIDE_COLORS[turn];
  chip.style.color = turn === 'w' ? '#3a2a00' : '#fff';
  board.checkSquare = null;
  if (!over && chess.isCheck()) {
    $('hud-msg').textContent = isHumanTurn() ? t('msg.inCheck') : t('hud.check');
    const rows = chess.board();
    for (const row of rows) for (const p of row) if (p && p.type === 'k' && p.color === turn) board.checkSquare = p.square;
  } else if (!busy && !keepMessage) {
    $('hud-msg').textContent = '';
  }
  $('btn-undo').disabled = chess.history().length === 0 || settings.mode === 'kaos' || !!onlineMatch;
  refreshMute();
}
function renderMoves() {
  // one entry per ply from the event list: SAN, a miss, or the squares whose pieces fell before the turn passed
  const h = [];
  let fell = [];
  let tried = '';
  for (const e of events) {
    if (e.startsWith('x:')) { fell.push(e.slice(2)); continue; }
    if (e.startsWith('?:')) { tried = e.slice(2); continue; }
    h.push(e === '--' ? `<i>${tried ? tried + ' ' : ''}${fell.length ? '💥' + fell.join('+') : t('moves.miss')}</i>` : e);
    fell = []; tried = '';
  }
  const rows = [];
  for (let i = 0; i < h.length; i += 2) rows.push(`<li><span class="no">${i / 2 + 1}.</span> <span>${h[i]}</span> <span>${h[i + 1] || ''}</span></li>`);
  $('moves-list').innerHTML = rows.join('');
  $('moves-list').scrollTop = $('moves-list').scrollHeight;
}
function showOver(why = '') {
  let text;
  const loser = chess.turn(), winner = loser === 'w' ? 'b' : 'w';
  const r = onlineMatch?.result;
  if (r && r.type === 'resign') text = t(r.winner === onlineMatch.my_color ? 'over.theyResigned' : 'over.youResigned');
  else if (r && r.type === 'timeout') text = t(r.winner === onlineMatch.my_color ? 'over.timeoutWon' : 'over.timeoutLost');
  else if (kingLost) text = t('over.kingLost', { team: t('team.' + kingLost) });
  else if (chess.isCheckmate()) text = t('over.mate', { team: t('team.' + winner) });
  else if (chess.isStalemate()) text = t('over.stalemate');
  else if (chess.isThreefoldRepetition()) text = t('over.repetition');
  else if (chess.isInsufficientMaterial()) text = t('over.material');
  else if (chess.isDrawByFiftyMoves()) text = t('over.fifty');
  else text = t('over.draw');
  $('over-text').textContent = text;
  $('over-why').textContent = why;
  $('over-why').hidden = !why;
  $('over').hidden = false;
}

// ---------- Snigelpost (online, one ply at a time) ----------
let pollTimer = 0;
function stopPolling() { clearInterval(pollTimer); pollTimer = 0; }
function playerName() { return (store.get('name', '') || '').trim().slice(0, 24) || t('online.defaultName'); }
function onlineError(e) {
  const msg = /anonymous|signup|sign-in|disabled/i.test(e.message) ? t('online.disabled') : t('online.error', { msg: e.message });
  $('online-status').textContent = msg;
}
async function refreshMatchList() {
  if (!snigelpost.available()) { $('online').hidden = true; return; }
  $('online').hidden = false;
  try {
    const list = await snigelpost.list();
    $('online-list').innerHTML = list.map((m) => {
      const mine = snigelpost.isMyTurn(m);
      const state = m.status === 'finished' ? t('online.finished') : m.status === 'open' ? t('online.open') : mine ? t('online.yourTurn') : t('online.theirTurn', { name: snigelpost.opponentName(m) });
      const who = snigelpost.opponentName(m) ? t('online.vs', { name: snigelpost.opponentName(m) }) : t('online.noOpponent');
      return `<li class="mrow${mine ? ' turn' : ''}" data-id="${m.id}"><span class="mwho">${who}<br><small>${t('mode.' + m.mode + '.short')} · ${state}</small></span>` +
        `<button class="btn secondary mopen">${m.status === 'finished' ? t('online.show') : t('online.play')}</button><button class="icon-btn mdel" aria-label="${t('online.delete')}">✕</button></li>`;
    }).join('') || `<li class="mnone">${t('online.none')}</li>`;
    $('online-status').textContent = '';
  } catch (e) { onlineError(e); }
}
$('online-list').addEventListener('click', async (e) => {
  const row = e.target.closest('li[data-id]');
  if (!row) return;
  if (e.target.closest('.mopen')) openMatch(row.dataset.id);
  else if (e.target.closest('.mdel')) { try { await snigelpost.remove(row.dataset.id); } catch (err) { onlineError(err); } refreshMatchList(); }
});
$('opt-name').value = store.get('name', '');
$('opt-name').addEventListener('change', () => store.set('name', $('opt-name').value.trim().slice(0, 24)));
$('btn-online-create').addEventListener('click', async () => {
  readMenu();
  $('online-status').textContent = t('online.loading');
  try {
    const m = await snigelpost.create(playerName(), settings.mode);
    startOnline(m);
  } catch (e) { onlineError(e); }
});
async function openMatch(id) {
  $('online-status').textContent = t('online.loading');
  try {
    let m = await snigelpost.get(id);
    if (m.my_color == null) {
      m = await snigelpost.join(id, playerName());
      push.notify(id, 'joined');
    }
    startOnline(m);
  } catch (e) { onlineError(e); if ($('menu').hidden) showMenu(); }
}
// Set the game up from a match and show whatever is due: the opponent's last
// ply (with its duel), my move, the waiting room or the result.
async function startOnline(m) {
  stopPolling();
  onlineMatch = m;
  settings.mode = m.mode;
  applySettings();
  humanSides = new Set([m.my_color]);
  const seen = store.get('seen.' + m.id, 0);
  const replay = m.ply_count > seen && m.ply_count > 0 && m.turn === m.my_color; // the opponent moved since I last looked
  const all = m.events;
  const cut = replay ? plyBoundary(all) : all.length;
  chess = chessFrom(all.slice(0, cut));
  events = all.slice(0, cut);
  hp = { ...(replay ? m.hp_prev : m.hp) };
  kingLost = null;
  over = false;
  $('menu').hidden = true;
  $('wait').hidden = true;
  $('hud').hidden = false;
  $('over').hidden = true;
  selected = null;
  board.setSelection(null);
  board.setPosition(chess.board());
  board.marks = null;
  board.hp = m.mode === 'kaos' ? hp : null;
  board.flipped = m.my_color === 'b';
  board.lastMove = null;
  $('mate-note').hidden = true;
  refreshHud();
  renderMoves();
  if (replay) await replayPly(all.slice(cut), cut + 1);
  store.set('seen.' + m.id, m.ply_count);
  if (m.status === 'finished') {
    over = true;
    if (m.result?.type === 'kingLost') kingLost = m.result.winner;
    refreshHud();
    return finish();
  }
  if (snigelpost.isMyTurn(m)) { plyStart = events.length; refreshHud(); }
  else showWaiting();
}
// index in events where the last ply starts (a ply ends with SAN or '--'; 'x:'/'?:' entries belong to the ply after them)
function plyBoundary(list) {
  let i = list.length - 1;
  while (i > 0 && (list[i - 1].startsWith('x:') || list[i - 1].startsWith('?:'))) i--;
  return i;
}
// Play the opponent's ply on the board: the duel if it was a capture (same seed,
// same outcome), then the move, the miss or the fallen pieces.
async function replayPly(ply, moveNo) {
  busy = true;
  const last = ply[ply.length - 1];
  const tried = ply.find((e) => e.startsWith('?:'))?.slice(2);
  const san = last === '--' ? tried : last;
  let mv = null;
  if (san) { const probe = new Chess(chess.fen()); mv = probe.move(san); }
  let attackerPiece = null;
  if (mv && mv.captured && settings.mode !== 'gentle') {
    const victimSq = mv.flags.includes('e') ? mv.to[0] + mv.from[1] : mv.to;
    const kaos = settings.mode === 'kaos' ? { attackerHp: hp[mv.from] ?? KAOS_HP, defenderHp: hp[victimSq] ?? KAOS_HP } : null;
    attackerPiece = await approach(mv);
    await duel(mv, victimSq, moveNo, settings.mode === 'light', kaos);
  }
  // the board still shows the position before the ply (duel() has already taken the victim off it)
  if (last === '--') {
    const fallen = ply.filter((e) => e.startsWith('x:')).map((e) => (mv && e.slice(2) === mv.from && attackerPiece ? attackerPiece : board.pieceAt(e.slice(2)))).filter(Boolean);
    if (fallen.length) await Promise.all(fallen.map((p) => board.fade(p)));
    else if (attackerPiece) await board.crawl(attackerPiece, mv.from); // a miss: slinks back
    $('hud-msg').textContent = fallen.length ? t('kaos.lost', { piece: mv ? t('piece.' + mv.piece) : '' }) : t('battle.miss');
    if (mv) board.lastMove = { from: mv.from, to: mv.from };
  } else if (mv) {
    await board.animateMove(mv, { victimGone: !!mv.captured && settings.mode !== 'gentle', mover: attackerPiece });
    board.lastMove = { from: mv.from, to: mv.to };
  }
  chess = chessFrom([...events, ...ply]);
  events.push(...ply);
  hp = { ...onlineMatch.hp };
  board.hp = settings.mode === 'kaos' ? hp : null;
  board.setPosition(chess.board());
  busy = false;
  renderMoves();
  refreshHud(true);
}
async function submitPly() {
  const m = onlineMatch;
  const mine = events.slice(plyStart);
  if (!m || !mine.length) return;
  let result = null;
  if (over) {
    const type = kingLost ? 'kingLost' : chess.isCheckmate() ? 'mate' : chess.isStalemate() ? 'stalemate' : 'draw';
    const winner = kingLost || (type === 'mate' ? (chess.turn() === 'w' ? 'b' : 'w') : null);
    result = { type, winner };
  }
  $('hud-msg').textContent = t('online.sending');
  try {
    onlineMatch = await snigelpost.submit(m, mine, chess.fen(), hp, result);
    store.set('seen.' + m.id, onlineMatch.ply_count);
    push.notify(m.id, over ? 'finished' : 'turn');
    if (!over) showWaiting();
  } catch (e) {
    $('hud-msg').textContent = t('online.error', { msg: e.message });
  }
}
function showWaiting() {
  const m = onlineMatch;
  if (!m) return;
  $('wait').hidden = false;
  const open = m.status === 'open';
  $('wait-title').textContent = open ? t('online.inviteTitle') : t('online.theirTurn', { name: snigelpost.opponentName(m) });
  $('wait-text').textContent = open ? t('online.inviteText') : t('online.waitText', { name: snigelpost.opponentName(m) });
  $('wait-link').value = snigelpost.inviteLink(m.id);
  $('wait-link-row').hidden = !open;
  $('btn-share').hidden = !navigator.share || !open;
  $('btn-timeout').hidden = snigelpost.silentDays(m) < 14;
  refreshPushButton();
  stopPolling();
  pollTimer = setInterval(pollMatch, 8000);
}
async function pollMatch() {
  const m = onlineMatch;
  if (!m || document.hidden) return;
  try {
    const fresh = await snigelpost.get(m.id);
    if (fresh.ply_count !== m.ply_count || fresh.status !== m.status || (!!fresh.guest) !== (!!m.guest)) startOnline(fresh);
  } catch { /* try again next time */ }
}
addEventListener('visibilitychange', () => { if (!document.hidden && onlineMatch && !$('wait').hidden) pollMatch(); });
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('wait-link').value); $('btn-copy').textContent = t('online.copied'); }
  catch { $('wait-link').select(); }
  setTimeout(() => { $('btn-copy').textContent = t('online.copy'); }, 1500);
});
$('btn-share').addEventListener('click', () => { navigator.share({ title: t('app.name'), url: $('wait-link').value }).catch(() => {}); });
$('btn-wait-menu').addEventListener('click', showMenu);
$('btn-resign').addEventListener('click', async () => {
  if (!onlineMatch || !confirm(t('online.resignConfirm'))) return;
  try {
    const m = await snigelpost.resign(onlineMatch.id);
    if (m) { push.notify(m.id, 'resigned'); startOnline(m); } else showMenu();
  } catch (e) { onlineError(e); }
});
$('btn-timeout').addEventListener('click', async () => {
  if (!onlineMatch) return;
  try { const m = await snigelpost.claimTimeout(onlineMatch.id); push.notify(m.id, 'timeout'); startOnline(m); } catch (e) { onlineError(e); }
});
function refreshPushButton() {
  const b = $('btn-push');
  if (!push.supported()) { b.hidden = true; return; }
  b.hidden = false;
  if (push.needsInstall()) { b.textContent = t('push.install'); b.disabled = true; return; }
  const p = push.permission();
  b.disabled = p === 'denied';
  b.textContent = p === 'denied' ? t('push.denied') : p === 'granted' ? t('push.on') : t('push.ask');
  if (p === 'granted') push.current().then((s) => { if (!s) b.textContent = t('push.ask'); });
}
$('btn-push').addEventListener('click', async () => {
  try { await push.subscribe(getLang()); $('btn-push').textContent = t('push.on'); }
  catch { $('btn-push').textContent = t('push.denied'); }
});

// ---------- PWA ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('btn-install').hidden = false; });
$('btn-install').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('btn-install').hidden = true; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => { $('offline-hint').textContent = t('menu.offline'); push.resubscribe(getLang()); }).catch(() => {});
  });
}

// for browser tests and debugging
window.snailchess = { get chess() { return chess; }, get board() { return board; }, get duel() { return duelCtl; }, get busy() { return busy; }, get match() { return onlineMatch; }, get events() { return events; } };

showMenu();
const joinId = new URLSearchParams(location.search).get('match');
if (joinId) { history.replaceState(null, '', location.pathname); openMatch(joinId); }
