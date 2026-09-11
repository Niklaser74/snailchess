// Service worker: cache-first app shell so the game works offline.
// Cache names are prefixed per game: everything on snails.se shares one origin.
const VERSION = 'snailchess-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/board.js',
  './js/duel.js',
  './js/ai.js',
  './js/ai-worker.js',
  './js/pieces.js',
  './js/i18n.js',
  './js/vendor/chess.js',
  './js/game/game.js',
  './js/game/terrain.js',
  './js/game/themes.js',
  './js/game/snails.js',
  './js/game/cosmetics.js',
  './js/game/audio.js',
  './js/game/rng.js',
  './js/game/dmath.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('snailchess-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
