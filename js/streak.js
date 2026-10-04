// Svitlistan: days in a row with a game finished (any mode) or a Snigelpost
// move made. The game always keeps its own count here, in localStorage, so a
// streak works offline and without an account. A player who joins the list
// gets an anonymous account (the first RPC creates it), and from then on each
// played day is also reported; the server's count is the one on the list.
// The day is Swedish time, as on the server (snailchess_today).
import { online } from './supa.js';

const KEY_DAYS = 'snailchess.streakDays';
const KEY_JOINED = 'snailchess.streakJoined';
const KEEP = 400; // days of history kept locally

// ---------- pure (tested in Node) ----------

// 'YYYY-MM-DD' in Europe/Stockholm for a moment.
export function stockholmDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function prevDay(day) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
// Days in a row ending today or yesterday (today is not over yet); 0 otherwise.
export function currentStreak(days, today) {
  const set = new Set(days);
  let d = set.has(today) ? today : set.has(prevDay(today)) ? prevDay(today) : null;
  let n = 0;
  while (d && set.has(d)) { n++; d = prevDay(d); }
  return n;
}
export function withDay(days, today) {
  return [...new Set([...days, today])].sort().slice(-KEEP);
}

// ---------- this browser ----------

function read(key, d) { try { const v = localStorage.getItem(key); return v == null ? d : JSON.parse(v); } catch { return d; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }
function drop(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

export const streak = {
  days: () => read(KEY_DAYS, []),
  local: () => currentStreak(read(KEY_DAYS, []), stockholmDay()),
  joined: () => !!read(KEY_JOINED, false) && online.signedIn(),

  // A game finished or a move made: today counts. Reported if on the list.
  markPlayed(name) {
    write(KEY_DAYS, withDay(read(KEY_DAYS, []), stockholmDay()));
    if (this.joined()) online.rpc('snailchess_streak_played', { p_name: name }).catch(() => { /* the next one will do */ });
  },
  board: () => online.rpc('snailchess_streak_board'),
  async join(name) {
    const b = await online.rpc('snailchess_streak_join', { p_name: name });
    write(KEY_JOINED, true);
    // today already played on this device? then the server counts it too
    if (read(KEY_DAYS, []).includes(stockholmDay())) await online.rpc('snailchess_streak_played', { p_name: name }).catch(() => {});
    return b;
  },
  async leave() {
    await online.rpc('snailchess_streak_leave');
    drop(KEY_JOINED);
  },
};
