// The precached pack keeps every SVG available offline without 300 separate downloads.
let figuresPromise;
async function exerciseFigures() {
  if (!figuresPromise) {
    figuresPromise = (async () => {
      const url = new URL('exercise-figures.json', self.registration.scope).href;
      const response = await caches.match(url, { ignoreSearch: true });
      return response ? response.json() : null;
    })().catch(() => null);
  }
  return figuresPromise;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  const prefix = new URL('exercise-images/', scope).pathname;
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(prefix)) return;
  const name = url.pathname.slice(prefix.length);
  if (!/^[a-z0-9-]+\.svg$/.test(name)) return;
  event.respondWith((async () => {
    const figures = await exerciseFigures();
    if (figures && typeof figures[name] === 'string') {
      return new Response(figures[name], { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
    }
    // Covers unknown/new images and a missing pack without caching private responses.
    return fetch(request);
  })());
});
