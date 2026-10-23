import { createTreeViewer } from './viewer.js';

export function createTreeResultsView() {
  const section = document.querySelector('#tree-results');
  const host = document.querySelector('#tree-host');
  const summary = document.querySelector('#tree-summary');
  const notices = document.querySelector('#tree-notices');
  const list = document.querySelector('#tree-notice-list');
  let viewer;
  const labels = { success: 'Evaluación completa', partial: 'Evaluación parcial', invalid: 'No generado', unsupported: 'Fuera del alcance', limit: 'Límite alcanzado', failed: 'No generado', empty: 'Sin árbol' };
  function clear() {
    viewer?.clear();
    section.hidden = true;
    list.replaceChildren(); notices.hidden = true;
    summary.textContent = '';
  }
  function show(result) {
    clear();
    const analysis = result.treeAnalysis;
    if (!analysis || analysis.status === 'empty') return;
    section.hidden = false;
    summary.textContent = labels[analysis.status] ?? 'No generado';
    host.hidden = !analysis.layout;
    if (analysis.layout) {
      viewer ??= createTreeViewer(host);
      viewer.show(analysis.layout);
    }
    const messages = [...analysis.diagnostics];
    if (analysis.layout && result.errors.length) messages.unshift({ message: 'El árbol representa el subconjunto admitido. Consulta también los errores de la tabla; el dibujo no implica que el código esté libre de errores.' });
    for (const issue of messages) {
      const item = document.createElement('li');
      item.textContent = `${issue.source?.line ? `Línea ${issue.source.line} · ` : ''}${issue.operationNumber ? `Operación ${issue.operationNumber} · ` : ''}${issue.message}`;
      list.append(item);
    }
    notices.hidden = !messages.length;
  }
  return { clear, show };
}
