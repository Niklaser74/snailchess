// Snigelpost for chess: a match is a list of events on the server (see main.js
// `events`), one ply at a time. Host plays Yellow. Same Supabase project and
// accounts as Snäckmageddon (js/supa.js), own tables (supabase/migrations).
import { online } from './supa.js';

export const snigelpost = {
  available() { return online.available(); },
  create(name, mode) { return online.rpc('snailchess_create', { p_name: name, p_mode: mode }); },
  join(id, name) { return online.rpc('snailchess_join', { p_match: id, p_name: name }); },
  get(id) { return online.rpc('snailchess_get', { p_match: id }); },
  list() { return online.rpc('snailchess_my_matches'); },
  remove(id) { return online.rpc('snailchess_delete', { p_match: id }); },
  resign(id) { return online.rpc('snailchess_resign', { p_match: id }); },
  claimTimeout(id) { return online.rpc('snailchess_claim_timeout', { p_match: id }); },
  // events: the new entries this ply produced; result: { type, winner } when the
  // game ended; duel: the recording of this ply's duel, so the opponent sees the
  // same shot (null when nobody shot).
  submit(match, events, fen, hp, result, duel) {
    return online.rpc('snailchess_submit', { p_match: match.id, p_ply: match.ply_count + 1, p_events: events, p_fen: fen, p_hp: hp, p_result: result, p_duel: duel || null });
  },
  inviteLink(id) {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('match', id);
    return u.toString();
  },
  isMyTurn(m) { return m.status !== 'finished' && m.my_color === m.turn && !(m.status === 'open' && m.ply_count >= 1); },
  opponentName(m) { return m.names?.[m.my_color === 'w' ? 'b' : 'w'] || ''; },
  // days the opponent has been silent on their turn (0 otherwise)
  silentDays(m) {
    if (m.status !== 'playing' || m.turn === m.my_color) return 0;
    return Math.floor((Date.now() - new Date(m.updated_at).getTime()) / 86400000);
  },
};
