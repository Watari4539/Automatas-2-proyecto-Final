import { TOKEN_CATALOG, OPERATORS, UNCATALOGUED_KEYWORDS } from './catalog.js';

const identifierStart = /[\p{L}\p{Nl}\p{Sc}\p{Pc}]/u;
const identifierPart = /[\p{L}\p{Nl}\p{Sc}\p{Pc}\p{Mn}\p{Mc}\p{Nd}\p{Cf}]/u;
const decimal = /^(?:(?:[0-9](?:[0-9_]*[0-9])?\.(?:[0-9](?:[0-9_]*[0-9])?)?|\.[0-9](?:[0-9_]*[0-9])?)(?:[eE][+-]?[0-9](?:[0-9_]*[0-9])?)?[fFdD]?|[0-9](?:[0-9_]*[0-9])?[eE][+-]?[0-9](?:[0-9_]*[0-9])?[fFdD]?|[0-9](?:[0-9_]*[0-9])?[fFdD])/;
const integer = /^(?:0[xX][0-9a-fA-F](?:[0-9a-fA-F_]*[0-9a-fA-F])?|0[bB][01](?:[01_]*[01])?|[0-9](?:[0-9_]*[0-9])?)[lL]?/;

/** Lexemas con texto original y posiciones UTF-16; líneas/columnas empiezan en 1. */
export function tokenize(source) {
  const tokens = [];
  const diagnostics = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  function advance(text) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\r') {
        if (text[i + 1] === '\n') i++;
        line++;
        column = 1;
      } else if (text[i] === '\n') { line++; column = 1; }
      else column++;
    }
    offset += text.length;
  }
  function emit(text, kind, token) {
    const item = { index: tokens.length, lexeme: text, kind, token, start: offset, end: offset + text.length, line, column };
    tokens.push(item);
    advance(text);
    return item;
  }
  function issue(code, message, at) {
    diagnostics.push({ code, message, line: at.line, column: at.column });
  }

  while (offset < source.length) {
    const rest = source.slice(offset);
    const whitespace = /^\s+/u.exec(rest);
    if (whitespace) { advance(whitespace[0]); continue; }
    if (rest.startsWith('//')) {
      advance(rest.match(/^\/\/[^\r\n]*/)[0]);
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) {
        issue('UNCLOSED_COMMENT', 'El comentario de bloque no tiene cierre */.', { line, column });
        advance(rest);
      } else advance(rest.slice(0, end + 2));
      continue;
    }
    const first = String.fromCodePoint(source.codePointAt(offset));
    if (rest.startsWith('"""')) {
      const end = rest.indexOf('"""', 3);
      const token = emit(end < 0 ? rest : rest.slice(0, end + 3), 'string', null);
      issue('UNSUPPORTED_TEXT_BLOCK', 'Los bloques de texto multilínea no están incluidos en esta versión.', token);
      continue;
    }
    if (first === '"' || first === "'") {
      let length = 1;
      let closed = false;
      while (length < rest.length && !/[\r\n]/.test(rest[length])) {
        if (rest[length] === '\\') {
          if (length + 1 >= rest.length || /[\r\n]/.test(rest[length + 1])) break;
          length += 2;
        } else if (rest[length++] === first) { closed = true; break; }
      }
      const value = rest.slice(0, length);
      const kind = first === '"' ? 'string' : 'character';
      const validChar = first === '"' || /^(?:[^'\\\r\n]|\\(?:[btnfr"'\\]|[0-7]{1,3}|u+[0-9a-fA-F]{4}))$/u.test(value.slice(1, -1));
      const validEscapes = !/\\(?![btnfrs"'\\0-7]|u+[0-9a-fA-F]{4})/.test(value.slice(1, -1).replace(/\\\\/g, ''));
      const token = emit(value, kind, closed && validChar && validEscapes ? (first === '"' ? 'VTS' : 'VTC') : null);
      if (!closed) issue('UNCLOSED_LITERAL', 'El literal no tiene comillas de cierre en la misma línea.', token);
      else if (!validChar) issue('INVALID_CHARACTER', 'Un literal de carácter debe contener un solo carácter o una secuencia de escape.', token);
      else if (!validEscapes) issue('INVALID_ESCAPE', 'Java no reconoce esta secuencia de escape dentro del literal.', token);
      continue;
    }
    if (/\d/.test(first) || (first === '.' && /\d/.test(rest[1] ?? ''))) {
      const match = (/^0[xXbB]/.test(rest) ? integer : decimal).exec(rest) ?? integer.exec(rest);
      let value = match?.[0] ?? first;
      if (identifierPart.test(rest[value.length] ?? '') || rest[value.length] === '.') {
        value = rest.match(/^[\p{L}\p{N}\p{Sc}\p{Pc}.]+/u)?.[0] ?? value;
        const token = emit(value, 'number', null);
        const declarationName = ['TD', 'STR', 'CL'].includes(tokens.at(-2)?.token);
        const identifier = /^\d+[\p{L}\p{Sc}\p{Pc}][\p{L}\p{N}\p{Sc}\p{Pc}]*$/u.test(value) && (declarationName || (!/^\d+[eEfFdDlL]/.test(value) && !/^0[xXbB]/.test(value)));
        issue(identifier ? 'INVALID_IDENTIFIER' : 'INVALID_NUMBER', identifier ? 'Java no permite que un identificador comience con un número.' : `No se pudo reconocer el literal numérico «${value}».`, token);
      } else {
        const floating = !/^0[xXbB]/.test(value) && /[.eEfFdD]/.test(value);
        emit(value, 'number', floating ? (/[fF]$/.test(value) ? 'VTF' : 'VTD') : 'VTE');
      }
      continue;
    }
    if (identifierStart.test(first)) {
      let value = first;
      while (offset + value.length < source.length) {
        const next = String.fromCodePoint(source.codePointAt(offset + value.length));
        if (!identifierPart.test(next)) break;
        value += next;
      }
      const known = Object.hasOwn(TOKEN_CATALOG, value);
      const uncatalogued = UNCATALOGUED_KEYWORDS.has(value);
      const token = emit(value, known || uncatalogued ? 'keyword' : 'identifier', known ? TOKEN_CATALOG[value] : uncatalogued ? null : 'ID');
      if (uncatalogued) issue('MISSING_TOKEN_RULE', `La palabra «${value}» no tiene token acordado en el catálogo.`, token);
      continue;
    }
    const operator = OPERATORS.find(value => rest.startsWith(value));
    const token = emit(operator ?? first, operator ? 'symbol' : 'unknown', TOKEN_CATALOG[operator] ?? null);
    if (!token.token) issue('MISSING_TOKEN_RULE', `El lexema «${token.lexeme}» no tiene token acordado en el catálogo.`, token);
  }
  return { tokens, diagnostics };
}
