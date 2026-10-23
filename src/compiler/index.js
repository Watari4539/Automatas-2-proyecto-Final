import { tokenize } from './lexical/lexer.js';
import { readStructure } from './symbols/structure.js';
import { resolveNames } from './symbols/resolver.js';
import { buildSymbolTable } from './symbols/table.js';
import { analyzeErrors } from './errors/index.js';

export const MAX_SOURCE_LENGTH = 100_000;

/** API pura: no accede al DOM, no ejecuta Java y no modifica el texto recibido. */
export function requestAnalysis(source) {
  if (typeof source !== 'string') {
    throw new TypeError('El código fuente debe ser una cadena de texto.');
  }
  if (!source.trim()) return { status: 'empty', rows: [], symbols: [], diagnostics: [], errors: [], errorAnalysis: { complete: true, notices: [] } };
  if (source.length > MAX_SOURCE_LENGTH) return {
    status: 'incomplete', rows: [], symbols: [], errors: [], errorAnalysis: { complete: false, notices: [] },
    diagnostics: [{ code: 'SOURCE_LIMIT', message: `El límite de esta versión es ${MAX_SOURCE_LENGTH.toLocaleString('es-MX')} caracteres por análisis.`, line: 1, column: 1 }],
  };
  const lexical = tokenize(source);
  // Límite explícito antes de procesar recursivamente bloques o expresiones.
  let depth = 0;
  for (const token of lexical.tokens) {
    if (token.kind !== 'symbol') continue;
    if (['(', '[', '{'].includes(token.lexeme)) depth++;
    if ([')', ']', '}'].includes(token.lexeme)) depth--;
    if (depth > 160) return {
      status: 'incomplete', ...buildSymbolTable(lexical.tokens, new Map()), errors: [], errorAnalysis: { complete: false, notices: [] },
      diagnostics: [{ code: 'DEPTH_LIMIT', message: 'El código supera el límite de 160 niveles de anidamiento.', line: token.line, column: token.column }],
    };
  }
  const model = readStructure(lexical.tokens);
  const resolved = resolveNames(model);
  const table = buildSymbolTable(lexical.tokens, resolved.bindings);
  const diagnostics = [...lexical.diagnostics, ...model.diagnostics, ...resolved.diagnostics]
    .sort((a, b) => a.line - b.line || a.column - b.column);
  return { status: diagnostics.length ? 'incomplete' : 'success', ...table, diagnostics, ...analyzeErrors(source, lexical) };
}
