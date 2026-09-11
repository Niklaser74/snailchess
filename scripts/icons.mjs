#!/usr/bin/env node
// Renders icons/icon.svg to the PNG sizes the manifest needs, with the hub
// repo's Playwright (no dependency here). Run once when the icon changes:
//   node scripts/icons.mjs          (PLAYWRIGHT_DIR=../dev-snails/node_modules/playwright)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pw = resolve(root, process.env.PLAYWRIGHT_DIR || '../dev-snails/node_modules/playwright');
const { chromium } = await import(pathToFileURL(join(pw, 'index.mjs')).href);
const svg = readFileSync(join(root, 'icons', 'icon.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, { maskable = false } = {}) {
  // maskable: the safe zone is the inner 80 %, so paint the board colour behind and shrink the icon
  const inner = maskable ? Math.round(size * 0.8) : size;
  const off = Math.round((size - inner) / 2);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${maskable ? '#8db874' : 'transparent'}"><div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  return page.screenshot({ omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}
writeFileSync(join(root, 'icons', 'icon-192.png'), await render(192));
writeFileSync(join(root, 'icons', 'icon-512.png'), await render(512));
writeFileSync(join(root, 'icons', 'icon-512-maskable.png'), await render(512, { maskable: true }));
await browser.close();
console.log('icons: icon-192.png, icon-512.png, icon-512-maskable.png');
