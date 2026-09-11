// Which snail is which piece. The hats come from Snäckmageddon's cosmetics
// (js/game/cosmetics.js), so a king is a snail with a crown and a pawn is a
// bare-headed one. Sizes make the hierarchy readable at a glance.
import { TEAM_COLORS } from './game/snails.js';

export const LOOKS = {
  k: { hat: 'crown', scale: 1.08, glyph: '♚' },
  q: { hat: 'tophat', scale: 1.0, glyph: '♛' },
  r: { hat: 'cap', scale: 0.95, glyph: '♜' },
  b: { hat: 'party', scale: 0.95, glyph: '♝' },
  n: { hat: 'viking', scale: 0.95, glyph: '♞' },
  p: { hat: 'none', scale: 0.78, glyph: '♟' },
};

// chess.js colours: w moves first. Yellow and blue are two of the four team
// colours in Snäckmageddon, so the same snails show up on the hub and in both games.
export const SIDE_COLORS = {
  w: TEAM_COLORS.find((c) => c.id === 'yellow').hex,
  b: TEAM_COLORS.find((c) => c.id === 'blue').hex,
};
