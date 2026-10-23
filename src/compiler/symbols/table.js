/** Único lugar donde se decide la representación de las tres columnas. */
export function buildSymbolTable(tokens, bindings) {
  const ids = new Map();
  const symbols = [];
  const rows = tokens.map(token => {
    const symbol = bindings.get(token.index)?.symbol;
    let id = '';
    let lexeme = token.lexeme;
    let category = token.token;
    if (symbol?.isMain) category = 'PMAIN';
    else if (symbol) {
      if (!ids.has(symbol.key)) {
        id = `ID${ids.size + 1}`;
        ids.set(symbol.key, id);
        symbols.push({ id, name: symbol.name, kind: symbol.kind, declaration: symbol.declaration });
      } else lexeme = ids.get(symbol.key);
    }
    return {
      id, lexeme, token: category, originalLexeme: token.lexeme,
      symbolId: symbol ? ids.get(symbol.key) ?? null : null,
      line: token.line, column: token.column, start: token.start, end: token.end,
    };
  });
  return { rows, symbols };
}
