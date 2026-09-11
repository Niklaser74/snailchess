// Module worker so the board keeps animating while the computer thinks.
import { pickMove } from './ai.js';

onmessage = (e) => {
  const { id, fen, level } = e.data;
  postMessage({ id, move: pickMove(fen, level) });
};
