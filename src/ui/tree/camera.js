export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 4;
const clamp = value => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export function zoomAt(camera, scale, point) {
  const next = clamp(scale);
  const ratio = next / camera.scale;
  return { scale: next, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio };
}

export function fitCamera(bounds, width, height, margin = 24) {
  const scale = clamp(Math.min(1, Math.max(1, width - margin * 2) / bounds.width, Math.max(1, height - margin * 2) / bounds.height));
  return { scale, x: width / 2 - (bounds.x + bounds.width / 2) * scale, y: height / 2 - (bounds.y + bounds.height / 2) * scale };
}

export function panCamera(camera, dx, dy) {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Grid remains attached to world coordinates at every zoom, without tiny cells. */
export function gridGeometry(camera) {
  const worldStep = 32 * 2 ** Math.ceil(Math.log2(20 / (32 * camera.scale)));
  const step = worldStep * camera.scale;
  const modulo = value => ((value % step) + step) % step;
  return { step, x: modulo(camera.x), y: modulo(camera.y) };
}
