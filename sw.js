/* Step 1: complete, integrity-checked precache. Offline responses follow in step 2. */
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
// No skipWaiting, cache deletion or fetch interception at this stage.
