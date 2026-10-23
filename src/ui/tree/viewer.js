import { fitCamera, zoomAt, panCamera, gridGeometry, MIN_ZOOM, MAX_ZOOM } from './camera.js';

const NS = 'http://www.w3.org/2000/svg';
let instance = 0;
function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
function htmlElement(name, className, text) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Mount once; show/clear on source changes; destroy when the host is removed. */
export function createTreeViewer(host) {
  const controller = new AbortController();
  const { signal } = controller;
  const prefix = `tree-view-${++instance}`;
  let layout = null, camera = { scale: 1, x: 0, y: 0 }, width = 0, height = 0, automaticFit = true;
  let frame = null, destroyed = false;
  const pointers = new Map();
  const shell = htmlElement('div', 'tree-viewer');
  const toolbar = htmlElement('div', 'tree-toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Controles del árbol');
  const stats = htmlElement('span', 'tree-stats', '0 nodos · 0 operaciones');
  const levelToggle = htmlElement('label', 'tree-level-toggle');
  const levelCheckbox = document.createElement('input');
  levelCheckbox.type = 'checkbox';
  levelToggle.append(levelCheckbox, document.createTextNode('Mostrar niveles'));
  const controls = htmlElement('div', 'tree-controls');
  function button(text, label, action) {
    const element = htmlElement('button', 'tree-control', text);
    element.type = 'button'; element.setAttribute('aria-label', label); element.title = label;
    element.addEventListener('click', action, { signal });
    controls.append(element);
    return element;
  }
  const center = () => ({ x: width / 2, y: height / 2 });
  function zoom(scale, point = center()) { camera = zoomAt(camera, scale, point); automaticFit = false; schedule(); }
  const minus = button('−', 'Alejar árbol', () => zoom(camera.scale / 1.25));
  const percent = button('100%', 'Restablecer zoom al 100%', () => zoom(1));
  const plus = button('+', 'Acercar árbol', () => zoom(camera.scale * 1.25));
  const fitButton = button('Encuadrar', 'Encuadrar árbol completo', fit);
  toolbar.append(stats, levelToggle, controls);

  const viewport = htmlElement('div', 'tree-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Plano interactivo del árbol');
  viewport.setAttribute('aria-describedby', `${prefix}-help`);
  const help = htmlElement('p', 'sr-only', 'Arrastra para mover el plano. Usa la rueda o dos dedos para ampliar. Con el plano enfocado, usa las flechas para mover, más o menos para el zoom y la tecla Inicio para encuadrar.');
  help.id = `${prefix}-help`;
  const svg = svgElement('svg', { width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false' });
  const defs = svgElement('defs');
  const pattern = svgElement('pattern', { id: `${prefix}-grid`, patternUnits: 'userSpaceOnUse' });
  const gridPath = svgElement('path', { class: 'tree-grid-line', fill: 'none' });
  pattern.append(gridPath); defs.append(pattern);
  const background = svgElement('rect', { width: '100%', height: '100%', fill: `url(#${prefix}-grid)` });
  const world = svgElement('g', { class: 'tree-world' });
  const levelLayer = svgElement('g', { class: 'tree-levels', display: 'none' });
  let levelGuides = [];
  svg.append(defs, background, levelLayer, world);
  levelCheckbox.addEventListener('change', () => { paintLevels(); }, { signal });
  function paintLevels() {
    levelLayer.setAttribute('display', levelCheckbox.checked && layout ? 'inline' : 'none');
    for (const guide of levelGuides) {
      const y = guide.y * camera.scale + camera.y;
      guide.line.setAttribute('x2', width);
      guide.line.setAttribute('y1', y);
      guide.line.setAttribute('y2', y);
      guide.label.setAttribute('y', y - 7);
    }
  }
  const empty = htmlElement('p', 'tree-empty', 'Sin árbol');
  viewport.append(svg, empty);
  // A textual alternative carries the same numbered values as the visual tree.
  const accessible = htmlElement('ol', 'sr-only');
  accessible.setAttribute('aria-label', 'Operaciones del árbol en orden');
  const symbolSection = htmlElement('div', 'tree-symbols');
  const symbolTitle = htmlElement('h3', '', 'Identificadores del árbol');
  symbolTitle.id = `${prefix}-symbols`;
  const symbolScroll = htmlElement('div', 'table-scroll');
  symbolScroll.tabIndex = 0;
  symbolScroll.setAttribute('role', 'region');
  symbolScroll.setAttribute('aria-labelledby', symbolTitle.id);
  const symbolTable = document.createElement('table');
  const symbolHead = document.createElement('thead');
  const symbolHeaderRow = document.createElement('tr');
  for (const title of ['ID', 'Nombre real']) {
    const cell = htmlElement('th', '', title); cell.scope = 'col'; symbolHeaderRow.append(cell);
  }
  symbolHead.append(symbolHeaderRow);
  const symbolBody = document.createElement('tbody');
  const symbolNodes = new Map();
  let highlighted = [];
  function highlightSymbol(id) {
    for (const node of highlighted) node.classList.remove('is-symbol-highlighted');
    highlighted = symbolNodes.get(id) ?? [];
    for (const node of highlighted) node.classList.add('is-symbol-highlighted');
  }
  const symbolAt = target => target instanceof Element ? target.closest('tr[data-symbol-id]')?.dataset.symbolId : null;
  symbolBody.addEventListener('pointerover', event => highlightSymbol(symbolAt(event.target)), { signal });
  symbolBody.addEventListener('pointerout', event => highlightSymbol(symbolAt(event.relatedTarget)), { signal });
  symbolBody.addEventListener('focusin', event => highlightSymbol(symbolAt(event.target)), { signal });
  symbolBody.addEventListener('focusout', event => highlightSymbol(symbolAt(event.relatedTarget)), { signal });
  symbolTable.append(symbolHead, symbolBody); symbolScroll.append(symbolTable);
  symbolSection.append(symbolTitle, symbolScroll); symbolSection.hidden = true;
  viewport.append(symbolSection);
  // Keep legend interaction separate from the canvas camera controls.
  for (const name of ['pointerdown', 'wheel', 'keydown']) {
    symbolSection.addEventListener(name, event => event.stopPropagation(), { signal });
  }
  shell.append(toolbar, viewport, help, accessible);
  host.append(shell);

  function paint() {
    frame = null;
    if (destroyed) return;
    world.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    const grid = gridGeometry(camera);
    pattern.setAttribute('width', grid.step); pattern.setAttribute('height', grid.step);
    pattern.setAttribute('x', grid.x); pattern.setAttribute('y', grid.y);
    gridPath.setAttribute('d', `M ${grid.step} 0 H 0 V ${grid.step}`);
    percent.textContent = `${Math.round(camera.scale * 100)}%`;
    minus.disabled = !layout || camera.scale <= MIN_ZOOM;
    plus.disabled = !layout || camera.scale >= MAX_ZOOM;
    percent.disabled = fitButton.disabled = levelCheckbox.disabled = !layout;
    paintLevels();
  }
  function schedule() { if (frame === null && !destroyed) frame = requestAnimationFrame(paint); }
  function fit() {
    automaticFit = true;
    if (layout && width && height) camera = fitCamera(layout.bounds, width, height);
    schedule();
  }
  function point(event) {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function cancelPointers() {
    for (const id of pointers.keys()) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    pointers.clear(); viewport.classList.remove('is-dragging');
  }
  viewport.addEventListener('pointerdown', event => {
    if (!layout || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (pointers.size >= 2) return;
    viewport.focus({ preventScroll: true });
    pointers.set(event.pointerId, point(event));
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
  }, { signal });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const previous = [...pointers.values()];
    const before = pointers.get(event.pointerId), after = point(event);
    pointers.set(event.pointerId, after);
    if (pointers.size === 1) camera = panCamera(camera, after.x - before.x, after.y - before.y);
    else {
      const current = [...pointers.values()];
      const midpoint = pair => ({ x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 });
      const distance = pair => Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      const oldCenter = midpoint(previous), newCenter = midpoint(current);
      const oldDistance = distance(previous), newDistance = distance(current);
      if (oldDistance > 0 && newDistance > 0) camera = zoomAt(camera, camera.scale * newDistance / oldDistance, oldCenter);
      camera = panCamera(camera, newCenter.x - oldCenter.x, newCenter.y - oldCenter.y);
    }
    automaticFit = false; schedule();
  }, { signal });
  function release(event) {
    pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (!pointers.size) viewport.classList.remove('is-dragging');
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, release, { signal });
  viewport.addEventListener('blur', cancelPointers, { signal });
  viewport.addEventListener('wheel', event => {
    if (!layout) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    zoom(camera.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.004), point(event));
  }, { passive: false, signal });
  viewport.addEventListener('keydown', event => {
    if (!layout || event.ctrlKey || event.metaKey || event.altKey) return;
    const moves = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (moves[event.key]) { camera = panCamera(camera, ...moves[event.key]); automaticFit = false; schedule(); }
    else if (['+', '='].includes(event.key)) zoom(camera.scale * 1.25);
    else if (event.key === '-') zoom(camera.scale / 1.25);
    else if (event.key === '0') zoom(1);
    else if (event.key === 'Home') fit();
    else return;
    event.preventDefault();
  }, { signal });
  const observer = new ResizeObserver(entries => {
    const rect = entries[0].contentRect;
    const oldWidth = width, oldHeight = height;
    width = rect.width; height = rect.height;
    if (automaticFit) fit();
    else { camera = panCamera(camera, (width - oldWidth) / 2, (height - oldHeight) / 2); schedule(); }
  });
  observer.observe(viewport);

  function textBlock(lines, position, className, config) {
    const text = svgElement('text', { x: position.x, y: position.y, 'text-anchor': position.anchor ?? 'middle', 'dominant-baseline': 'central', 'font-size': config.fontSize, class: className });
    lines.forEach((line, index) => text.append(svgElement('tspan', { x: position.x, y: position.y + (index - (lines.length - 1) / 2) * config.lineHeight }, line)));
    return text;
  }
  function show(next) {
    if (destroyed) throw new Error('El visor ya fue destruido.');
    cancelPointers();
    highlightSymbol(null); symbolNodes.clear();
    const drawing = document.createDocumentFragment();
    const descriptions = document.createDocumentFragment();
    for (const edge of next.edges) drawing.append(svgElement('polyline', { class: 'tree-edge', points: edge.points.map(p => `${p.x},${p.y}`).join(' '), fill: 'none' }));
    for (const node of next.nodes) {
      const group = svgElement('g', { class: 'tree-node', 'data-node-id': node.id });
      if (node.symbolId) {
        group.dataset.symbolId = node.symbolId;
        const occurrences = symbolNodes.get(node.symbolId) ?? [];
        occurrences.push(group); symbolNodes.set(node.symbolId, occurrences);
      }
      group.append(svgElement('title', {}, `${node.fullLabel}${node.operationNumber ? ` · Operación ${node.operationNumber}` : ''}${node.valueLines.length ? ` · ${node.valueLines.join(' ')}` : ''}`));
      group.append(svgElement('circle', { cx: node.x, cy: node.y, r: node.radius, class: node.id === next.rootId ? 'tree-root' : '' }));
      group.append(textBlock(node.labelLines, node.label, 'tree-label', next.config));
      if (node.operation) group.append(textBlock([String(node.operationNumber)], node.operation, 'tree-operation', next.config));
      if (node.value) group.append(textBlock(node.valueLines, node.value, 'tree-value', next.config));
      drawing.append(group);
    }
    next.nodes.filter(node => node.operationNumber).sort((a, b) => a.operationNumber - b.operationNumber).forEach(node => descriptions.append(htmlElement('li', '', `${node.fullLabel}: ${node.valueLines.length ? node.valueLines.join(' ') : 'valor pendiente'}`)));
    levelGuides = [...new Map(next.nodes.map(node => [node.level, node.y]))].map(([level, y]) => ({
      y,
      line: svgElement('line', { x1: 0, class: 'tree-level-line' }),
      label: svgElement('text', { x: 12, class: 'tree-level-label' }, `Nivel ${level}`),
    }));
    levelLayer.replaceChildren(...levelGuides.flatMap(guide => [guide.line, guide.label]));
    const symbolRows = document.createDocumentFragment();
    for (const symbol of next.symbols ?? []) {
      const row = document.createElement('tr');
      row.dataset.symbolId = symbol.id;
      row.tabIndex = 0;
      row.append(htmlElement('td', '', symbol.id), htmlElement('td', '', symbol.name));
      symbolRows.append(row);
    }
    symbolBody.replaceChildren(symbolRows);
    symbolSection.hidden = !symbolBody.childElementCount;
    layout = next;
    world.replaceChildren(drawing); accessible.replaceChildren(descriptions);
    stats.textContent = `${next.nodes.length} nodos · ${accessible.childElementCount} operaciones`;
    empty.hidden = true; fit();
  }
  function clear() {
    highlightSymbol(null); symbolNodes.clear();
    cancelPointers(); layout = null; world.replaceChildren(); accessible.replaceChildren();
    levelGuides = []; levelLayer.replaceChildren();
    symbolBody.replaceChildren(); symbolSection.hidden = true;
    stats.textContent = '0 nodos · 0 operaciones'; empty.hidden = false;
    camera = { scale: 1, x: 0, y: 0 }; automaticFit = true; schedule();
  }
  function destroy() {
    cancelPointers(); destroyed = true; observer.disconnect(); controller.abort();
    if (frame !== null) cancelAnimationFrame(frame);
    shell.remove();
  }
  paint();
  return { show, clear, fit, destroy };
}
