// The board: squares, highlights and the snails that are the pieces. Drawn on
// one canvas with Snäckmageddon's renderer (js/game/snails.js), so these are
// the same snails as on the hub and in the other games. The board knows
// nothing about the rules; main.js feeds it positions (chess.board()) and
// moves (chess.js verbose move objects) and it animates the crawl.
import { drawSnail } from './game/snails.js';
import { THEMES } from './game/themes.js';
import { LOOKS, SIDE_COLORS } from './pieces.js';

export const FILES = 'abcdefgh';
export const SPEEDS = { fast: 0.3, normal: 0.6, snail: 1.2 }; // seconds per square
const LIGHT = '#efe3c0', DARK = '#8db874', FRAME = '#6e4324', FRAME_DARK = '#4a2c16';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const now = () => performance.now() / 1000;

export class Board {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.flipped = false;
    this.pieces = [];
    this.anims = [];
    this.selected = null;
    this.targets = []; // verbose moves from the selected square
    this.lastMove = null; // { from, to }
    this.checkSquare = null;
    this.marks = null; // checkmate explanation: { king, attackers: [sq], blocked: [sq] }
    this.badges = true;
    this.coords = true;
    this.speed = SPEEDS.normal;
    this.reduced = opts.reduced ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.onSquare = null;
    this.W = 0; this.H = 0; this.size = 0; this.sq = 0; this.ox = 0; this.oy = 0;
    this.t0 = now();
    canvas.addEventListener('pointerdown', (e) => {
      const s = this.squareAt(e.clientX, e.clientY);
      if (s && this.onSquare) this.onSquare(s);
    });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    const loop = () => { if (!document.hidden) this.draw(now() - this.t0); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(200, Math.round(r.width));
    this.H = Math.max(200, Math.round(r.height));
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const inner = Math.min(this.W, this.H) - (this.coords ? 28 : 12);
    this.sq = Math.floor(inner / 8);
    this.size = this.sq * 8;
    this.ox = Math.round((this.W - this.size) / 2);
    this.oy = Math.round((this.H - this.size) / 2);
  }

