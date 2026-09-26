/* Faizal Pharmacy — Service Worker
   Strategy:
   - The page itself (index.html): network-first. This is an actively updated
     site (new tools, new prices) — always try the network first, and only
     fall back to the cached copy if the visitor is offline. This avoids the
     classic PWA trap of showing stale content indefinitely.
   - Icons/manifest: cache-first (they basically never change).
   - Anything going to the backend API (faizal-backend.*.workers.dev) is
     NEVER intercepted — those requests must always hit the network live,
     since they're reading/writing real customer data.
*/

const CACHE_NAME = 'faizal-pharmacy-v2';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.hostname.endsWith('workers.dev') || url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;              // never cache POSTs (orders, consult, etc.)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !url.hostname.endsWith('workers.dev')) {
    // third-party (fonts/cdn) — just let the browser handle it normally
    return;
  }
  if (isApiRequest(url)) return;                  // backend calls: always live, never cached

  // Navigations (the page itself) — network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || new Response(
            '<!doctype html><html dir="rtl"><meta charset="utf-8">' +
            '<body style="font-family:sans-serif;padding:40px;text-align:center;line-height:2">' +
            '<h2>انٹرنیٹ دستیاب نہیں</h2><p>براہِ کرم انٹرنیٹ آن کریں اور دوبارہ کوشش کریں۔</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          ))
        )
    );
    return;
  }

  // Static assets (icons, manifest, images) — cache-first, but never cache
  // a failed (404/500) response — otherwise a temporarily-missing file
  // would stay "broken" forever, even after it's fixed on the server.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
