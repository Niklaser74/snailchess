// Menu, game flow and the DOM. Rules: js/vendor/chess.js. Board: js/board.js.
// Computer: js/ai.js in a worker. Battle light duels: js/duel.js.
import { Chess } from './vendor/chess.js';
import { Board, SPEEDS } from './board.js';
import { runDuel } from './duel.js';
import { t, setLang, detectLang } from './i18n.js';
import { SIDE_COLORS } from './pieces.js';
import { setMuted, isMuted, unlockAudio } from './game/audio.js';

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
  chess = new Chess();
  humanSides = sidesFor();
  over = false;
  kingLost = null;
  startPlaying();
}
function resumeGame() {
  const saved = store.get('game', null);
  if (!saved || !saved.moves) return false;
  try {
    const c = new Chess();
    for (const san of saved.moves) c.move(san === '--' ? null : san); // '--' = a missed capture in battle mode
    chess = c;
  } catch { return false; }
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
  store.set('game', { moves: chess.history(), settings: { mode: settings.mode, opponent: settings.opponent }, humanSides: [...humanSides], over });
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
  const moveNo = chess.history().length + 1;
  const move = chess.move(mv);
  if (!move) return;
  busy = true;
  deselect();
  board.checkSquare = null;
  $('hud-msg').textContent = '';
  let victimGone = false;
  if (move.captured && (settings.mode === 'light' || settings.mode === 'battle')) {
    const victimSq = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
    const wasInCheck = (() => { chess.undo(); const c = chess.isCheck(); chess.move(mv); return c; })();
    const result = await duel(move, victimSq, moveNo, settings.mode === 'light');
    if (result === 'miss') {
      // battle mode: the piece stays and the turn passes. A missed rescue shot loses the king.
      chess.undo();
      if (wasInCheck) {
        kingLost = move.color === 'w' ? 'b' : 'w';
        over = true;
        busy = false;
        board.setPosition(chess.board());
        save(); refreshHud(); renderMoves();
        return showOver();
      }
      chess.move(null);
      $('hud-msg').textContent = t('battle.miss');
      board.setPosition(chess.board());
      board.lastMove = { from: move.from, to: move.from };
      busy = false;
      afterMove(true);
      return;
    }
    victimGone = true;
  }
  await board.animateMove(move, { victimGone });
  board.setPosition(chess.board()); // reconcile
  board.marks = null;
  board.lastMove = { from: move.from, to: move.to };
  busy = false;
  afterMove();
}
function afterMove(keepMessage = false) {
  orientForTurn();
  if (chess.isGameOver()) { over = true; save(); refreshHud(); renderMoves(); return finish(); }
  save();
  refreshHud(keepMessage);
  renderMoves();
  maybeComputer();
}

// ---------- the duel (battle light) ----------
async function duel(move, victimSq, moveNo, mustWin = true) {
  const victimType = move.captured;
  const attacker = { type: move.piece, color: move.color };
  const defender = { type: victimType, color: move.color === 'w' ? 'b' : 'w' };
  const name = (p) => `${t('piece.' + p.type)} (${t('team.' + p.color)})`;
  $('duel-title').textContent = t('duel.title', { attacker: name(attacker), defender: name(defender) });
  $('duel-msg').textContent = '';
  $('duel').hidden = false;
  duelCtl = runDuel($('duel-canvas'), { attacker, defender, from: move.from, to: move.to, moveNo, names: { attacker: t('piece.' + attacker.type), defender: t('piece.' + defender.type) } }, { mustWin });
  const msgTimer = setInterval(() => {
    const m = duelCtl?.duel.game.message;
    $('duel-msg').textContent = m && m.key ? t(m.key, m) : '';
  }, 100);
  const result = await duelCtl.promise;
  clearInterval(msgTimer);
  $('duel').hidden = true;
  duelCtl = null;
  if (result !== 'miss') {
    const victim = board.pieceAt(victimSq);
    if (victim) board.pieces = board.pieces.filter((p) => p !== victim);
  }
  return result;
}

// ---------- undo ----------
function undo() {
  if (busy || !$('menu').hidden || chess.history().length === 0) return;
  chess.undo();
  if (humanSides.size === 1 && !isHumanTurn() && chess.history().length) chess.undo();
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
  if (over || isHumanTurn() || busy) return;
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
  if (chess.isCheckmate()) why = await explainMate();
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
  $('btn-undo').disabled = chess.history().length === 0;
  refreshMute();
}
function renderMoves() {
  const h = chess.history();
  const rows = [];
  const san = (s) => (s === '--' ? `<i>${t('moves.miss')}</i>` : s);
  for (let i = 0; i < h.length; i += 2) rows.push(`<li><span class="no">${i / 2 + 1}.</span> <span>${san(h[i])}</span> <span>${h[i + 1] ? san(h[i + 1]) : ''}</span></li>`);
  $('moves-list').innerHTML = rows.join('');
  $('moves-list').scrollTop = $('moves-list').scrollHeight;
}
function showOver(why = '') {
  let text;
  const loser = chess.turn(), winner = loser === 'w' ? 'b' : 'w';
  if (kingLost) text = t('over.kingLost', { team: t('team.' + kingLost) });
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

// ---------- PWA ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('btn-install').hidden = false; });
$('btn-install').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('btn-install').hidden = true; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => { $('offline-hint').textContent = t('menu.offline'); }).catch(() => {});
  });
}

// for browser tests and debugging
window.snailchess = { get chess() { return chess; }, get board() { return board; }, get duel() { return duelCtl; }, get busy() { return busy; } };

showMenu();
