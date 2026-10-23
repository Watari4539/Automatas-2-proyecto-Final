import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
function worker(scope, fail = false) {
  const listeners = {}, opened = [], batches = [];
  const sandbox = {
    self: { registration: { scope }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    URL, Request,
    caches: { open: async name => { opened.push(name); return { addAll: async requests => {
      batches.push(requests); if (fail) throw new Error('Download failed');
    } }; } },
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = name => vm.runInContext(read(name), context);
  vm.runInContext(read('sw.js'), context);
  return { listeners, opened, batches, manifest: sandbox.self.PRECACHE };
}
test('inventario actualizado cubre entrada, estilos y Worker y excluye pruebas y vistas de desarrollo', () => {
  execFileSync(process.execPath, ['scripts/build-precache.js', '--check'], { cwd: new URL('../', import.meta.url) });
  const paths = worker('https://example.test/repo/').manifest.assets.map(a => a.path);
  for (const name of ['index.html', 'main.js', 'styles.css', 'src/compiler/worker.js', 'src/compiler/analysis.js', 'src/compiler/three-address/index.js', 'src/pwa/register.js']) assert.ok(paths.includes(`./${name}`));
  assert.ok(!paths.some(p => p.includes('preview') || p.includes('/tests/') || p.includes('/fixtures/')));
});
test('instalación descarga todos los recursos con integridad dentro del subdirectorio Pages', async () => {
  const w = worker('https://example.test/mi-proyecto/');
  let installed;
  w.listeners.install({waitUntil: promise => { installed = promise; }});
  await installed;
  assert.equal(w.batches[0].length, w.manifest.assets.length);
  for (const request of w.batches[0]) {
    assert.ok(request.url.startsWith('https://example.test/mi-proyecto/'));
    assert.equal(request.cache, 'reload');
    assert.match(request.integrity, /^sha256-/);
  }
  assert.equal(w.listeners.fetch, undefined);
});
test('un fallo rechaza la instalación y las cachés se separan por proyecto', async () => {
  const a = worker('https://example.test/a/', true), b = worker('https://example.test/b/');
  let installation;
  a.listeners.install({waitUntil: p => { installation = p; }});
  await assert.rejects(installation, /Download failed/);
  b.listeners.install({waitUntil: p => { installation = p; }});
  await installation;
  assert.notEqual(a.opened[0], b.opened[0]);
});
