// Keep recently cached, public hashed bundles available to tabs still running an older build.
// Never copy account data or API responses, and never make an update depend on spare cache space.
const LEGACY_ASSETS = 'meety-previous-assets-v1';
const MAX_LEGACY_ASSETS = 180;
const HASHED_CODE = /^\/assets\/[^/]+-[a-zA-Z0-9_-]{6,}\.(?:js|css)$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const previous = (await caches.keys()).filter((name) => name.startsWith('workbox-precache-'));
      const retained = await caches.open(LEGACY_ASSETS);
      for (const name of previous) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (url.origin !== self.location.origin || !HASHED_CODE.test(url.pathname)) continue;
          const response = await cache.match(request);
          const type = response?.headers.get('content-type') ?? '';
          if (!response?.ok || !/^(?:text\/css|(?:text|application)\/(?:javascript|x-javascript))/i.test(type)) continue;
          url.search = '';
          await retained.put(url.href, response);
        }
      }
      const entries = await retained.keys();
      for (const request of entries.slice(0, Math.max(0, entries.length - MAX_LEGACY_ASSETS))) {
        await retained.delete(request);
      }
    } catch {
      // A full or unavailable cache must not prevent the new worker from installing.
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (HASHED_CODE.test(url.pathname)) {
    // The active precache or the bounded previous-build cache can serve an old tab offline.
    event.stopImmediatePropagation();
    event.respondWith((async () => {
      try {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
      } catch { /* Fall through to the network. */ }
      return fetch(request);
    })());
    return;
  }

  if (request.mode !== 'navigate' || url.pathname === '/api' || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/download/') || /\.[a-z0-9]{1,8}$/i.test(url.pathname)) return;

  // A normal online navigation should not be pinned to the old precached index.html.
  // On a slow/unavailable server, use the active worker's precached shell without caching URLs or API data.
  event.stopImmediatePropagation();
  event.respondWith((async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(request, { cache: 'no-store', signal: controller.signal });
      if (response.status < 500) return response;
    } catch { /* Offline or slow: try the precached shell below. */ }
    finally { clearTimeout(timer); }
    const shell = await caches.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true });
    return shell ?? Response.error();
  })());
});
