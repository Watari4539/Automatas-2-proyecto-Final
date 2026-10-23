const PAGE_SIZE = 100;

/** Renderiza texto, nunca HTML procedente del editor. */
export function createSymbolTableView() {
  const section = document.querySelector('#symbol-results');
  const body = document.querySelector('#symbol-rows');
  const summary = document.querySelector('#symbol-summary');
  const pageLabel = document.querySelector('#table-page');
  const previous = document.querySelector('#previous-page');
  const next = document.querySelector('#next-page');
  const notices = document.querySelector('#analysis-notices');
  const noticeList = document.querySelector('#notice-list');
  const scrollArea = section.querySelector('.table-scroll');
  let rows = [];
  let page = 0;

  function renderPage() {
    const fragment = document.createDocumentFragment();
    const start = page * PAGE_SIZE;
    for (const row of rows.slice(start, start + PAGE_SIZE)) {
      const tr = document.createElement('tr');
      tr.title = `Línea ${row.line}, columna ${row.column} · ${row.originalLexeme}`;
      for (const value of [row.id, row.lexeme, row.token ?? 'Pendiente']) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      if (row.token === null) tr.classList.add('pending-token');
      fragment.append(tr);
    }
    body.replaceChildren(fragment);
    scrollArea.scrollTop = 0;
    pageLabel.textContent = rows.length ? `Filas ${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} de ${rows.length}` : 'Sin lexemas';
    previous.disabled = page === 0;
    next.disabled = (page + 1) * PAGE_SIZE >= rows.length;
  }
  previous.addEventListener('click', () => { if (page > 0) { page--; renderPage(); } });
  next.addEventListener('click', () => { if ((page + 1) * PAGE_SIZE < rows.length) { page++; renderPage(); } });

  return {
    clear() {
      rows = [];
      section.hidden = true;
      notices.hidden = true;
      body.replaceChildren();
      noticeList.replaceChildren();
    },
    show(result) {
      rows = result.rows;
      page = 0;
      summary.textContent = `${rows.length} lexemas · ${result.symbols.length} identificadores del programador${result.status === 'incomplete' ? ' · Resultado parcial' : ''}`;
      section.hidden = false;
      renderPage();
      // Los errores del código tienen su propia tabla. Aquí quedan los límites
      // que afectan a la generación de símbolos, sin repetir esos errores.
      const limitations = result.diagnostics.filter(item =>
        /^(MISSING_TOKEN_RULE|SOURCE_LIMIT|DEPTH_LIMIT|UNSUPPORTED_|WILDCARD_IMPORT|AMBIGUOUS_NAME)/.test(item.code) &&
        !result.errors.some(error => error.line === item.line && error.column === item.column));
      notices.hidden = limitations.length === 0;
      const items = document.createDocumentFragment();
      for (const item of limitations) {
        const li = document.createElement('li');
        li.textContent = `Línea ${item.line}, columna ${item.column}: ${item.message}`;
        items.append(li);
      }
      noticeList.replaceChildren(items);
    },
  };
}
