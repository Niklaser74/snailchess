#!/usr/bin/env node
// Press shots for a store listing: docs/store/screenshots/*.png, plus the itch
// cover docs/store/cover-630x500.png.
//
// Phone-shaped for the board, because that is where the game is played; a
// phone held sideways for the duel, because the arena is wide; one wide frame
// for listings that want landscape. Every position comes from a fixed move list
// (scripts/pose.mjs) and every duel from a fixed capture, so a rerun gives the
// same pictures.
//
//   npm run shots
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, playwright, serve, stage, menu, tap } from './pose.mjs';

const out = join(root, 'docs', 'store', 'screenshots');
mkdirSync(out, { recursive: true });

const port = Number(process.env.PORT) || 8095;
const server = serve(port);
const url = `http://localhost:${port}/?lang=sv`;

const shot = async (page, name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, name) });
  console.log('wrote docs/store/screenshots/' + name);
};
const phone = (browser) => browser.newPage({ viewport: { width: 1080 / 3, height: 1920 / 3 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });

try {
  await new Promise((r) => setTimeout(r, 700));
  const { chromium } = await playwright();
  const browser = await chromium.launch();

  // ---------- 1: the board, with a knight picked up and its squares shown ----------
  let page = await phone(browser);
  await stage(page, url);
  await tap(page, 'f3');
  await shot(page, '1-bradet.png');
  await page.close();

  // ---------- 2: aiming it yourself, in battle ----------
  // 1. e4 d5, and Yellow takes on d5: a pawn duel in battle mode, where you
  // shoot. The duel is paused mid-charge so the power bar, the clock and the
  // dotted path hold still for the picture. The aim comes from the game's own
  // shot planner: a hand-picked angle pointed into the hill in front of the
  // snail, the slime stuck at once, and the dotted path was a single dot.
  page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await stage(page, url, { moves: ['e4', 'd5'], mode: 'battle' });
  await tap(page, 'e4');
  await tap(page, 'd5');
  await page.waitForFunction(() => window.snailchess.duel && window.snailchess.duel.duel.myTurn(), null, { timeout: 15000 });
  const plan = await page.evaluate(async () => {
    const { AI_LEVELS } = await import('./js/game/game.js');
    const d = window.snailchess.duel.duel, g = d.game;
    g.paused = true;
    // how far the duel had ticked before the pause depends on the machine, so
    // put back what drifts with it: the clouds move a step per tick (they are
    // not drawn from the time), water and snails sway with the time, and the
    // clock counts down
    for (const c of g.clouds) c.x -= c.v * g.tickCount / 60;
    g.time = 0;
    g.timer = g.rules.turnTime;
    const p = g.planShot(d.attacker, d.defender, 0, AI_LEVELS.normal);
    d.attacker.facing = p.facing;
    d.attacker.aim = p.aim;
    g.charging = true;
    g.power = p.power;
    return { aim: +p.aim.toFixed(2), power: +p.power.toFixed(2), dots: g.previewPath(d.attacker, g.weaponId, p.power).length };
  });
  if (plan.dots < 10) throw new Error(`the aim shows no path (${JSON.stringify(plan)})`);
  await page.waitForTimeout(700);
  await shot(page, '2-sikta.png');
  await page.close();

  // ---------- 3: checkmate, explained ----------
  // Scholar's mate: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#. After the replay
  // the king tries its only way out and the game says why it cannot stay.
  page = await phone(browser);
  await stage(page, url, { moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'] });
  await tap(page, 'h5');
  await tap(page, 'f7');
  await page.waitForFunction(() => {
    const note = document.getElementById('mate-note');
    return !note.hidden && /stå kvar/.test(document.getElementById('mate-text').textContent);
  }, null, { timeout: 30000 });
  await shot(page, '3-schackmatt.png');
  await page.close();

  // ---------- 4: kaos, where damage stays on the snails ----------
  // A Scandinavian after a few trades; the snails that have been in duels carry
  // their cracks and a health bar (full health is 60 in kaos).
  page = await phone(browser);
  await stage(page, url, {
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3', 'Bf5'],
    mode: 'kaos',
    hp: { a5: 17, c3: 38, f5: 29 },
  });
  await shot(page, '4-kaos.png');
  await page.close();

  // ---------- 5: the menu, with the modes ----------
  page = await phone(browser);
  await menu(page, url, 'battle');
  await shot(page, '5-menyn.png');
  await page.close();

  // ---------- 6: one wide frame, with the move list ----------
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await stage(page, url);
  await shot(page, '6-bred.png');
  await page.close();

  // ---------- the itch cover, 630x500 ----------
  // The board in the lower part, the name above it on the sky. The board's
  // canvas paints its own sky from its top edge (128 px) to its bottom (490 px),
  // stops at 0, 60 and 100 %; the page repeats those stops in pixels and is
  // flat blue above, so there is no seam where the canvas begins.
  page = await browser.newPage({ viewport: { width: 630, height: 500 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await stage(page, url);
  await page.addStyleTag({ content: `
    html, body { background: linear-gradient(180deg, #5fb0ea 128px, #bfe3ff 345px, #f6e6c8 490px) !important; }
    #hud, #moves, #menu, #over, #mate-note { display: none !important; }
    #stage { top: 128px !important; bottom: 10px !important; left: 0 !important; right: 0 !important;
      padding: 0 !important; grid-template-columns: minmax(0, 1fr) !important; }
    .cover-cap { position: fixed; left: 0; right: 0; top: 18px; z-index: 5; text-align: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f1710; }
    .cover-cap b { display: inline-block; font-size: 50px; font-weight: 900; letter-spacing: -0.02em; line-height: 1;
      padding: 12px 24px 14px; border-radius: 18px; background: rgba(255, 250, 240, 0.94); border: 1px solid #e0d4c2;
      box-shadow: 0 16px 40px rgba(0,0,0,0.16); }
    .cover-cap span { display: block; font-size: 19px; font-weight: 800; margin-top: 10px; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.35); }
  ` });
  await page.evaluate(() => {
    const cap = document.createElement('div');
    cap.className = 'cover-cap';
    cap.innerHTML = '<b>Snäckschack</b><span>Schack med sniglar</span>';
    document.body.append(cap);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(root, 'docs', 'store', 'cover-630x500.png') });
  console.log('wrote docs/store/cover-630x500.png');
  await page.close();

  await browser.close();
} finally {
  server.kill();
}
