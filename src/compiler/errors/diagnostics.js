export const CATEGORY_ORDER = Object.freeze({ lexical: 0, syntax: 1, semantic: 2 });
export const CATEGORY_LABELS = Object.freeze({ lexical: 'Léxico', syntax: 'Sintáctico', semantic: 'Semántico' });

// Evita que un lexema arbitrariamente largo desborde la explicación del curso.
export const shortName = value => String(value ?? '').replace(/\s+/g, ' ').slice(0, 48);

export function errorRow(category, code, at, error, justification, rule = null) {
  return { category, code, line: at?.line ?? 1, column: at?.column ?? 1, start: at?.start, end: at?.end, error, justification, rule };
}

export function sortErrors(errors) {
  const seen = new Set();
  return errors.filter(row => {
    const key = `${row.category}:${row.code}:${row.line}:${row.column}:${row.justification}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.line - b.line || a.column - b.column);
}

const LEXICAL = {
  INVALID_IDENTIFIER: ['Identificador inválido', 'Java no permite que un identificador comience con un número. Debe comenzar con una letra, un guion bajo o un signo de dólar.'],
  INVALID_NUMBER: ['Número mal formado', 'Java no acepta esta secuencia como un literal numérico válido. Revisa los puntos decimales, los dígitos y el sufijo del número.'],
  UNCLOSED_LITERAL: ['Literal sin cerrar', 'Java no permite que una cadena o un carácter ordinario termine sin sus comillas de cierre en la misma línea.'],
  INVALID_CHARACTER: ['Carácter mal formado', 'Java no permite varios caracteres ni contenido vacío en un literal de carácter. Las comillas simples deben encerrar un carácter o una secuencia de escape válida.'],
  INVALID_ESCAPE: ['Escape inválido', 'Java no reconoce esta secuencia de escape. Después de la barra invertida debe aparecer una combinación válida para un literal.'],
  UNCLOSED_COMMENT: ['Comentario sin cerrar', 'Java requiere cerrar los comentarios de bloque con */. Se alcanzó el final del código sin encontrar ese cierre.'],
};

export function lexicalErrors(lexical) {
  const errors = [];
  const invalid = new Set();
  const positions = new Map(lexical.tokens.map(token => [`${token.line}:${token.column}`, token.index]));
  for (const item of lexical.diagnostics) {
    const definition = LEXICAL[item.code];
    if (!definition) continue;
    errors.push(errorRow('lexical', item.code, item, ...definition));
    const index = positions.get(`${item.line}:${item.column}`);
    if (index !== undefined) invalid.add(index);
  }
  for (const token of lexical.tokens) {
    if (token.kind !== 'unknown') continue;
    invalid.add(token.index);
    errors.push(errorRow('lexical', 'ILLEGAL_CHARACTER', token, 'Carácter no reconocido', `Java no reconoce «${shortName(token.lexeme)}» como un token válido fuera de cadenas, caracteres o comentarios.`));
  }
  return { errors, invalid };
}
