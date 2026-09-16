#!/usr/bin/env node
// Renders icons/og-1200x630.png, the picture a shared link shows: a real frame
// of the board with the name beside it, not a mock-up. The position is staged
// by scripts/pose.mjs from a fixed move list, so a rerun gives the same image.
//
//   npx playwright install chromium   (once, in the hub repo)
//   npm run og:image
import { join } from 'node:path';
import { root, playwright, serve, stage } from './pose.mjs';

const port = Number(process.env.PORT) || 8096;
const server = serve(port);

try {
  await new Promise((r) => setTimeout(r, 700));
  const { chromium } = await playwright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });

  await stage(page, `http://localhost:${port}/?lang=sv`);

  // The board keeps to the right; the page behind it gets the same sky as the
  // board's own canvas (the garden theme: stops at 0, 60 and 100 % of the
  // canvas, which runs from 22 to 608 px), so there is no seam between them.
  // The name sits on a cream card like the hub's hero, which reads on the sky
  // without a dark scrim.
  await page.addStyleTag({ content: `
    html, body { background: linear-gradient(180deg, #5fb0ea 22px, #bfe3ff 374px, #f6e6c8 608px) !important; }
    #hud, #moves, #menu, #over, #mate-note { display: none !important; }
    #stage { left: 560px !important; right: auto !important; top: 22px !important; bottom: auto !important;
      width: 616px !important; height: 586px !important;
      padding: 0 !important; grid-template-columns: minmax(0, 1fr) !important; }
    .og-card { position: fixed; left: 48px; top: 50%; transform: translateY(-50%); width: 470px; z-index: 5;
      box-sizing: border-box; padding: 34px 36px 30px; border-radius: 22px;
      background: rgba(255, 250, 240, 0.94); border: 1px solid #e0d4c2; box-shadow: 0 24px 60px rgba(0,0,0,0.18);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f1710; }
    .og-card b { display: block; font-size: 60px; font-weight: 900; letter-spacing: -0.02em; line-height: 1; }
    .og-card span { display: block; font-size: 25px; font-weight: 600; line-height: 1.35; margin-top: 16px; color: #3a2e22; }
    .og-card small { display: block; font-size: 19px; font-weight: 800; margin-top: 22px; color: #3aaa5c; letter-spacing: 0.01em; }
  ` });
  await page.evaluate(() => {
    const card = document.createElement('div');
    card.className = 'og-card';
    card.innerHTML = '<b>Snäckschack</b>'
      + '<span>Schack med sniglar. Pjäserna kryper till sin ruta, och slagen kan avgöras i en duell.</span>'
      + '<small>snails.se/snailchess</small>';
    document.body.append(card);
  });
  await page.waitForTimeout(700); // the board canvas has to pick up its new size and redraw

  await page.screenshot({ path: join(root, 'icons', 'og-1200x630.png') });
  await browser.close();
  console.log('wrote icons/og-1200x630.png');
} finally {
  server.kill();
}
