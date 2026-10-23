import { stopTree } from './diagnostics.js';

/** Separa argumentos completos sin confundir comas dentro de llamadas o grupos. */
export function argumentRanges(context, open, close) {
  const { tokens, model } = context;
  const ranges = [];
  let start = open + 1;
  for (let index = start; index < close; index++) {
    const text = tokens[index].lexeme;
    if (['(', '[', '{'].includes(text)) index = model.pairs.get(index);
    else if (text === ',') {
      if (start === index) stopTree('invalid', 'TREE_EMPTY_ARGUMENT', 'Falta un argumento antes de la coma.', tokens[index]);
      ranges.push({ start, end: index });
      start = index + 1;
    }
  }
  if (start < close) ranges.push({ start, end: close });
  else if (ranges.length) stopTree('invalid', 'TREE_EMPTY_ARGUMENT', 'Falta un argumento después de la coma.', tokens[close]);
  return ranges;
}

/** Lee cuerpos lineales. No omite silenciosamente bloques ni efectos sin regla. */
export function readMethodStatements(context, method) {
  const { tokens, model, bindings } = context;
  let open = model.pairs.get(method.declaration + 1) + 1;
  if (tokens[open]?.lexeme !== '{') {
    stopTree('unsupported', 'TREE_METHOD_BODY', 'Se requiere un método con un cuerpo simple entre llaves.', tokens[method.declaration]);
  }
  const close = model.pairs.get(open);
  const statements = [];
  let start = open + 1;
  while (start < close) {
    if (tokens[start].lexeme === ';') { start++; continue; }
    let end = start;
    while (end < close && tokens[end].lexeme !== ';') {
      const token = tokens[end];
      if (['if', 'else', 'for', 'while', 'do', 'switch', 'try', 'catch', 'synchronized', '{', '}'].includes(token.lexeme)) {
        stopTree('unsupported', 'TREE_CONTROL_FLOW_PENDING', 'Este cuerpo requiere reglas de control de flujo aún no acordadas para el árbol.', token);
      }
      if (['(', '['].includes(token.lexeme)) end = model.pairs.get(end) + 1;
      else end++;
    }
    if (end >= close) stopTree('invalid', 'TREE_STATEMENT_END', 'Falta el punto y coma de la instrucción.', tokens[start]);
    const declarations = model.symbols.filter(symbol => symbol.kind === 'local' && symbol.declaration >= start && symbol.declaration < end);
    if (declarations.length) {
      if (declarations.length !== 1) stopTree('unsupported', 'TREE_DECLARATION_FORM', 'Se requieren declaraciones individuales.', tokens[start]);
      statements.push({ kind: 'declaration', start, end, symbol: declarations[0] });
    } else if (tokens[start].lexeme === 'return') {
      statements.push({ kind: 'return', start, end });
    } else {
      const sout = ['System', '.', 'out', '.'].every((text, offset) => tokens[start + offset]?.lexeme === text)
        && ['print', 'println'].includes(tokens[start + 4]?.lexeme)
        && bindings.get(start)?.external;
      if (sout) {
        if (tokens[start + 5]?.lexeme !== '(' || model.pairs.get(start + 5) !== end - 1) {
          stopTree('invalid', 'TREE_SOUT_FORM', 'Se esperaba una llamada completa a System.out.print o println.', tokens[start]);
        }
        const args = argumentRanges(context, start + 5, end - 1);
        if (args.length > 1) stopTree('invalid', 'TREE_SOUT_ARGUMENTS', 'SOUT recibe como máximo una expresión.', tokens[start]);
        statements.push({ kind: 'output', start, end, argument: args[0] ?? null });
      } else {
        // Las escrituras y otras instrucciones no se descartan como si fueran declaraciones.
        const last = tokens[end - 1];
        if (last?.lexeme !== ')' || !['identifier', 'keyword'].includes(tokens[start].kind)) {
          stopTree('unsupported', 'TREE_STATEMENT_PENDING', 'Esta instrucción aún no tiene representación como detonador.', tokens[start]);
        }
        statements.push({ kind: 'call', start, end });
      }
    }
    start = end + 1;
  }
  return statements;
}
