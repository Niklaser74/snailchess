// Shared staging for the pictures: a game that looks the same every time it is
// photographed. Positions come from fixed move lists and are opened the way a
// player would open them (Continue game), with reduced motion so nothing is
// caught mid-crawl. Rerun the scripts and you get the same pictures — which is
// what makes anyone willing to retake them when the game changes.
//
// Used by scripts/og-image.mjs and scripts/store-shots.mjs.
import { spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The hub repo owns the Playwright install; scripts/icons.mjs borrows it the
// same way rather than adding a dependency to a game with none.
export async function playwright() {
  const pw = resolve(root, process.env.PLAYWRIGHT_DIR || '../dev-snails/node_modules/playwright');
  return import(pathToFileURL(join(pw, 'index.mjs')).href);
}

export function serve(port) {
  return spawn(process.execPath, [join(root, 'scripts', 'serve.mjs')],
    { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
}

// The pictures must never sign anyone up. Every request to Supabase is cut,
// except the one the menu makes for the Snigelpost list, which gets the real
// empty answer ("no games yet"). A stored session that has not expired keeps
// the account client from asking for a token at all.
const SUPABASE = 'lygpfumngyebxoqqncet.supabase.co';

// The duel arena paints its flowers and ferns with Math.random (on purpose: it
// is decoration, never simulation), so a picture of a duel would grow new
// flowers every run. Seed it before any page script runs.
async function seededRandom(page) {
  await page.addInitScript(() => {
    let a = 0x5eed5;
    Math.random = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

export async function offline(page) {
  await seededRandom(page);
  await page.route((url) => url.hostname === SUPABASE, (route) => {
    if (route.request().url().includes('/rest/v1/rpc/snailchess_my_matches')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.abort();
  });
}

// A calm, fully developed Italian game: every kind of snail on the board, both
// sides castled, nothing taken yet. The picture of what the game looks like.
export const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O'];

const SETTINGS = { mode: 'gentle', opponent: 'human', side: 'w', speed: 'fast', hints: true, badges: true, flip: false, aimSelf: true, v: 2 };

// Opens a saved local game. moves: the event list (SAN), mode: the game mode,
// hp: kaos damage by square. Two players on one device, so no computer moves
// in between and either side can be tapped.
export async function stage(page, url, { moves = ITALIAN, mode = 'gentle', hp = {} } = {}) {
  await offline(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(({ moves, mode, hp, settings }) => {
    localStorage.clear();
    localStorage.setItem('snails.session', JSON.stringify({ access_token: 'pose.eyJzdWIiOiJwb3NlIn0.pose', refresh_token: 'pose', expires_at: Date.now() + 1e10, user_id: 'pose' }));
    localStorage.setItem('snailchess.lang', 'sv');
    localStorage.setItem('snailchess.name', JSON.stringify('Snäcka'));
    localStorage.setItem('snailchess.settings', JSON.stringify({ ...settings, mode }));
    localStorage.setItem('snailchess.game', JSON.stringify({ moves, hp, settings: { mode, opponent: 'human' }, humanSides: ['w', 'b'], over: false }));
  }, { moves, mode, hp, settings: SETTINGS });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#btn-continue');
  await page.waitForFunction(() => document.getElementById('menu').hidden && window.snailchess && !window.snailchess.busy);
  await page.waitForTimeout(300);
}

// Only the menu, with a mode chosen, for the picture of the choices.
export async function menu(page, url, mode = 'battle') {
  await offline(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(({ mode, settings }) => {
    localStorage.clear();
    localStorage.setItem('snails.session', JSON.stringify({ access_token: 'pose.eyJzdWIiOiJwb3NlIn0.pose', refresh_token: 'pose', expires_at: Date.now() + 1e10, user_id: 'pose' }));
    localStorage.setItem('snailchess.lang', 'sv');
    localStorage.setItem('snailchess.name', JSON.stringify('Snäcka'));
    localStorage.setItem('snailchess.settings', JSON.stringify({ ...settings, mode }));
  }, { mode, settings: SETTINGS });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('online-list').textContent.length > 0);
  await page.waitForTimeout(300);
}

// A tap on a square, through the board's own pointer handler.
export async function tap(page, square) {
  await page.evaluate((sq) => {
    const s = window.snailchess;
    const c = document.getElementById('board');
    const r = c.getBoundingClientRect();
    const b = s.board;
    const f = 'abcdefgh'.indexOf(sq[0]), rk = Number(sq[1]) - 1;
    const col = b.flipped ? 7 - f : f, row = b.flipped ? rk : 7 - rk;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + b.ox + col * b.sq + b.sq / 2, clientY: r.top + b.oy + row * b.sq + b.sq / 2, bubbles: true }));
  }, square);
}
