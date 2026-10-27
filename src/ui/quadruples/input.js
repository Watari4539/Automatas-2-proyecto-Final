/** Structured tuple editor. Values remain user data; punctuation is immutable. */
export function createQuadrupleInput(host, onChange) {
  let active = null;
  const title = document.createElement('h2');
  title.textContent = 'Cuádruplos de entrada';
  const keys = document.createElement('div');
  keys.className = 'tuple-keys';
  keys.setAttribute('role', 'group');
  keys.setAttribute('aria-label', 'Atajos para el campo seleccionado');
  const rows = document.createElement('div');
  rows.className = 'tuple-rows';
  const footer = document.createElement('div');
  footer.className = 'tuple-footer';
  const count = document.createElement('span');
  const add = document.createElement('button');
  add.type = 'button'; add.textContent = '+ Agregar renglón';
  const hint = document.createElement('p');
  hint.className = 'tuple-hint';
  hint.textContent = 'Selecciona un campo para usar los atajos. Al quitar filas, revisa las referencias [n].';
  const fields = ['Operando izquierdo', 'Operador', 'Operando derecho', 'Resultado'];
  function renumber() {
    [...rows.children].forEach((row, i) => {
      row.querySelector('.tuple-number').textContent = (i + 1) + '.-';
      row.querySelectorAll('input').forEach((input, j) => input.setAttribute('aria-label', 'Fila ' + (i + 1) + ': ' + fields[j]));
      row.querySelector('button').setAttribute('aria-label', 'Quitar fila ' + (i + 1));
    });
    count.textContent = rows.children.length + ' cuádruplos';
    add.disabled = rows.children.length >= 2000;
  }
  function append(focus = true) {
    const row = document.createElement('div');
    row.className = 'tuple-row';
    const number = document.createElement('span'); number.className = 'tuple-number';
    row.append(number);
    const punctuation = text => { const span = document.createElement('span'); span.textContent = text; span.setAttribute('aria-hidden','true'); row.append(span); };
    punctuation('(');
    fields.forEach((field, i) => {
      const input = document.createElement('input');
      input.type = 'text'; input.placeholder = field; input.autocomplete = 'off';
      input.spellcheck = false; input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off');
      input.addEventListener('focus', () => { active = input; });
      input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); onChange(); });
      row.append(input); punctuation(i === 3 ? ')' : ',');
    });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = '×';
    remove.addEventListener('click', () => {
      const index = [...rows.children].indexOf(row);
      row.remove(); active = null;
      if (!rows.children.length) append(false);
      renumber();
      rows.children[Math.min(index, rows.children.length - 1)].querySelector('input').focus();
      onChange();
    });
    row.append(remove); rows.append(row); renumber();
    if (focus) row.querySelector('input').focus();
  }
  for (const text of ['Math', 'random()', 'length()', 'substring()', 'charAt()', 'PI', 'E', 'System', 'out', 'println()', 'ID', '[]', '+', '-', '*', '/', '.', '=', 'RTN', 'SOUT', 'PMAIN', 'x', '""', "''"]) {
    const key = document.createElement('button');
    key.type = 'button'; key.textContent = text;
    key.addEventListener('pointerdown', event => event.preventDefault());
    key.addEventListener('click', () => {
      if (!active?.isConnected) active = rows.querySelector('input');
      const start = active.selectionStart, end = active.selectionEnd;
      active.setRangeText(text, start, end, 'end');
      if (['[]', '""', "''"].includes(text)) active.setSelectionRange(start + 1, start + 1);
      active.focus(); active.dispatchEvent(new Event('input', {bubbles: true}));
    });
    keys.append(key);
  }
  add.addEventListener('click', () => { append(); onChange(); });
  footer.append(count, add);
  host.append(title, keys, hint, rows, footer);
  append(false);
  return {
    source() {
      return [...rows.children].map((row, i) => (i + 1) + '.- (' + [...row.querySelectorAll('input')].map(input => input.value.trim()).join(', ') + ')').join('\n');
    },
    validate() {
      const missing = [...rows.querySelectorAll('input')].find(input => !input.value.trim());
      if (missing) { missing.setAttribute('aria-invalid', 'true'); missing.focus(); return false; }
      return true;
    },
  };
}
