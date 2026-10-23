import { lexicalErrors, sortErrors } from './diagnostics.js';
import { parseForErrors } from './parser.js';
import { checkSemantics } from './semantic.js';
import { attachSourceFragments } from './source-fragments.js';

/** Contrato propio, independiente de las celdas sustituidas de símbolos. */
export function analyzeErrors(source, lexical) {
  const lines = source.split(/\r\n|\r|\n/);
  const eof = { index: lexical.tokens.length, lexeme: '', token: 'EOF', line: lines.length, column: lines.at(-1).length + 1, start: source.length, end: source.length };
  const lex = lexicalErrors(lexical);
  const parsed = parseForErrors(lexical.tokens, lex.invalid, eof);
  const semantic = checkSemantics(parsed);
  const illegalLocations = new Set(lexical.tokens.filter(token => token.kind === 'unknown').map(token => `${token.line}:${token.column}`));
  const notices = [
    ...lexical.diagnostics.filter(item => item.code === 'UNSUPPORTED_TEXT_BLOCK' || (item.code === 'MISSING_TOKEN_RULE' && !illegalLocations.has(`${item.line}:${item.column}`))),
    ...parsed.notices, ...semantic.notices,
  ];
  const keys = new Set();
  const uniqueNotices = notices.filter(item => {
    const key = `${item.code}:${item.line}:${item.column}:${item.message}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }).sort((a, b) => a.line - b.line || a.column - b.column);
  return {
    errors: attachSourceFragments(sortErrors([...lex.errors, ...parsed.errors, ...semantic.errors]), source, lexical.tokens),
    errorAnalysis: { complete: uniqueNotices.length === 0, notices: uniqueNotices },
  };
}
