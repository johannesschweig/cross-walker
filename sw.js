/* Minimal service worker: makes the game load instantly and work offline.
 * - Pages, scripts and art: network first (so a new deploy is picked up), cached copy when offline.
 * - Audio is never handled here: <audio> sends byte-range requests, which a cache can't answer. */
const CACHE = 'cross-walker-v1';
const CORE = [
  './', 'index.html', 'style.css', 'game.js', 'manifest.webmanifest',
  'assets/tilesheet.png', 'assets/spritesheet.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\.(mp3|ogg|wav)$/i.test(url.pathname) || url.pathname.endsWith('music-data.js') || req.headers.has('range')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
