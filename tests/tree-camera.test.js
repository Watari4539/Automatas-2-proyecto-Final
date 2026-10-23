import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomAt, fitCamera, panCamera, gridGeometry, MIN_ZOOM, MAX_ZOOM } from '../src/ui/tree/camera.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test('zoom conserva el punto del mundo bajo el cursor, incluso en los límites', () => {
  const camera = { scale: 0.6, x: -480, y: 235 }, cursor = { x: 183, y: 302 };
  for (const zoom of [0.001, 0.8, 2, 100]) {
    const next = zoomAt(camera, zoom, cursor);
    near((cursor.x - next.x) / next.scale, (cursor.x - camera.x) / camera.scale);
    near((cursor.y - next.y) / next.scale, (cursor.y - camera.y) / camera.scale);
    assert.ok(next.scale >= MIN_ZOOM && next.scale <= MAX_ZOOM);
  }
});

test('encuadre centra los límites completos con margen en escritorio y móvil', () => {
  const bounds = { x: 20, y: -30, width: 2100, height: 1650 };
  for (const [width, height] of [[1000, 650], [320, 400]]) {
    const camera = fitCamera(bounds, width, height);
    near((bounds.x + bounds.width / 2) * camera.scale + camera.x, width / 2);
    near((bounds.y + bounds.height / 2) * camera.scale + camera.y, height / 2);
    assert.ok(bounds.x * camera.scale + camera.x >= 24 - 1e-8);
    assert.ok(bounds.y * camera.scale + camera.y >= 24 - 1e-8);
    assert.ok((bounds.x + bounds.width) * camera.scale + camera.x <= width - 24 + 1e-8);
  }
});

test('arrastre y zoom reversible no modifican la cámara original', () => {
  const camera = { scale: 1, x: 0, y: 0 };
  assert.deepEqual(panCamera(camera, -2000, 1500), { scale: 1, x: -2000, y: 1500 });
  const next = zoomAt(zoomAt(camera, 2, { x: 80, y: 90 }), 1, { x: 80, y: 90 });
  assert.deepEqual(next, camera);
  assert.deepEqual(camera, { scale: 1, x: 0, y: 0 });
});

test('cuadrícula acompaña al plano y mantiene celdas legibles en todo el rango', () => {
  for (const scale of [MIN_ZOOM, 0.12, 0.9, 1, 2, MAX_ZOOM]) {
    const camera = { scale, x: -835.5, y: 410.25 };
    const grid = gridGeometry(camera);
    assert.ok(grid.step >= 20 && grid.step < 40);
    assert.ok(grid.x >= 0 && grid.x < grid.step);
    assert.ok(grid.y >= 0 && grid.y < grid.step);
    const next = gridGeometry(panCamera(camera, grid.step * 2, -grid.step * 3));
    near(next.x, grid.x); near(next.y, grid.y);
  }
});
