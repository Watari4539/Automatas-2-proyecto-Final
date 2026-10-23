/* Complete versioned application cache, including the analysis Worker modules. */
importScripts('./sw-assets.js');
const cacheName = `automatas-precache:${self.registration.scope}:${self.PRECACHE.version}`;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    // addAll commits the batch only when every response succeeds. Integrity avoids
    // accepting a mixture of files while a deployment is being propagated.
    const requests = self.PRECACHE.assets.map(asset => new Request(
      new URL(asset.path, self.registration.scope),
      { cache: 'reload', integrity: asset.integrity },
    ));
    await cache.addAll(requests);
  })());
});

// Claim the first loaded page once installation has completed. Updates still
// wait for the previous worker's clients to close; never force a version switch.
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

const base = new URL(self.registration.scope);
const entry = new URL('./index.html', base).href;
const assets = new Set(self.PRECACHE.assets.map(asset => new URL(asset.path, base).href));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  url.search = ''; url.hash = '';
  const key = url.href === base.href ? entry : url.href;
  if (!assets.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const response = await cache.match(key);
    if (response) return response;
    // Never mix a missing file with another release from the network or an old
    // cache. A damaged/evicted installation must be downloaded again.
    return new Response('Faltan archivos locales de la aplicación. Conéctate a internet para volver a prepararla.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  })());
});
// Updating and repairing installations, and the readiness indicator, follow later.
