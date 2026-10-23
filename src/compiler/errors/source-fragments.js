const NAME_ERRORS = new Set([
  'UNDECLARED_NAME', 'UNKNOWN_TYPE', 'UNDECLARED_MEMBER', 'DUPLICATE_DECLARATION',
]);
const CALL_ERRORS = new Set([
  'ARGUMENT_COUNT', 'ARGUMENT_TYPE', 'NO_MATCHING_OVERLOAD', 'UNDECLARED_METHOD',
  'INVALID_METHOD_RECEIVER', 'VOID_ARGUMENT', 'MISSING_RETURN',
]);

/** Fragmentos reales del texto original, nunca los IDn de presentación. */
export function attachSourceFragments(errors, source, tokens) {
  const byPosition = new Map(tokens.map(token => [`${token.line}:${token.column}`, token.index]));
  const byStart = new Map(tokens.map(token => [token.start, token.index]));
  const lineStarts = [0];
  for (const match of source.matchAll(/\r\n|\r|\n/g)) lineStarts.push(match.index + match[0].length);

  // Límites de instrucciones. Las comillas y comentarios ya fueron tratados
  // por el lexer, por lo que un ; dentro de una cadena no corta el fragmento.
  const starts = [];
  const ends = [];
  let boundary = 0;
  for (let i = 0; i < tokens.length; i++) {
    starts[i] = boundary;
    if ([';', '{', '}'].includes(tokens[i].lexeme)) boundary = i + 1;
  }
  boundary = tokens.length - 1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if ([';', '{', '}'].includes(tokens[i].lexeme)) boundary = i;
    ends[i] = boundary;
  }

  return errors.map(row => {
    const offset = row.start ?? (lineStarts[row.line - 1] ?? source.length) + row.column - 1;
    let index = byStart.get(offset) ?? byPosition.get(`${row.line}:${row.column}`);
    let start = offset;
    let end = row.end ?? offset;
    if (row.code === 'UNCLOSED_COMMENT') end = source.length;
    else {
      // Un elemento ausente al final se representa con el último fragmento
      // disponible, sin inventar un lexema como «fin de archivo».
      if (index === undefined && offset >= source.length) index = tokens.length - 1;
      const token = tokens[index];
      if (token) {
        start = token.start;
        end = token.end;
        if (row.category === 'lexical' || NAME_ERRORS.has(row.code)) {
          // Lexema exacto: p. ej. 2contador o desconocida.
        } else if (CALL_ERRORS.has(row.code) && tokens[index + 1]?.lexeme === '(') {
          let depth = 0;
          for (let i = index + 1; i < tokens.length; i++) {
            const text = tokens[i].lexeme;
            if (text === '(') depth++;
            if (text === ')' && --depth === 0) { end = tokens[i].end; break; }
            if (text === '{' || text === ';') break;
          }
        } else if (row.code === 'NUMERIC_OVERFLOW' && token.kind === 'number') {
          // El propio literal excede su rango.
        } else {
          start = tokens[starts[index]]?.start ?? token.start;
          end = tokens[ends[index]]?.end ?? token.end;
        }
      }
    }
    return { ...row, description: row.error, error: source.slice(start, end), sourceStart: start, sourceEnd: end };
  });
}
