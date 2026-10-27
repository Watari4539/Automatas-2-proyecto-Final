/** Reads a primitive cast only when it covers the entire supplied expression.
 * Member access and calls bind tighter than the cast; exterior arithmetic does not.
 * Outer grouping is transparent. Returns null for a cast inside a larger sum. */
export function wholePrimitiveCast(tokens, pairs, start, end) {
  while (tokens[start]?.lexeme === '(' && pairs.get(start) === end - 1) { start++; end--; }
  if (tokens[start]?.lexeme !== '(' || tokens[start+1]?.token !== 'TD' || tokens[start+2]?.lexeme !== ')') return null;
  const operand = start+3;
  if (operand >= end) return null;
  for (let i=operand;i<end;i++) {
    const token=tokens[i];
    if (token.lexeme === '(') { const close=pairs.get(i); if (close === undefined || close >= end) return null; i=close; continue; }
    if (token.kind === 'symbol' && !['.'].includes(token.lexeme)) return null;
  }
  return {start:operand,end,castType:tokens[start+1].lexeme};
}
