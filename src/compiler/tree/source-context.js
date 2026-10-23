import { tokenize } from '../lexical/lexer.js';
import { readStructure } from '../symbols/structure.js';
import { resolveNames } from '../symbols/resolver.js';
import { buildSymbolTable } from '../symbols/table.js';
import { stopTree } from './diagnostics.js';

export const EXPRESSION_SOURCE_LIMIT = 100_000;
const WRITES = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '++', '--']);

/** Reutiliza la misma cadena léxico → ámbitos → resolución → IDs de las tablas. */
export function prepareExpressionSource(source) {
  if (typeof source !== 'string') throw new TypeError('El código fuente debe ser texto.');
  if (source.length > EXPRESSION_SOURCE_LIMIT) {
    stopTree('limit', 'TREE_SOURCE_LIMIT', 'El código supera el límite de 100 000 caracteres.');
  }
  const lexical = tokenize(source);
  const { tokens } = lexical;
  // Protege también el lector de ámbitos, antes de cualquier recursión.
  let depth = 0;
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue;
    if (['(', '[', '{'].includes(token.lexeme)) depth++;
    if ([')', ']', '}'].includes(token.lexeme)) depth--;
    if (depth > 128) stopTree('limit', 'TREE_SOURCE_DEPTH', 'El código supera 128 niveles de anidamiento.', token);
  }
  const badLexeme = lexical.diagnostics.find(item => item.code !== 'MISSING_TOKEN_RULE');
  if (badLexeme || tokens.some(token => token.kind === 'unknown')) {
    const at = badLexeme
      ? tokens.find(token => token.line === badLexeme.line && token.column === badLexeme.column)
      : tokens.find(token => token.kind === 'unknown');
    stopTree('invalid', 'TREE_LEXICAL_ERROR', badLexeme?.message ?? 'Hay un carácter no reconocido.', at);
  }
  const model = readStructure(tokens);
  if (model.diagnostics.length) {
    const issue = model.diagnostics[0];
    const at = tokens.find(token => token.line === issue.line && token.column === issue.column);
    stopTree(issue.code.startsWith('UNSUPPORTED') ? 'unsupported' : 'invalid', `TREE_${issue.code}`, issue.message, at);
  }
  const resolved = resolveNames(model);
  const table = buildSymbolTable(tokens, resolved.bindings);
  const idsByKey = new Map();
  const symbolsById = new Map();
  for (const symbol of model.symbols) {
    const id = table.rows[symbol.declaration]?.symbolId;
    if (id) {
      idsByKey.set(symbol.key, id);
      symbolsById.set(id, symbol);
    }
  }
  const writes = new Map();
  for (const token of tokens) {
    const symbol = resolved.bindings.get(token.index)?.symbol;
    if (!symbol || model.declarations.has(token.index)) continue;
    let start = token.index;
    let end = token.index;
    // También reconoce (a)=..., ++(a) y ++this.a sin interpretar su valor.
    while (tokens[start - 1]?.lexeme === '.') start -= 2;
    while (tokens[start - 1]?.lexeme === '(' && model.pairs.get(start - 1) === end + 1) { start--; end++; }
    if (WRITES.has(tokens[end + 1]?.lexeme) || ['++', '--'].includes(tokens[start - 1]?.lexeme)) {
      const list = writes.get(symbol.key) ?? [];
      list.push(token);
      writes.set(symbol.key, list);
    }
  }
  return { tokens, model, bindings: resolved.bindings, table, idsByKey, symbolsById, writes };
}

/** Intervalo [start, end) de tokens del inicializador; excluye = y ;. */
export function initializerRange(context, symbol) {
  const { tokens, model } = context;
  const at = tokens[symbol.declaration];
  if (!['local', 'field'].includes(symbol.kind)) {
    stopTree('unsupported', 'TREE_NEEDS_CALL_CONTEXT', 'Esta referencia necesita el contexto de una llamada; corresponde a la siguiente etapa.', at);
  }
  if (symbol.type?.dimensions) {
    stopTree('unsupported', 'TREE_ARRAY_PENDING', 'El desarrollo de arreglos aún no tiene reglas acordadas.', at);
  }
  if (tokens[symbol.declaration + 1]?.lexeme !== '=') {
    stopTree('unsupported', 'TREE_NO_INITIALIZER', 'La variable no tiene inicializador; su valor no se supondrá.', at);
  }
  const start = symbol.declaration + 2;
  let end = start;
  while (end < tokens.length) {
    const token = tokens[end];
    if ([';', ','].includes(token.lexeme)) break;
    if (['}', '{'].includes(token.lexeme)) {
      stopTree('unsupported', 'TREE_INITIALIZER_FORM', 'No se admite esta forma de inicializador en el árbol de expresiones.', token);
    }
    if (['(', '['].includes(token.lexeme)) end = model.pairs.get(end) + 1;
    else end++;
  }
  if (!tokens[end] || tokens[end].lexeme !== ';') {
    stopTree('unsupported', 'TREE_DECLARATION_FORM', 'Se requiere una declaración individual terminada en punto y coma.', at);
  }
  // Rechaza también la segunda variable de una declaración en lista.
  if (tokens[symbol.declaration - 1]?.lexeme === ',') {
    stopTree('unsupported', 'TREE_DECLARATION_FORM', 'Las declaraciones en lista no están incluidas.', at);
  }
  return { start, end };
}
