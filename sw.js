// Wolf service worker — offline cache + auto-update (stale-while-revalidate).
// The app loads instantly from cache and refreshes in the background; a new
// version appears the next time it's opened while online.
const CACHE = 'battletees-1783748107';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-180.png', 'icon-512.png', 'crest.jpg', 'banner.jpg', 'wolf.png', 'nine.png', 'vegas.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const isShell = req.mode === 'navigate' || req.url.endsWith('/') || req.url.endsWith('index.html');
      const network = (isShell ? fetch(req.url, {cache: 'no-store'}) : fetch(req)).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
