// Restricted algebra for classroom X.0 notation. Never executes input text.
// Affine expressions ax+b suffice for coefficients, sums and constant divisors.
export function affineSymbol(text) {
  const normalized = text.replace(/\s+/g, '').replace(/[xX](?:\.0)?/g, 'x').replace(/(\d|\))x/g, '$1*x');
  const tokens = normalized.match(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|x|[()+*/-]/g) ?? [];
  if (tokens.join('') !== normalized || tokens.length > 512) return null;
  let at = 0;
  function atom(depth) {
    if (depth > 64) throw new Error();
    const t = tokens[at++];
    if (t === '(') { const v = sum(depth + 1); if (tokens[at++] !== ')') throw new Error(); return v; }
    if (t === '+' || t === '-') { const v=atom(depth+1); return t==='-' ? v.map(n=>-n) : v; }
    if (t === 'x') return [1,0];
    if (!t || !/^\d/.test(t)) throw new Error();
    return [0, Number(t)];
  }
  function product(depth) {
    let a=atom(depth);
    while (['*','/'].includes(tokens[at])) {
      const op=tokens[at++], b=atom(depth);
      if (op === '/') {
        if (b[0] !== 0 || b[1] === 0) throw new Error();
        a=a.map(n=>n/b[1]);
      } else {
        if (a[0] && b[0]) throw new Error();
        a=[a[0]*b[1]+a[1]*b[0],a[1]*b[1]];
      }
    }
    return a;
  }
  function sum(depth) {
    let a=product(depth);
    while (['+','-'].includes(tokens[at])) {
      const sign=tokens[at++]==='+'?1:-1,b=product(depth);
      a=a.map((n,i)=>n+sign*b[i]);
    }
    return a;
  }
  try { const result=sum(0); return at===tokens.length && result.every(Number.isFinite) ? result : null; } catch { return null; }
}
export function equivalentSymbolicText(actual, expected) {
  if (actual === expected) return true;
  const a=affineSymbol(actual), b=affineSymbol(expected);
  return !!a && !!b && a.every((n,i)=>Math.abs(n-b[i]) <= Number.EPSILON*8*Math.max(1,Math.abs(n),Math.abs(b[i])));
}
export function normalizeTupleQuotes(text) {
  let quote=null, escape=false, result='';
  for (const c of text) {
    if (quote) {
      result+=c;
      if (escape) escape=false;
      else if (c==='\\') escape=true;
      else if (c===quote) quote=null;
    } else if (c==='“' || c==='”') result+='"';
    else if (c==='‘' || c==='’') result+="'";
    else {result+=c; if(c==='"'||c==="'")quote=c;}
  }
  return result;
}
