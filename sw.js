// Offline support. Bump VERSION when the precache list changes; index.html
// itself is fetched network-first, so ordinary edits reach users without a bump.
const VERSION = 'v1';
const APP_CACHE = `timestables-app-${VERSION}`;
const FONT_CACHE = 'timestables-fonts';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('timestables-app-') && k !== APP_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, so a deploy shows up on the next online load; the cache
// covers offline and flaky connections.
async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' })
      || (request.mode === 'navigate' && await cache.match('./index.html'));
    if (cached) return cached;
    throw err;
  }
}

// Fonts never change at a given URL: serve from cache, refresh in the background.
// The refresh, including its cache write, is held open with waitUntil so the
// worker isn't stopped before the font is stored for offline use.
async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    // Opaque (no-cors) responses report status 0 but are still usable.
    if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
    return response;
  });
  if (!cached) return network;
  // Offline with a cached copy is the normal case here, not a failure.
  event.waitUntil(network.catch(() => {}));
  return cached;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});
