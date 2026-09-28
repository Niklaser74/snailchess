// Learn chess: the lesson picker, the lesson bar and the play of one stage.
// The lessons themselves, and the rules that judge them, are in js/lessons.js.
// It borrows the board while it is open (board.onSquare is swapped back on close)
// and never touches the saved game. Built with createElement/textContent only,
// see test/escape.test.mjs.
import { t } from './i18n.js';
import { LESSONS, ROUNDS, load, yellowAgain, allowedMoves, remaining, goalMet, par, stars, solvingMove } from './lessons.js';

const $ = (id) => document.getElementById(id);
const KEY = 'snailchess.learn';
const readProgress = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const writeProgress = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: progress is only lost */ } };
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createLearn({ board, onExit }) {
  let active = false, prevOnSquare = null;
  let li = 0, si = 0; // lesson and stage index
  let chess = null, lettuce = new Set(), moves = 0, attempts = 1, busy = false, done = false, selected = null;
  let progress = readProgress();
  let status = { key: '', params: {} }; // what the status line says, kept so a language change can redraw it

  const lesson = () => LESSONS[li];
  const stage = () => lesson().stages[si];

  // ---------- picker ----------
  function showPicker() {
    $('learn-bar').hidden = true;
    board.lettuce = null;
    const list = $('learn-list');
    list.replaceChildren(...LESSONS.map((l, i) => {
      const got = l.stages.reduce((n, _, k) => n + (progress[`${l.id}.${k}`] || 0), 0);
      const b = document.createElement('button');
      b.className = 'learn-item' + (got ? ' started' : '') + (l.stages.every((_, k) => progress[`${l.id}.${k}`]) ? ' done' : '');
      const name = document.createElement('span');
      name.className = 'learn-name';
      name.textContent = t(`learn.${l.id}.title`);
      const score = document.createElement('span');
      score.className = 'learn-score';
      score.textContent = `★ ${got}/${l.stages.length * 3}`;
      b.append(name, score);
      b.addEventListener('click', () => startLesson(i));
      return b;
    }));
    $('learn-pick').hidden = false;
  }

  // ---------- one stage ----------
  function startLesson(i) {
    li = i; si = 0;
    $('learn-pick').hidden = true;
    $('learn-bar').hidden = false;
    startStage();
  }
  function startStage() {
    const s = stage();
    chess = load(s.fen);
    lettuce = new Set(s.lettuce || []);
    moves = 0; attempts = 1; busy = false; done = false;
    deselect();
    board.flipped = false;
    board.marks = null;
    board.hp = null;
    board.lastMove = null;
    board.lettuce = s.goal === 'eat' ? lettuce : null;
    board.setPosition(chess.board());
    board.checkSquare = chess.isCheck() ? kingSquare('w') : null; // escape: the king starts in check
    $('learn-next').hidden = true;
    renderBar();
    setStatus(ROUNDS.has(s.goal) ? 'rounds' : '');
  }
  function kingSquare(color) {
    return chess.board().flat().find((p) => p && p.type === 'k' && p.color === color)?.square || null;
  }

  function renderBar() {
    const l = lesson(), s = stage();
    $('learn-title').textContent = t(`learn.${l.id}.title`);
    $('learn-step').textContent = t('learn.stage', { n: si + 1, of: l.stages.length });
    $('learn-intro').textContent = t(`learn.${l.id}.intro`);
    $('learn-goal').textContent = t(`learn.goal.${s.goal}`);
    $('learn-hint').textContent = [s.hint || []].flat().map((k) => t(k)).join('\n');
    $('learn-hint').hidden = !s.hint;
    $('learn-next').textContent = si + 1 < l.stages.length ? t('learn.next') : li + 1 < LESSONS.length ? t('learn.nextLesson') : t('learn.back');
  }
  function setStatus(key, params = {}) {
    status = { key, params };
    const el = $('learn-status');
    el.className = 'learn-status' + (key === 'learn.done' ? ' good' : key.startsWith('learn.wrong') ? ' bad' : '');
    if (key === 'rounds') {
      const s = stage(), left = remaining(s, chess, lettuce);
      const best = par(s);
      el.textContent = t(s.goal === 'eat' ? 'learn.left.eat' : 'learn.left.capture', { n: left }) + ' · ' + t('learn.moves', { n: moves, par: best });
    } else el.textContent = key ? t(key, params) : '';
  }

  function onSquare(sq) {
    if (busy || done) return;
    const s = stage();
    if (selected) {
      const m = allowedMoves(chess, s, selected).find((x) => x.to === sq);
      if (m) return m.promotion ? askPromotion(m) : play({ from: m.from, to: m.to });
    }
    const piece = chess.get(sq);
    if (piece && piece.color === 'w' && allowedMoves(chess, s, sq).length) select(sq);
    else deselect();
  }
  function select(sq) { selected = sq; board.setSelection(sq, allowedMoves(chess, stage(), sq)); }
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
    const s = stage();
    const move = chess.move(mv);
    if (!move) return;
    busy = true;
    deselect();
    board.checkSquare = null;
    board.lastMove = { from: move.from, to: move.to };
    await board.animateMove(move);
    if (!active || stage() !== s) return; // left or restarted while crawling
    if (ROUNDS.has(s.goal)) {
      moves++;
      lettuce.delete(move.to);
      if (remaining(s, chess, lettuce) === 0) return finish(stars(s, { moves }));
      chess = yellowAgain(chess);
      busy = false;
      setStatus('rounds');
      return;
    }
    board.checkSquare = chess.isCheck() ? kingSquare('b') : null;
    if (goalMet(s, move, chess)) return finish(stars(s, { attempts }));
    setStatus(s.goal === 'check' ? 'learn.wrong.check' : s.goal === 'mate' ? 'learn.wrong.mate' : 'learn.wrong');
    await sleep(1600);
    if (!active || stage() !== s) return;
    attempts++;
    chess = load(s.fen);
    board.setPosition(chess.board());
    board.lastMove = null;
    board.checkSquare = chess.isCheck() ? kingSquare('w') : null;
    busy = false;
    if (attempts >= 3) {
      // two misses: point at the snail that should move
      const hint = solvingMove(s);
      if (hint) select(hint.from);
      setStatus('learn.hintShown');
    } else setStatus('');
  }

  function finish(n) {
    done = true;
    busy = false;
    const key = `${lesson().id}.${si}`;
    progress[key] = Math.max(progress[key] || 0, n);
    writeProgress(progress);
    setStatus('learn.done', { stars: starText(n) });
    if (li + 1 === LESSONS.length && si + 1 === lesson().stages.length) $('learn-status').textContent += ' ' + t('learn.allDone');
    $('learn-next').hidden = false;
  }
  function next() {
    if (si + 1 < lesson().stages.length) { si++; startStage(); }
    else if (li + 1 < LESSONS.length) startLesson(li + 1);
    else showPicker();
  }

  $('learn-next').addEventListener('click', next);
  $('learn-restart').addEventListener('click', () => { if (active) startStage(); });
  $('learn-back').addEventListener('click', () => { if (active) { done = true; showPicker(); } });
  $('learn-exit').addEventListener('click', () => onExit());
  $('learn-pick-exit').addEventListener('click', () => onExit());

  return {
    active: () => active,
    open() {
      if (active) return showPicker();
      active = true;
      progress = readProgress();
      prevOnSquare = board.onSquare;
      board.onSquare = onSquare;
      document.body.classList.add('learning');
      showPicker();
    },
    close() {
      if (!active) return;
      active = false;
      board.onSquare = prevOnSquare;
      board.lettuce = null;
      board.checkSquare = null;
      board.lastMove = null;
      deselect();
      document.body.classList.remove('learning');
      $('learn-pick').hidden = true;
      $('learn-bar').hidden = true;
    },
    // after a language change
    refresh() {
      if (!active) return;
      if (!$('learn-pick').hidden) showPicker();
      if (!$('learn-bar').hidden) { renderBar(); setStatus(status.key, status.params); if (done) $('learn-next').hidden = false; }
    },
  };
}
