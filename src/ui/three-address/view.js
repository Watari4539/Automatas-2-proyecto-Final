import { temporaryOccupancy, formatOccupancy } from './occupancy.js';
import { formatInstruction, formatClosure } from './format.js';

const PAGE_SIZE = 100;
let instance = 0;
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Displays a validated generator response. No tree evaluation or DOM from source text. */
export function createThreeAddressView(host) {
  const abort = new AbortController();
  const section = element('section', 'three-address-results');
  const heading = element('div', 'results-heading');
  const title = element('h2', '', 'Tres direcciones');
  title.id = `three-address-heading-${++instance}`;
  section.setAttribute('aria-labelledby', title.id);
  const summary = element('p', 'three-address-summary');
  heading.append(title, summary);
  const notices = element('div', 'analysis-notices');
  const noticeList = element('ul'); notices.append(noticeList);
  const scroll = element('div', 'three-address-scroll');
  scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Instrucciones de tres direcciones, desplazamiento horizontal');
  const table = element('table', 'three-address-table');
  table.setAttribute('aria-label', 'Tres direcciones y temporales ocupados después de cada fila');
  const head = element('thead'), header = element('tr');
  for (const text of ['Tres direcciones', 'Temporales ocupados']) {
    const cell = element('th', '', text); cell.scope = 'col'; header.append(cell);
  }
  head.append(header);
  const code = element('tbody', 'three-address-code');
  const foot = element('tfoot');
  const closure = element('tr', 'three-address-closure');
  const closureText = element('td'), closureMemory = element('td');
  closure.append(closureText, closureMemory); foot.append(closure);
  table.append(head, code, foot); scroll.append(table);
  const pagination = element('nav', 'table-pagination');
  pagination.setAttribute('aria-label', 'Páginas de tres direcciones');
  const pageLabel = element('span'); pageLabel.setAttribute('aria-live', 'polite');
  const actions = element('div');
  const previous = element('button', '', 'Anterior'), next = element('button', '', 'Siguiente');
  previous.type = next.type = 'button';
  actions.append(previous, next); pagination.append(pageLabel, actions);
  section.append(heading, notices, scroll, pagination);
  host.append(section);
  let rows = [], ending = null, page = 0, destroyed = false;
  let occupancy = { rows: [], closure: [] };
  function render() {
    const start = page * PAGE_SIZE;
    const fragment = document.createDocumentFragment();
    for (const [offset, record] of rows.slice(start, start + PAGE_SIZE).entries()) {
      const line = element('tr', 'three-address-record');
      line.append(element('td', '', formatInstruction(record)), element('td', '', formatOccupancy(occupancy.rows[start + offset])));
      if (record.kind === 'pending') {
        line.classList.add('is-deferred');
        line.title = `Operación ${record.treeOperationNumber} del árbol pospuesta y retomada más adelante`;
      } else if (record.origin?.source) line.title = `Línea ${record.origin.source.line}, columna ${record.origin.source.column}`;

      fragment.append(line);
    }
    code.replaceChildren(fragment);
    const lastPage = start + PAGE_SIZE >= rows.length;
    closureText.textContent = lastPage ? formatClosure(ending) : '';
    closureMemory.textContent = lastPage && ending ? formatOccupancy(occupancy.closure) : '';
    closure.hidden = !lastPage || !ending;
    scroll.scrollTop = scroll.scrollLeft = 0;
    pageLabel.textContent = rows.length ? `Filas ${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} de ${rows.length}` : 'Sin instrucciones';
    previous.disabled = page === 0;
    next.disabled = lastPage;
    actions.hidden = rows.length <= PAGE_SIZE;
  }
  previous.addEventListener('click', () => { if (page > 0) { page--; render(); } }, { signal: abort.signal });
  next.addEventListener('click', () => { if ((page + 1) * PAGE_SIZE < rows.length) { page++; render(); } }, { signal: abort.signal });
  function clear() {
    rows = []; ending = null; page = 0;
    occupancy = { rows: [], closure: [] };
    code.replaceChildren(); closureText.textContent = ''; closureMemory.textContent = ''; noticeList.replaceChildren();
    summary.textContent = ''; pageLabel.textContent = ''; section.hidden = true;
  }
  function show(data, { hasSourceErrors = false } = {}) {
    if (destroyed) throw new Error('La vista ya fue destruida.');
    clear();
    if (!data || data.status === 'empty') return;
    section.hidden = false;
    const accepted = ['success', 'partial'].includes(data.status) && data.validation?.valid === true && Array.isArray(data.instructions);
    scroll.hidden = pagination.hidden = !accepted;
    const messages = [];
    if (accepted) {
      rows = structuredClone(data.instructions); ending = structuredClone(data.closure); page = 0;
      occupancy = temporaryOccupancy(rows, ending);
      const pending = rows.filter(row => row.kind === 'pending').length;
      const temporaries = new Set(rows.filter(row => row.kind === 'operation').map(row => row.destination)).size;
      summary.textContent = `${rows.length - pending} instrucciones · ${pending} ${pending === 1 ? 'pendiente retomado' : 'pendientes retomados'} · ${temporaries} de 3 temporales`;
      if (hasSourceErrors) messages.push('Consulta también los errores de la tabla: estas instrucciones representan el subconjunto admitido por el árbol.');
      if (data.status === 'partial' && !data.diagnostics?.length) messages.push('Secuencia validada con valores todavía pendientes de evaluación.');
      render();
    } else {
      summary.textContent = data.status === 'unsupported' ? 'Fuera del alcance' : 'No disponible';
      messages.push('No hay una secuencia validada para mostrar.');
    }
    for (const diagnostic of [...(data.diagnostics ?? []), ...(data.validation?.diagnostics ?? [])]) {
      messages.push(`${diagnostic.instruction ? `Fila ${diagnostic.instruction} · ` : ''}${diagnostic.message}`);
    }
    notices.hidden = messages.length === 0;
    for (const message of messages) noticeList.append(element('li', '', message));
  }
  function destroy() { clear(); destroyed = true; abort.abort(); section.remove(); }
  clear();
  return { show, clear, destroy };
}