  // ---------- geometry ----------
  // top-left pixel of a square given file/rank (0–7, may be fractional while crawling)
  cell(f, r) {
    const ff = this.flipped ? 7 - f : f, rr = this.flipped ? r : 7 - r;
    return { x: this.ox + ff * this.sq, y: this.oy + rr * this.sq };
  }
  squareAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const c = Math.floor((px - this.ox) / this.sq), row = Math.floor((py - this.oy) / this.sq);
    if (c < 0 || c > 7 || row < 0 || row > 7) return null;
    const f = this.flipped ? 7 - c : c, r = this.flipped ? row : 7 - row;
    return FILES[f] + (r + 1);
  }
  static fr(sq) { return { f: FILES.indexOf(sq[0]), r: Number(sq[1]) - 1 }; }

  // ---------- position ----------
  // rows = chess.board(): rows[0] is rank 8, each entry { type, color, square } or null
  setPosition(rows) {
    this.pieces = [];
    this.anims = [];
    rows.forEach((row, ri) => row.forEach((p, fi) => {
      if (!p) return;
      this.pieces.push({ type: p.type, color: p.color, f: fi, r: 7 - ri, sq: p.square, facing: p.color === 'w' ? 1 : -1, dying: null });
    }));
  }
  pieceAt(sq) { return this.pieces.find((p) => p.sq === sq && !p.dying) || null; }
  setSelection(sq, moves = []) { this.selected = sq; this.targets = moves; }

  // Crawl a piece from one square to another. Resolves when it has arrived.
  crawl(piece, toSq, opts = {}) {
    const to = Board.fr(toSq);
    const dist = Math.max(Math.abs(to.f - piece.f), Math.abs(to.r - piece.r));
    const dur = this.reduced ? 0 : clamp(dist * this.speed, 0.5, 5);
    return new Promise((resolve) => {
      const done = () => { piece.f = to.f; piece.r = to.r; piece.sq = toSq; if (opts.becomes) piece.type = opts.becomes; resolve(); };
      if (dur === 0) return done();
      this.anims.push({ piece, from: { f: piece.f, r: piece.r }, to, start: now(), dur, done });
    });
  }
  // The captured snail withdraws into its shell and fades away.
  fade(piece, delay = 0) {
    const dur = this.reduced ? 0 : 0.9;
    return new Promise((resolve) => {
      const go = () => {
        if (dur === 0) { this.pieces = this.pieces.filter((p) => p !== piece); return resolve(); }
        piece.dying = { start: now(), dur };
        setTimeout(() => { this.pieces = this.pieces.filter((p) => p !== piece); resolve(); }, dur * 1000);
      };
      if (delay > 0) setTimeout(go, delay * 1000); else go();
    });
  }

  // Animate a chess.js verbose move: the mover crawls, a castling rook
  // follows, the victim (also en passant) fades as the attacker arrives.
  // victimGone = true when the duel already took the victim off the board.
  async animateMove(move, { victimGone = false } = {}) {
    const mover = this.pieceAt(move.from);
    if (!mover) return;
    const victimSq = move.flags.includes('e') ? move.to[0] + move.from[1] : (move.captured ? move.to : null);
    const victim = victimSq ? this.pieceAt(victimSq) : null;
    const jobs = [];
    const dist = Math.max(Math.abs(Board.fr(move.to).f - mover.f), Math.abs(Board.fr(move.to).r - mover.r));
    const dur = this.reduced ? 0 : clamp(dist * this.speed, 0.5, 5);
    if (victim) jobs.push(victimGone ? this.fade(victim) : this.fade(victim, dur * 0.65));
    jobs.push(this.crawl(mover, move.to, { becomes: move.promotion }));
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const rank = move.from[1];
      const rook = this.pieceAt((move.flags.includes('k') ? 'h' : 'a') + rank);
      if (rook) jobs.push(this.crawl(rook, (move.flags.includes('k') ? 'f' : 'd') + rank));
    }
    await Promise.all(jobs);
  }

  // ---------- drawing ----------
  draw(t) {
    const { ctx, W, H, sq, ox, oy, size } = this;
    const th = THEMES.garden;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(0.6, th.sky[1]); sky.addColorStop(1, th.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // frame
    const m = this.coords ? 13 : 5;
    ctx.fillStyle = FRAME_DARK;
    ctx.beginPath(); ctx.roundRect(ox - m - 2, oy - m - 2, size + 2 * m + 4, size + 2 * m + 4, 10); ctx.fill();
    ctx.fillStyle = FRAME;
    ctx.beginPath(); ctx.roundRect(ox - m, oy - m, size + 2 * m, size + 2 * m, 8); ctx.fill();
    // squares
    for (let row = 0; row < 8; row++) for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (row + c) % 2 === 0 ? LIGHT : DARK;
      ctx.fillRect(ox + c * sq, oy + row * sq, sq, sq);
    }
    // coordinates
    if (this.coords) {
      ctx.fillStyle = '#f3e6cc';
      ctx.font = `700 ${Math.max(9, Math.round(sq * 0.2))}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) {
        const f = this.flipped ? 7 - i : i, r = this.flipped ? i : 7 - i;
        ctx.fillText(FILES[f], ox + i * sq + sq / 2, oy + size + m / 2 + 1);
        ctx.fillText(String(r + 1), ox - m / 2 - 1, oy + i * sq + sq / 2);
      }
    }
    // last move
    if (this.lastMove) {
      ctx.fillStyle = 'rgba(255, 213, 79, 0.35)';
      for (const s of [this.lastMove.from, this.lastMove.to]) { const { f, r } = Board.fr(s); const c = this.cell(f, r); ctx.fillRect(c.x, c.y, sq, sq); }
    }
    // check
    if (this.checkSquare) {
      const { f, r } = Board.fr(this.checkSquare); const c = this.cell(f, r);
      const g = ctx.createRadialGradient(c.x + sq / 2, c.y + sq / 2, sq * 0.1, c.x + sq / 2, c.y + sq / 2, sq * 0.7);
      g.addColorStop(0, 'rgba(226, 69, 60, 0.85)'); g.addColorStop(1, 'rgba(226, 69, 60, 0)');
      ctx.fillStyle = g; ctx.fillRect(c.x, c.y, sq, sq);
    }
    // selection
    if (this.selected) {
      const { f, r } = Board.fr(this.selected); const c = this.cell(f, r);
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = Math.max(3, sq * 0.06);
      ctx.strokeRect(c.x + ctx.lineWidth / 2, c.y + ctx.lineWidth / 2, sq - ctx.lineWidth, sq - ctx.lineWidth);
    }
    // animations
    const tn = now();
    for (const a of this.anims) {
      const k = clamp((tn - a.start) / a.dur, 0, 1);
      const e = ease(k);
      a.piece.f = a.from.f + (a.to.f - a.from.f) * e;
      a.piece.r = a.from.r + (a.to.r - a.from.r) * e;
      a.piece.walking = k < 1;
      const dx = this.flipped ? -(a.to.f - a.from.f) : (a.to.f - a.from.f);
      if (dx !== 0) a.piece.facing = Math.sign(dx);
      if (k >= 1) { a.piece.walking = false; a.done(); }
    }
    this.anims = this.anims.filter((a) => tn - a.start < a.dur);
    // pieces, back rows first so the front ones overlap
    const list = [...this.pieces].sort((p, q) => this.cell(p.f, p.r).y - this.cell(q.f, q.r).y);
    for (const p of list) {
      const c = this.cell(p.f, p.r);
      const look = LOOKS[p.type];
      let alpha = 1;
      if (p.dying) alpha = clamp(1 - (tn - p.dying.start) / p.dying.dur, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      drawSnail(ctx, 'cartoon', {
        x: c.x + sq / 2, y: c.y + sq * 0.86, facing: p.facing,
        color: SIDE_COLORS[p.color], scale: (sq / 62) * look.scale, t: t + p.f * 0.7 + p.r * 1.3,
        walking: !!p.walking && !this.reduced, dead: !!p.dying, look: { shell: 'spiral', hat: look.hat },
      });
      ctx.restore();
      if (this.badges && !p.dying) {
        const rr = sq * 0.13;
        ctx.fillStyle = 'rgba(255, 250, 240, 0.92)';
        ctx.strokeStyle = 'rgba(74, 46, 28, 0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c.x + rr + 3, c.y + rr + 3, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = SIDE_COLORS[p.color] === SIDE_COLORS.w ? '#8a6a00' : '#1f4aa0';
        ctx.font = `${Math.round(rr * 1.7)}px "Segoe UI Symbol", "DejaVu Sans", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(look.glyph, c.x + rr + 3, c.y + rr + 4);
      }
    }
    // checkmate explanation: the attackers, their lines to the king, and the squares the king cannot use
    if (this.marks) {
      const k = Board.fr(this.marks.king), kc = this.cell(k.f, k.r);
      ctx.strokeStyle = 'rgba(226, 69, 60, 0.9)'; ctx.lineWidth = Math.max(3, sq * 0.07); ctx.lineCap = 'round';
      for (const s of this.marks.blocked) {
        const c0 = this.cell(Board.fr(s).f, Board.fr(s).r), pad = sq * 0.3;
        ctx.beginPath(); ctx.moveTo(c0.x + pad, c0.y + pad); ctx.lineTo(c0.x + sq - pad, c0.y + sq - pad); ctx.moveTo(c0.x + sq - pad, c0.y + pad); ctx.lineTo(c0.x + pad, c0.y + sq - pad); ctx.stroke();
      }
      for (const s of this.marks.attackers) {
        const a = Board.fr(s), ac = this.cell(a.f, a.r);
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = Math.max(4, sq * 0.08);
        ctx.beginPath(); ctx.arc(ac.x + sq / 2, ac.y + sq / 2, sq * 0.44, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([sq * 0.12, sq * 0.1]);
        ctx.beginPath(); ctx.moveTo(ac.x + sq / 2, ac.y + sq / 2); ctx.lineTo(kc.x + sq / 2, kc.y + sq / 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // legal targets on top of everything
    for (const mv of this.targets) {
      const { f, r } = Board.fr(mv.to); const c = this.cell(f, r);
      ctx.fillStyle = 'rgba(31, 23, 16, 0.35)';
      ctx.strokeStyle = 'rgba(31, 23, 16, 0.45)';
      if (mv.captured) { ctx.lineWidth = Math.max(3, sq * 0.07); ctx.beginPath(); ctx.arc(c.x + sq / 2, c.y + sq / 2, sq * 0.42, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(c.x + sq / 2, c.y + sq / 2, sq * 0.13, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}
