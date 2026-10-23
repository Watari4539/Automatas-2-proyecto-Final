import { tokenize } from '../compiler/lexical/lexer.js';

/** Presentation only: retain all source text, including comments and incomplete input. */
export function highlightSource(source) {
  const { tokens } = tokenize(source);
  const parts = [];
  const pairs = new Map();
  const stack = [];
  const closing = { ')': '(', ']': '[', '}': '{' };
  let offset = 0;
  tokens.forEach((token, index) => {
    if (token.start > offset) {
      const text = source.slice(offset, token.start);
      parts.push({ start: offset, end: token.start, text, style: /\/[/\*]/.test(text) ? 'comment' : '' });
    }
    const text = token.lexeme;
    let style = '';
    if (['VTS', 'VTC'].includes(token.token) || ['string', 'character'].includes(token.kind)) style = 'string';
    else if (['VTE', 'VTD', 'VTF'].includes(token.token) || token.kind === 'number') style = 'number';
    else if ('()[]{}'.includes(text) && text.length === 1) {
      style = 'bracket';
      if ('([{'.includes(text)) stack.push(token);
      else if (stack.at(-1)?.lexeme === closing[text]) {
        const open = stack.pop(); pairs.set(open.start, token.start); pairs.set(token.start, open.start);
      } else stack.length = 0;
    } else if (token.token === 'ID') {
      style = tokens[index + 1]?.lexeme === '(' ? 'method'
        : ['class', 'new', 'extends', 'implements'].includes(tokens[index - 1]?.lexeme) ? 'type' : 'identifier';
    } else if (token.kind === 'symbol') style = 'operator';
    else style = 'keyword';
    parts.push({ start: token.start, end: token.end, text, style });
    offset = token.end;
  });
  if (offset < source.length) parts.push({ start: offset, end: source.length, text: source.slice(offset), style: 'comment' });
  return { parts, pairs };
}

export function selectedBracket(pairs, start, end) {
  if (end - start > 1) return null;
  if (pairs.has(start)) return [start, pairs.get(start)];
  if (start === end && pairs.has(start - 1)) return [start - 1, pairs.get(start - 1)];
  return null;
}

/** Textarea remains the native editing surface (selection, undo, IME and accessibility). */
export function createSourceHighlighting(input) {
  const stage = document.createElement('div');
  stage.className = 'source-stage';
  const layer = document.createElement('div');
  layer.className = 'source-highlight-viewport';
  layer.setAttribute('aria-hidden', 'true');
  const code = document.createElement('pre');
  code.className = 'source-highlight';
  layer.append(code);
  input.before(stage);
  stage.append(layer, input);
  input.classList.add('source-colorized');
  let pairs = new Map(), spans = new Map(), active = [];
  let frame = null;
  const controller = new AbortController();
  const { signal } = controller;
  function sync() {
    layer.style.width = `${input.clientWidth}px`;
    layer.style.height = `${input.clientHeight}px`;
    code.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  }
  function selection() {
    for (const span of active) span.classList.remove('source-pair');
    active = [];
    if (document.activeElement !== input) return;
    const selected = selectedBracket(pairs, input.selectionStart, input.selectionEnd);
    for (const offset of selected ?? []) {
      const span = spans.get(offset);
      if (span) { span.classList.add('source-pair'); active.push(span); }
    }
  }
  function render() {
    frame = null;
    const result = highlightSource(input.value);
    pairs = result.pairs; spans = new Map();
    const fragment = document.createDocumentFragment();
    for (const part of result.parts) {
      const span = document.createElement('span');
      span.className = part.style ? `source-${part.style}` : '';
      span.textContent = part.text;
      if (pairs.has(part.start)) spans.set(part.start, span);
      fragment.append(span);
    }
    code.replaceChildren(fragment);
    selection(); sync();
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(render); }
  input.addEventListener('input', schedule, { signal });
  input.addEventListener('scroll', sync, { passive: true, signal });
  for (const event of ['select', 'click', 'keyup', 'focus', 'blur']) input.addEventListener(event, selection, { signal });
  document.addEventListener('selectionchange', selection, { signal });
  const observer = new ResizeObserver(sync); observer.observe(input);
  render();
  return { update: render, destroy() {
    controller.abort(); observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame);
    input.classList.remove('source-colorized'); stage.before(input); stage.remove();
  } };
}
