import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url));
function offlineWorker(scope) {
  const listeners = {}, stores = new Map();
  let claims = 0, networkCalls = 0;
  const sandbox = {
    URL, Request, Response,
    fetch: () => { networkCalls++; throw new Error('Offline'); },
    self: { registration: { scope }, clients: { claim: async () => { claims++; } }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    caches: { open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        addAll: async requests => { for (const r of requests) entries.set(r.url, new Response(read(new URL(r.url).pathname.slice(new URL(scope).pathname.length)))); },
        match: async key => entries.get(key)?.clone(),
      };
    } },
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = name => vm.runInContext(read(name).toString(), context);
  vm.runInContext(read('sw.js').toString(), context);
  return {
    stores, manifest: sandbox.self.PRECACHE,
    async lifecycle(name) { let task; listeners[name]({waitUntil: p => { task = p; }}); await task; },
    fetch(url, method = 'GET') { let task; listeners.fetch({request: new Request(url, {method}), respondWith: p => { task = p; }}); return task; },
    get claims() { return claims; }, get networkCalls() { return networkCalls; },
  };
}
for (const scope of ['https://example.test/', 'https://example.test/automatas/']) {
  test(`apertura y todos los módulos desde caché sin red: ${scope}`, async () => {
    const w = offlineWorker(scope);
    await w.lifecycle('install');
    await w.lifecycle('activate');
    assert.equal(w.claims, 1);
    for (const suffix of ['', '?origen=inicio', 'index.html', 'index.html?test=1']) {
      const response = await w.fetch(scope + suffix);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), read('index.html').toString());
    }
    for (const asset of w.manifest.assets) {
      const response = await w.fetch(new URL(asset.path, scope).href);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), read(asset.path).toString());
    }
    assert.equal(w.networkCalls, 0);
  });
}
test('no responde con HTML para rutas desconocidas, peticiones externas ni POST', () => {
  const w = offlineWorker('https://example.test/automatas/');
  for (const url of ['https://other.test/automatas/main.js', 'https://example.test/otro/main.js', 'https://example.test/automatas/no-existe.js', 'https://example.test/automatas/sw.js']) assert.equal(w.fetch(url), undefined);
  assert.equal(w.fetch('https://example.test/automatas/main.js', 'POST'), undefined);
});
test('si falta un recurso no mezcla versiones y devuelve un fallo explícito', async () => {
  const w = offlineWorker('https://example.test/automatas/');
  await w.lifecycle('install');
  const current = [...w.stores.values()][0];
  current.delete('https://example.test/automatas/main.js');
  w.stores.set('otra-version', new Map([['https://example.test/automatas/main.js', new Response('old')]]));
  const response = await w.fetch('https://example.test/automatas/main.js');
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Faltan archivos/);
  assert.equal(w.networkCalls, 0);
});
