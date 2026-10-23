import { formatOptimizationTable, OPTIMIZATION_COLUMNS } from '../optimization/format.js';
import { formatRecord, formatClosure } from './format.js';

const PAGE_SIZE = 100;
let instance = 0;
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Displays a validated generator response. No tree evaluation or DOM from source text. */
export function createQuadruplesView(host) {
  const abort = new AbortController();
  const section = element('section', 'quadruples-results');
  const heading = element('div', 'results-heading');
  const title = element('h2', '', 'Cuádruplos');
  title.id = `quadruples-heading-${++instance}`;
  section.setAttribute('aria-labelledby', title.id);
  const summary = element('p', 'quadruples-summary');
  heading.append(title, summary);
  const notices = element('div', 'analysis-notices');
  const noticeList = element('ul'); notices.append(noticeList);
  const scroll = element('div', 'quadruples-scroll');
  scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Registros de cuádruplos, desplazamiento horizontal');
  const code = element('div', 'quadruples-code');
  const closure = element('pre', 'quadruples-closure');
  scroll.append(code, closure);
  const pagination = element('nav', 'table-pagination');
  pagination.setAttribute('aria-label', 'Páginas de cuádruplos');
  const pageLabel = element('span'); pageLabel.setAttribute('aria-live', 'polite');
  const actions = element('div');
  const previous = element('button', '', 'Anterior'), next = element('button', '', 'Siguiente');
  previous.type = next.type = 'button';
  actions.append(previous, next); pagination.append(pageLabel, actions);
  const tabs = element('div', 'quadruples-tabs');
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Vistas de cuádruplos');
  const panel = element('div'); panel.id = `quadruples-panel-${instance}`;
  const buttons = ['Originales', 'Optimización', 'Resultado final'].map((label, index) => {
    const tab = element('button', '', label); tab.type = 'button';
    tab.id = `quadruples-tab-${instance}-${index}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id);
    tabs.append(tab); return tab;
  });
  const table = element('table', 'optimization-table');
  const caption = element('caption', 'sr-only', 'Proceso de optimización de cuádruplos');
  const thead = element('thead'), header = element('tr');
  for (const label of OPTIMIZATION_COLUMNS) {
    const th = element('th', '', label); th.scope = 'col'; header.append(th);
  }
  thead.append(header); const tbody = element('tbody'); table.append(caption, thead, tbody);
  scroll.append(table);
  panel.append(scroll, pagination);
  section.append(heading, tabs, notices, panel);
  host.append(section);
  let rows = [], ending = null, page = 0, destroyed = false;
  let selected = 0, originalRows = [], originalEnding = null, optimized = null, explanations = [];
  function selectTab(index, focus = false) {
    selected = index; page = 0;
    rows = index === 0 ? originalRows : index === 1 ? explanations : optimized.records;
    ending = index === 0 ? originalEnding : index === 2 ? optimized.closure : null;
    buttons.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    panel.setAttribute('aria-labelledby', buttons[index].id);
    if (focus) buttons[index].focus();
    render();
  }
  buttons.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index), {signal: abort.signal});
    tab.addEventListener('keydown', event => {
      const target = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (target !== null) { event.preventDefault(); selectTab(target, true); }
    }, {signal: abort.signal});
  });
  function render() {
    code.hidden = selected === 1; table.hidden = selected !== 1;
    const start = page * PAGE_SIZE;
    const fragment = document.createDocumentFragment();
    for (const record of rows.slice(start, start + PAGE_SIZE)) {
      if (selected === 1) {
        const tr = element('tr');
        for (const field of ['original', 'optimization', 'affected', 'modified']) tr.append(element('td', '', record[field]));
        fragment.append(tr); continue;
      }
      const line = element('pre', 'quadruples-record', formatRecord(record));
      if (record.result.status === 'pending') line.classList.add('is-pending');
      if (record.source) line.title = `Línea ${record.source.line}, columna ${record.source.column}`;
      fragment.append(line);
    }
    code.replaceChildren(); tbody.replaceChildren();
    (selected === 1 ? tbody : code).append(fragment);
    const lastPage = start + PAGE_SIZE >= rows.length;
    closure.textContent = lastPage ? formatClosure(ending) : '';
    closure.hidden = !lastPage || !ending;
    scroll.scrollTop = scroll.scrollLeft = 0;
    pageLabel.textContent = rows.length ? `Registros ${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} de ${rows.length}` : 'Sin registros';
    previous.disabled = page === 0;
    next.disabled = lastPage;
    actions.hidden = rows.length <= PAGE_SIZE;
  }
  previous.addEventListener('click', () => { if (page > 0) { page--; render(); } }, { signal: abort.signal });
  next.addEventListener('click', () => { if ((page + 1) * PAGE_SIZE < rows.length) { page++; render(); } }, { signal: abort.signal });
  function clear() {
    rows = []; ending = null; page = 0; selected = 0; originalRows = []; originalEnding = null; optimized = null; explanations = [];
    tbody.replaceChildren(); tabs.hidden = true; panel.removeAttribute('role');
    code.replaceChildren(); closure.textContent = ''; noticeList.replaceChildren();
    summary.textContent = ''; pageLabel.textContent = ''; section.hidden = true;
  }
  function show(data, { hasSourceErrors = false, optimization = null } = {}) {
    if (destroyed) throw new Error('La vista ya fue destruida.');
    clear();
    if (!data || data.status === 'empty') return;
    section.hidden = false;
    const accepted = ['success', 'partial'].includes(data.status) && data.validation?.valid === true && Array.isArray(data.records);
    scroll.hidden = pagination.hidden = !accepted;
    const messages = [];
    if (accepted) {
      originalRows = data.records; originalEnding = data.closure;
      optimized = optimization?.status === 'success' && optimization.validation?.valid === true ? optimization : null;
      explanations = optimized ? formatOptimizationTable(optimized) : [];
      tabs.hidden = !optimized;
      if (optimized) panel.setAttribute('role', 'tabpanel');
      const pending = originalRows.filter(row => row.result.status === 'pending').length;
      summary.textContent = optimized ? `${originalRows.length} originales · ${optimized.records.length} finales · ${originalRows.length - optimized.records.length} ${originalRows.length - optimized.records.length === 1 ? 'eliminado' : 'eliminados'}` : `${originalRows.length} registros · ${pending} pendientes`;
      if (hasSourceErrors) messages.push('Consulta también los errores de la tabla: estos cuádruplos representan el subconjunto admitido por el árbol.');
      if (pending) messages.push('Los resultados no evaluados aparecen como «Pendiente».');
      selectTab(0);
    } else {
      summary.textContent = data.status === 'unsupported' ? 'Fuera del alcance' : 'No disponible';
      messages.push('No hay una secuencia validada para mostrar.');
    }
    for (const diagnostic of [...(data.diagnostics ?? []), ...(data.validation?.diagnostics ?? [])]) {
      messages.push(`${diagnostic.number ? `Registro ${diagnostic.number} · ` : ''}${diagnostic.message}`);
    }
    if (optimization && !['empty', 'success'].includes(optimization.status)) {
      messages.push(...(optimization.diagnostics?.length ? optimization.diagnostics.map(item => item.message) : ['La optimización no está disponible para este análisis.']));
    }
    notices.hidden = messages.length === 0;
    for (const message of messages) noticeList.append(element('li', '', message));
  }
  function destroy() { clear(); destroyed = true; abort.abort(); section.remove(); }
  clear();
  return { show, clear, destroy };
}
