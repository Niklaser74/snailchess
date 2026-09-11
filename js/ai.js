// The computer opponent: a small negamax with alpha-beta on top of chess.js.
// Pure and Node-friendly (test/rules.test.mjs runs it). Runs in a Web Worker
// in the browser (js/ai-worker.js). Levels:
//   easy    picks a random move, likes captures, never looks ahead
//   normal  two plies
//   hard    three plies
// Nothing here needs to be deterministic; there is no replay in this game.
//
// Speed: chess.js's public move()/moves() regenerate every legal move and its
// SAN on each call, which makes a search ten times slower than it has to be.
// The search therefore uses the internal 0x88 API of the vendored build
// (js/vendor/chess.js 1.4.0, pinned): _moves(), _makeMove(), _undoMove(),
// _board. If chess.js is ever upgraded, run the tests.
import { Chess } from './vendor/chess.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;
export const LEVELS = { easy: 0, normal: 2, hard: 3 };
const FILES = 'abcdefgh';
const algebraic = (i) => FILES[i & 0xf] + (8 - (i >> 4));

// Material plus a little pull towards the centre. From white's point of view.
export function evaluate(chess) {
  let score = 0;
  const b = chess._board;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = b[i];
    if (!p) continue;
    const f = i & 0xf, r = i >> 4; // r 0 = rank 8
    let v = VALUE[p.type];
    if (p.type !== 'k' && p.type !== 'r') v += 6 - Math.abs(3.5 - f) - Math.abs(3.5 - r); // 0–6 centre bonus
    if (p.type === 'p') v += p.color === 'w' ? (6 - r) * 2 : (r - 1) * 2;          // advanced pawns
    score += p.color === 'w' ? v : -v;
  }
  return score;
}

function ordered(chess, random) {
  const moves = chess._moves({ legal: true });
  for (const m of moves) m._k = (m.captured ? VALUE[m.captured] * 10 - VALUE[m.piece] : 0) + (m.promotion ? 800 : 0) + random() * 5;
  return moves.sort((a, b) => b._k - a._k);
}

function negamax(chess, depth, alpha, beta, sign, random) {
  const moves = ordered(chess, random);
  if (moves.length === 0) return chess.isCheck() ? -(MATE + depth) : 0; // mated (sooner is worse for us) or stalemate
  if (depth === 0) return sign * evaluate(chess);
  let best = -Infinity;
  for (const m of moves) {
    chess._makeMove(m);
    const s = -negamax(chess, depth - 1, -beta, -alpha, -sign, random);
    chess._undoMove();
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Returns { from, to, promotion } for chess.move(), or null if there is no move.
export function pickMove(fen, level = 'normal', random = Math.random) {
  const chess = new Chess(fen);
  const moves = ordered(chess, random);
  if (moves.length === 0) return null;
  const strip = (m) => ({ from: algebraic(m.from), to: algebraic(m.to), promotion: m.promotion });
  const depth = LEVELS[level] ?? LEVELS.normal;
  if (depth === 0) {
    const caps = moves.filter((m) => m.captured);
    const pool = caps.length && random() < 0.6 ? caps : moves;
    return strip(pool[Math.floor(random() * pool.length)]);
  }
  const sign = chess.turn() === 'w' ? 1 : -1;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    chess._makeMove(m);
    const s = -negamax(chess, depth - 1, -Infinity, Infinity, -sign, random);
    chess._undoMove();
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return strip(best);
}
