// Wolf service worker — offline cache + auto-update (stale-while-revalidate).
// The app loads instantly from cache and refreshes in the background; a new
// version appears the next time it's opened while online.
const CACHE = 'battletees-1784104562';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-180.png', 'icon-512.png', 'banner.jpg', 'wolf.png', 'wolfwin.png', 'wolfcage.png', 'nine.png', 'vegas.png', 'quota.png', 'sixes.png', 'umbrella.png', 'hammer.png', 'bbb.png', 'stroke.png', 'stableford.png', 'bestball.png', 'scramble.png', 'nassau.png', 'skins.png'];

// Safari refuses to let a service worker answer a page load with a response
// that arrived through a redirect ("Response served by service worker has
// redirections") — www→apex, http→https, or the old github.io URL can all
// taint a fetch. Rebuild such responses from their body so the flag is gone
// before anything is cached or served.
const clean = (resp) => {
  if (!resp || !resp.redirected) return Promise.resolve(resp);
  return resp.blob().then((b) => new Response(b, {status: resp.status, statusText: resp.statusText, headers: resp.headers}));
};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(CORE.map((u) =>
        fetch(new Request(u, {cache: 'reload'})).then(clean).then((r) => {
          if (r && r.status === 200) return c.put(u, r);
          throw new Error('core fetch failed: ' + u);
        })
      ))
    ).then(() => self.skipWaiting())
  );
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
  // The APP shell is only the root document. /welcome/ and /rules/* are their
  // own pages — they must NEVER fall back to the cached app, or a first visit
  // to a rules page serves the app instead.
  const path = new URL(req.url).pathname;
  const isApp = path === '/' || path === '/index.html';
  e.respondWith(
    caches.match(req)
      .then((hit) => hit || (isApp ? caches.match('index.html') : undefined))
      .then((cached) => {
        // belt & braces: never serve a redirect-tainted entry from an old cache
        const safeCached = cached && cached.redirected ? clean(cached) : Promise.resolve(cached);
        return safeCached.then((cachedResp) => {
          const network = (isApp ? fetch(req.url, {cache: 'no-store'}) : fetch(req)).then(clean).then((resp) => {
            if (resp && resp.status === 200) {
              const clone = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, clone));
            }
            return resp;
          }).catch(() => cachedResp);
          return cachedResp || network;
        });
      })
  );
});
