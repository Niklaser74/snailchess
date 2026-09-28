// Learn chess: the lessons as data, and the rules that judge them. No DOM here,
// so test/lessons.test.mjs can prove every stage is solvable.
//
// A lesson teaches one thing in a few short stages. Yellow (white) always
// moves; Blue never replies. Stage goals:
//   eat        crawl onto every lettuce leaf (a leaf is eaten when a snail lands on it)
//   capture    take every blue snail (they stand still)
//   check      give check in one move
//   escape     get your king out of check (the position only allows the method taught)
//   mate       give checkmate in one move
//   castle     castle (the position only allows the side taught)
//   enpassant  take en passant
//   promote    reach the last rank with a pawn
// hint: a key, or a list of keys shown as lines, under the goal.
// only: the one piece type that may move (the rest are there to be jumped over).
// Boards without kings are fine: they are loaded with skipValidation.
import { Chess } from './vendor/chess.js';

export const LESSONS = [
  { id: 'rook', piece: 'r', stages: [
    { fen: '8/8/8/8/8/8/8/R7 w - - 0 1', goal: 'eat', lettuce: ['a7'] },
    { fen: '8/8/8/8/8/8/8/R7 w - - 0 1', goal: 'eat', lettuce: ['a7', 'f7'] },
    { fen: '8/8/8/8/3R4/8/8/8 w - - 0 1', goal: 'eat', lettuce: ['d8', 'h8', 'h1', 'b1', 'b6'] },
  ] },
  { id: 'bishop', piece: 'b', stages: [
    { fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', goal: 'eat', lettuce: ['g5'] },
    { fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', goal: 'eat', lettuce: ['a3', 'f8', 'h6'] },
    // one bishop on each colour: each can only eat the leaves on its own colour
    { fen: '8/8/8/8/8/8/8/2B2B2 w - - 0 1', goal: 'eat', lettuce: ['e3', 'a5', 'b5', 'h3'], hint: 'learn.bishop.colour' },
  ] },
  { id: 'queen', piece: 'q', stages: [
    { fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', goal: 'eat', lettuce: ['d6', 'h2'] },
    { fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1', goal: 'eat', lettuce: ['a7', 'g7', 'b1', 'h4', 'd8'] },
  ] },
  { id: 'king', piece: 'k', stages: [
    { fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', goal: 'eat', lettuce: ['e2', 'f3'] },
    { fen: '8/8/8/8/3K4/8/8/8 w - - 0 1', goal: 'eat', lettuce: ['c5', 'e5', 'e3', 'c3'] },
  ] },
  { id: 'knight', piece: 'n', stages: [
    { fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', goal: 'eat', lettuce: ['c3'] },
    { fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', goal: 'eat', lettuce: ['c3', 'd5', 'f6'] },
    // boxed in by its own pawns, which it simply jumps over
    { fen: '8/8/8/2PPP3/2PNP3/2PPP3/8/8 w - - 0 1', goal: 'eat', lettuce: ['e6', 'f4', 'c2'], only: 'n', hint: 'learn.knight.jump' },
  ] },
  { id: 'pawn', piece: 'p', stages: [
    { fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', goal: 'eat', lettuce: ['e4', 'e5', 'e6'], hint: 'learn.pawn.two' },
    // a zigzag: every capture sets up the next
    { fen: '8/8/8/4p3/3p4/4p3/3P4/8 w - - 0 1', goal: 'capture', hint: 'learn.pawn.take' },
    { fen: '8/4P3/8/8/8/8/8/8 w - - 0 1', goal: 'promote' },
  ] },
  { id: 'capture', piece: 'r', stages: [
    { fen: '4p3/8/8/p3p3/8/8/8/R7 w - - 0 1', goal: 'capture' },
    { fen: '8/1n6/8/5b2/8/2r5/8/3Q4 w - - 0 1', goal: 'capture' },
  ] },
  { id: 'check', piece: 'k', stages: [
    { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', goal: 'check' },
    { fen: '4k3/8/8/8/4N3/8/8/4K3 w - - 0 1', goal: 'check' },
  ] },
  { id: 'escape', piece: 'k', stages: [
    { fen: '4k3/8/8/8/8/8/8/r3K3 w - - 0 1', goal: 'escape', method: 'flee', hint: 'learn.escape.flee' },
    { fen: '4k3/8/8/8/8/5B2/6PP/r6K w - - 0 1', goal: 'escape', method: 'block', hint: 'learn.escape.block' },
    { fen: 'k7/8/8/8/4R3/8/6PP/4r2K w - - 0 1', goal: 'escape', method: 'take', hint: 'learn.escape.take' },
  ] },
  { id: 'mate', piece: 'q', stages: [
    { fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', goal: 'mate' },
    { fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', goal: 'mate' },
    { fen: '6rk/6pp/8/4N3/8/8/8/6K1 w - - 0 1', goal: 'mate' },
  ] },
  { id: 'castle', piece: 'k', stages: [
    { fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1', goal: 'castle', hint: ['learn.castle.short', 'learn.castle.rule'] },
    { fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', goal: 'castle', hint: ['learn.castle.long', 'learn.castle.rule'] },
  ] },
  { id: 'enpassant', piece: 'p', stages: [
    { fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', goal: 'enpassant' },
  ] },
];

// Goals where Blue has pieces to lose and nothing else happens: the stage goes on
// move after move, and Yellow is simply given the move back each time.
export const ROUNDS = new Set(['eat', 'capture']);

export function load(fen) { return new Chess(fen, { skipValidation: true }); }

// Yellow to move again, with no en passant chance left over from its own move.
export function yellowAgain(chess) {
  const f = chess.fen().split(' ');
  f[1] = 'w'; f[3] = '-';
  return load(f.join(' '));
}

// The moves Yellow may make here (optionally from one square), honouring `only`.
export function allowedMoves(chess, stage, square) {
  const list = chess.moves({ verbose: true, ...(square ? { square } : {}) });
  return stage.only ? list.filter((m) => m.piece === stage.only) : list;
}

// Blue snails still on the board (the king does not count: it is there for the rules).
export function blueLeft(chess) {
  return chess.board().flat().filter((p) => p && p.color === 'b' && p.type !== 'k').length;
}

// What is left to do in a round-based stage: leaves to eat, or snails to take.
export function remaining(stage, chess, lettuce) {
  return stage.goal === 'eat' ? lettuce.size : blueLeft(chess);
}

// Did this single move do what the stage asked? (chess is the position after it)
export function goalMet(stage, move, chess) {
  switch (stage.goal) {
    case 'check': return chess.isCheck();
    case 'mate': return chess.isCheckmate();
    case 'escape': return true; // only escaping moves are legal, and the position allows only the method taught
    case 'castle': return move.flags.includes('k') || move.flags.includes('q');
    case 'enpassant': return move.flags.includes('e');
    case 'promote': return !!move.promotion;
    default: return false;
  }
}

// The fewest moves that finish a round-based stage, found by breadth-first
// search. It runs in the browser when a stage starts, so it uses chess.js's
// internal 0x88 API like js/ai.js does (see the note there): the public move()
// regenerates every move and its SAN for each step and made this 4 s instead
// of a blink. One Chess instance is reloaded per position; each move is made
// and undone on it. Memoised per stage.
const FILES = 'abcdefgh';
const algebraic = (i) => FILES[i & 0xf] + (8 - (i >> 4));
const parCache = new Map();
export function par(stage) {
  if (!ROUNDS.has(stage.goal)) return 1;
  const key = stage.fen + '|' + (stage.lettuce || []).join(',');
  if (parCache.has(key)) return parCache.get(key);
  const eat = stage.goal === 'eat';
  const c = load(stage.fen);
  // a state is Yellow's board plus what is left: the leaves (eat) or how many blue snails (capture)
  const start = { board: stage.fen.split(' ')[0], left: eat ? [...stage.lettuce].sort() : blueLeft(c) };
  const id = (s) => s.board + '|' + (eat ? s.left.join(',') : s.left);
  const seen = new Set([id(start)]);
  let frontier = [start], depth = 0, found = Infinity;
  while (frontier.length && found === Infinity && depth < 30) {
    depth++;
    const next = [];
    for (const s of frontier) {
      c.load(s.board + ' w - - 0 1', { skipValidation: true });
      for (const m of c._moves({ legal: true })) {
        if (stage.only && m.piece !== stage.only) continue;
        const to = algebraic(m.to);
        const left = eat ? s.left.filter((q) => q !== to) : s.left - (m.captured ? 1 : 0);
        if (eat ? left.length === 0 : left === 0) { found = depth; break; }
        c._makeMove(m);
        const n = { board: c.fen().split(' ')[0], left };
        c._undoMove();
        const k = id(n);
        if (!seen.has(k)) { seen.add(k); next.push(n); }
      }
      if (found !== Infinity) break;
    }
    frontier = next;
  }
  parCache.set(key, found);
  return found;
}

// Stars for a finished stage: rounds by moves against the best possible,
// one-move goals by how many tries it took.
export function stars(stage, { moves, attempts }) {
  if (ROUNDS.has(stage.goal)) {
    const best = par(stage);
    return moves <= best ? 3 : moves <= best + 2 ? 2 : 1;
  }
  return attempts <= 1 ? 3 : attempts === 2 ? 2 : 1;
}

// A move that solves a one-move stage, for the hint after two misses.
export function solvingMove(stage) {
  const c = load(stage.fen);
  for (const m of allowedMoves(c, stage)) {
    const after = load(stage.fen);
    const mv = after.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
    if (goalMet(stage, mv, after)) return mv;
  }
  return null;
}
