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
  section.append(heading, notices, scroll, pagination);
  host.append(section);
  let rows = [], ending = null, page = 0, destroyed = false;
  function render() {
    const start = page * PAGE_SIZE;
    const fragment = document.createDocumentFragment();
    for (const record of rows.slice(start, start + PAGE_SIZE)) {
      const line = element('pre', 'quadruples-record', formatRecord(record));
      if (record.result.status === 'pending') line.classList.add('is-pending');
      if (record.source) line.title = `Línea ${record.source.line}, columna ${record.source.column}`;
      fragment.append(line);
    }
    code.replaceChildren(fragment);
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
    rows = []; ending = null; page = 0;
    code.replaceChildren(); closure.textContent = ''; noticeList.replaceChildren();
    summary.textContent = ''; pageLabel.textContent = ''; section.hidden = true;
  }
  function show(data, { hasSourceErrors = false } = {}) {
    if (destroyed) throw new Error('La vista ya fue destruida.');
    clear();
    if (!data || data.status === 'empty') return;
    section.hidden = false;
    const accepted = ['success', 'partial'].includes(data.status) && data.validation?.valid === true && Array.isArray(data.records);
    scroll.hidden = pagination.hidden = !accepted;
    const messages = [];
    if (accepted) {
      rows = data.records; ending = data.closure; page = 0;
      const pending = rows.filter(row => row.result.status === 'pending').length;
      summary.textContent = `${rows.length} registros · ${pending} pendientes`;
      if (hasSourceErrors) messages.push('Consulta también los errores de la tabla: estos cuádruplos representan el subconjunto admitido por el árbol.');
      if (pending) messages.push('Los resultados no evaluados aparecen como «Pendiente».');
      render();
    } else {
      summary.textContent = data.status === 'unsupported' ? 'Fuera del alcance' : 'No disponible';
      messages.push('No hay una secuencia validada para mostrar.');
    }
    for (const diagnostic of [...(data.diagnostics ?? []), ...(data.validation?.diagnostics ?? [])]) {
      messages.push(`${diagnostic.number ? `Registro ${diagnostic.number} · ` : ''}${diagnostic.message}`);
    }
    notices.hidden = messages.length === 0;
    for (const message of messages) noticeList.append(element('li', '', message));
  }
  function destroy() { clear(); destroyed = true; abort.abort(); section.remove(); }
  clear();
  return { show, clear, destroy };
}
