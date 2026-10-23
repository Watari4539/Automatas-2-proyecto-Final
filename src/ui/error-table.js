import { CATEGORY_LABELS } from '../compiler/errors/diagnostics.js';

const PAGE_SIZE = 100;

export function createErrorTableView() {
  const section = document.querySelector('#error-results');
  const body = document.querySelector('#error-rows');
  const summary = document.querySelector('#error-summary');
  const scroll = document.querySelector('#error-table-scroll');
  const pagination = document.querySelector('#error-pagination');
  const pageLabel = document.querySelector('#error-page');
  const previous = document.querySelector('#errors-previous');
  const next = document.querySelector('#errors-next');
  const coverage = document.querySelector('#error-coverage');
  const coverageSummary = document.querySelector('#coverage-summary');
  const noticeList = document.querySelector('#coverage-notices');
  let rows = [];
  let page = 0;

  function renderPage() {
    const fragment = document.createDocumentFragment();
    for (const error of rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const row = document.createElement('tr');
      row.dataset.category = error.category;
      const line = document.createElement('td');
      line.textContent = error.line;
      line.title = `Línea ${error.line}, columna ${error.column} del código fuente`;
      const label = document.createElement('td');
      const category = document.createElement('span');
      category.className = `error-category ${error.category}`;
      category.textContent = CATEGORY_LABELS[error.category];
      const snippet = document.createElement('code');
      snippet.className = 'error-fragment';
      snippet.textContent = error.error;
      label.append(category, snippet);
      const justification = document.createElement('td');
      justification.textContent = error.justification;
      row.append(line, label, justification);
      fragment.append(row);
    }
    body.replaceChildren(fragment);
    scroll.scrollTop = 0;
    pageLabel.textContent = `Errores ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, rows.length)} de ${rows.length}`;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * PAGE_SIZE >= rows.length;
  }
  previous.addEventListener('click', () => { if (page > 0) { page--; renderPage(); } });
  next.addEventListener('click', () => { if ((page + 1) * PAGE_SIZE < rows.length) { page++; renderPage(); } });

  return {
    clear() {
      section.hidden = true;
      rows = [];
      body.replaceChildren();
      noticeList.replaceChildren();
      coverage.open = false;
    },
    show(result) {
      rows = result.errors;
      page = 0;
      const counts = ['lexical', 'syntax', 'semantic'].map(category => rows.filter(row => row.category === category).length);
      summary.textContent = `${counts[0]} léxicos · ${counts[1]} sintácticos · ${counts[2]} semánticos`;
      scroll.hidden = rows.length === 0;
      pagination.hidden = rows.length === 0;
      coverage.hidden = result.errorAnalysis.complete;
      const notices = result.errorAnalysis.notices;
      coverageSummary.textContent = `Revisión parcial · ${notices.length ? `${notices.length} aviso(s) de cobertura` : 'se alcanzó un límite de análisis'}`;
      const fragment = document.createDocumentFragment();
      for (const notice of notices) {
        const li = document.createElement('li');
        li.textContent = `Línea ${notice.line}, columna ${notice.column}: ${notice.message}`;
        fragment.append(li);
      }
      noticeList.replaceChildren(fragment);
      renderPage();
      section.hidden = false;
    },
  };
}
