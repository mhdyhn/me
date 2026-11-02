// The precached packs keep every illustration and every animation available offline
// without hundreds of separate downloads.
let figuresPromise;
let motionsPromise;

async function pack(name) {
  const url = new URL(name, self.registration.scope).href;
  const response = await caches.match(url, { ignoreSearch: true });
  return response ? response.json() : null;
}

async function exerciseFigures() {
  if (!figuresPromise) {
    figuresPromise = pack('exercise-figures.json').catch(() => null);
  }
  return figuresPromise;
}

async function exerciseMotions() {
  if (!motionsPromise) {
    motionsPromise = pack('exercise-motions.json').catch(() => null);
  }
  return motionsPromise;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin) return;

  // The illustrations: one SVG per movement, served from the packed file.
  const figurePrefix = new URL('exercise-images/', scope).pathname;
  if (url.pathname.startsWith(figurePrefix)) {
    const name = url.pathname.slice(figurePrefix.length);
    if (!/^[a-z0-9-]+\.svg$/.test(name)) return;
    event.respondWith((async () => {
      const figures = await exerciseFigures();
      if (figures && typeof figures[name] === 'string') {
        return new Response(figures[name], { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
      }
      // Covers unknown/new images and a missing pack without caching private responses.
      return fetch(request);
    })());
    return;
  }

  // The animated guides: one JSON per movement, served from the packed file.
  const motionPrefix = new URL('exercise-motion/', scope).pathname;
  if (url.pathname.startsWith(motionPrefix)) {
    const name = url.pathname.slice(motionPrefix.length);
    if (!/^[a-z0-9-]+\.json$/.test(name)) return;
    event.respondWith((async () => {
      const motions = await exerciseMotions();
      if (motions && typeof motions[name] === 'string') {
        return new Response(motions[name], { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
      // A movement that is not in the pack yet still works online.
      return fetch(request);
    })());
  }
});
