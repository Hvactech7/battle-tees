// KILL SWITCH — was the app's service worker when the app lived at the domain
// root. The app now lives at /app/ with its own worker, so this one exists only
// to retire the old registration on the next visit from an existing install.
//
// Without this, a phone that installed the app from "/" keeps its old worker at
// scope "/" and would go on serving the CACHED APP over the new marketing page.
//
// The 'bt-tiles' cache is deliberately preserved: caches are per-origin, not
// per-scope, so downloaded offline course maps survive the move to /app/.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== 'bt-tiles').map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({type: 'window'}))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});

// Never answer a fetch from cache while winding down — always go to network.
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
