// Service worker: lets the card open offline and makes repeat visits instant.
// App files: network first (so updates show up straight away), cache as fallback.
// Firebase SDK + fonts: cache first (their URLs are versioned).
const VERSION = 'v1';
const CACHE = `loyalty-${VERSION}`;
const SHELL = [
  './', './index.html', './staff.html', './css/app.css',
  './js/card.js', './js/staff.js', './js/db.js', './js/db-firebase.js', './js/db-demo.js', './js/config.js',
  './js/logic.js', './js/i18n.js', './js/ui.js', './js/vendor/qrcode.mjs',
  './icons/icon-192.png', './icons/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('loyalty-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'www.gstatic.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(req));
  }
  // Everything else (Firestore, Auth) goes straight to the network — Firestore has its own offline cache.
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
