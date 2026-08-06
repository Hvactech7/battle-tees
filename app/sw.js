// Wolf service worker — offline cache + auto-update (stale-while-revalidate).
// The app loads instantly from cache and refreshes in the background; a new
// version appears the next time it's opened while online.
const CACHE = 'battletees-1785996394';
// Offline course-map pack: satellite tiles cached cache-first, SURVIVES app
// updates (excluded from the activate cleanup below).
const TILES = 'bt-tiles';
const CORE = ['./', 'index.html', 'manifest.json', '/icon-180.png', '/icon-512.png', '/banner.jpg', '/wolf.png', '/wolfwin.png', '/wolfcage.png', '/nine.png', '/vegas.png', '/quota.png', '/sixes.png', '/umbrella.png', '/hammer.png', '/bbb.png', '/stroke.png', '/stableford.png', '/bestball.png', '/scramble.png', '/nassau.png', '/skins.png'];

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) {
    // satellite tiles: cache-first so preloaded holes open instantly offline
    if (u.hostname.endsWith('arcgisonline.com') && u.pathname.includes('/World_Imagery/MapServer/tile/')) {
      e.respondWith(
        caches.open(TILES).then((c) =>
          c.match(req).then((hit) => hit || fetch(req).then((r) => {
            if (r && (r.status === 200 || r.type === 'opaque')) c.put(req, r.clone());
            return r;
          }))
        )
      );
    }
    return;
  }
  // The app shell is the /app/ document. The marketing page at / and the
  // /rules/* pages are separate documents outside this worker's scope.
  const path = new URL(req.url).pathname;
  // relay.json tells the app where the live-sync relay lives. It MUST be
  // network-first — a cache-first copy would pin every phone to a dead host
  // forever. Falls back to the cached copy when offline.
  if (path.endsWith('/relay.json')) {
    e.respondWith(
      fetch(req, {cache: 'no-store'}).then((r) => {
        if (r && r.status === 200) {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }
  const isApp = path === '/app/' || path === '/app/index.html';
  // ---- the app document: NETWORK-FIRST -------------------------------------
  // Stale-while-revalidate used to serve the cached copy and refresh the cache
  // behind it, so a new build only appeared on the NEXT launch — which is why
  // updating took two or three restarts. Going to the network first means an
  // online launch is always the current build; the cache is the fallback, so
  // opening it with no signal on the course still works instantly.
  if (isApp) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const fresh = fetch(req.url, {cache: 'no-store'}).then(clean).then((resp) => {
        if (resp && resp.status === 200) cache.put('index.html', resp.clone());
        return resp;
      });
      // Don't let a dead-slow connection hold the app hostage — after a short
      // wait, serve what we have. The fetch above still finishes and updates
      // the cache for next time.
      const timed = new Promise((res) => setTimeout(() => res(null), 3000));
      try {
        const won = await Promise.race([fresh.catch(() => null), timed]);
        if (won && won.status === 200) return won;
      } catch (err) { /* fall through to cache */ }
      const cached = await cache.match('index.html') || await cache.match('./');
      if (cached) return cached.redirected ? clean(cached) : cached;
      return fresh;
    })());
    return;
  }

  // ---- everything else: cache-first, refreshed in the background ------------
  e.respondWith(
    caches.match(req)
      .then((cached) => {
        const safeCached = cached && cached.redirected ? clean(cached) : Promise.resolve(cached);
        return safeCached.then((cachedResp) => {
          const network = fetch(req).then(clean).then((resp) => {
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
