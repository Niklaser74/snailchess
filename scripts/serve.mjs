#!/usr/bin/env node
// Static server for local development, no dependencies. Serves the repo root
// like GitHub Pages does: directories fall back to index.html, unknown paths
// get 404.html with status 404. Other checkouts can be mounted under a path
// to rehearse the production layout on one origin (hub at "/", game at
// "/snailmageddon/"):
//   PORT=8081 node scripts/serve.mjs --mount /snailmageddon=../dev-snailmageddon
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8082;
const mounts = []; // [{ prefix: '/snailmageddon', dir: 'C:/dev-snailmageddon' }]
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--mount' && argv[i + 1]) {
    const [prefix, dir] = argv[++i].split('=');
    mounts.push({ prefix: prefix.replace(/\/$/, ''), dir: resolve(root, dir) });
  }
}
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

function send(res, file, status = 200) {
  res.writeHead(status, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const mount = mounts.find((m) => path === m.prefix || path.startsWith(m.prefix + '/'));
  if (mount && path === mount.prefix) { res.writeHead(301, { Location: mount.prefix + '/' }); return res.end(); }
  const base = mount ? mount.dir : root;
  let file = normalize(join(base, mount ? path.slice(mount.prefix.length) : path));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (existsSync(file) && statSync(file).isFile()) return send(res, file);
  // GitHub Pages: a project site's 404 is its own; the user site's 404.html covers the rest
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404');
}).listen(port, () => {
  console.log(`Snäckschack at http://localhost:${port}/`);
  for (const m of mounts) console.log(`  ${m.prefix}/ -> ${m.dir}`);
});
