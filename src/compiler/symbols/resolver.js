import { PRIMITIVES } from '../lexical/catalog.js';
import { JAVA_TYPES, JAVA_PACKAGE_ROOTS } from './java-library.js';

/** Relaciona apariciones con entidades; el texto del nombre nunca es su identidad. */
export function resolveNames(model) {
  const { tokens } = model;
  const bindings = new Map();
  const active = new Set();
  const diagnostics = [];
  const reported = new Set();
  const text = index => tokens[index]?.lexeme;
  const external = () => ({ external: true });
  function issue(index, code, message) {
    if (reported.has(index)) return;
    reported.add(index);
    const at = tokens[index];
    diagnostics.push({ code, message, line: at.line, column: at.column });
  }
  function lookup(name, owner, index, kinds) {
    while (owner) {
      const found = (owner.symbols.get(name) ?? []).filter(symbol =>
        kinds.includes(symbol.kind) && (!['local', 'parameter'].includes(symbol.kind) || symbol.declaration <= index));
      if (found.length) return found;
      owner = owner.parent;
    }
    return [];
  }
  function typeBinding(type, owner, index) {
    if (!type) return null;
    if (type.dimensions > 0) return { array: true, elementType: { ...type, dimensions: type.dimensions - 1 }, owner };
    if (PRIMITIVES.has(type.name) || type.name === 'void') return { primitive: type.name };
    const parts = type.name.split('.');
    const classes = lookup(parts[0], owner, index, ['class', 'package']);
    if (classes.length === 1) {
      let symbol = classes[0];
      for (const part of parts.slice(1)) symbol = symbol?.members?.symbols.get(part)?.find(item => item.kind === 'class' || item.kind === 'package');
      if (symbol) return { symbol };
    }
    if (JAVA_TYPES.has(type.name) || model.imports.has(type.name) || JAVA_PACKAGE_ROOTS.has(parts[0])) return external();
    return null;
  }
  function receiver(binding, index) {
    if (!binding) return null;
    if (binding.external || binding.array || binding.primitive) return binding;
    const symbol = binding.symbol;
    if (!symbol) return null;
    if (['class', 'package'].includes(symbol.kind)) return binding;
    return typeBinding(symbol.type, symbol.scope, index);
  }
  function expressionReceiver(index) {
    if (index < 0) return null;
    if (text(index) === ')') {
      const open = model.pairs.get(index);
      const before = open - 1;
      if (tokens[before]?.kind === 'identifier') return receiver(resolve(before), before);
      const type = argumentType(open + 1, index);
      return type ? typeBinding(type, model.scopes[open], open) : null;
    }
    if (text(index) === ']') {
      const open = model.pairs.get(index);
      const parent = expressionReceiver(open - 1);
      return parent?.array ? typeBinding(parent.elementType, parent.owner, index) : null;
    }
    if (text(index) === 'this') return { symbol: model.scopes[index].classSymbol };
    if (tokens[index]?.kind === 'string') return external();
    return receiver(resolve(index), index);
  }
  function argumentRanges(open) {
    const close = model.pairs.get(open);
    const ranges = [];
    let start = open + 1;
    let index = start;
    while (index < close) {
      if (['(', '[', '{'].includes(text(index))) index = model.pairs.get(index) + 1;
      else if (text(index) === ',') { ranges.push([start, index]); start = ++index; }
      else index++;
    }
    if (start < close) ranges.push([start, close]);
    return ranges;
  }
  const inferenceCache = new Map();
  const precedence = new Map([['||', 1], ['&&', 2], ['|', 3], ['^', 4], ['&', 5], ['==', 6], ['!=', 6], ['<', 7], ['>', 7], ['<=', 7], ['>=', 7], ['+', 8], ['-', 8], ['*', 9], ['/', 9], ['%', 9]]);
  function argumentType(start, end, depth = 0) {
    if (depth > 100 || start >= end) return null;
    const key = `${start}:${end}`;
    if (inferenceCache.has(key)) return inferenceCache.get(key);
    const result = inferType(start, end, depth);
    // Unknown results can be provisional while a name is being resolved.
    if (result) inferenceCache.set(key, result);
    return result;
  }
  function inferType(start, end, depth) {
    const type = name => ({ name, dimensions: 0 });
    if (start + 1 === end) {
      const token = tokens[start];
      const literal = { VTE: /[lL]$/.test(token.lexeme) ? 'long' : 'int', VTD: 'double', VTF: 'float', VTC: 'char', VTS: 'String', VTB: 'boolean' }[token.token];
      return literal ? type(literal) : resolve(start)?.symbol?.type ?? null;
    }
    if (text(start) === '(' && model.pairs.get(start) === end - 1) return argumentType(start + 1, end - 1, depth + 1);
    let split = null;
    for (let i = start; i < end; i++) {
      if (['(', '['].includes(text(i))) { i = model.pairs.get(i); continue; }
      const rank = precedence.get(text(i));
      if (rank !== undefined && i > start && !precedence.has(text(i - 1)) && (!split || rank <= split.rank)) split = { index: i, rank };
    }
    if (split) {
      const left = argumentType(start, split.index, depth + 1);
      const right = argumentType(split.index + 1, end, depth + 1);
      if (!left || !right || left.dimensions || right.dimensions) return null;
      const op = text(split.index);
      if (op === '+' && (left.name === 'String' || right.name === 'String')) return type('String');
      const numeric = name => ['byte', 'short', 'char', 'int', 'long', 'float', 'double'].includes(name);
      if (numeric(left.name) && numeric(right.name) && split.rank >= 6) return type(split.rank <= 7 ? 'boolean' : ['double', 'float', 'long'].find(name => name === left.name || name === right.name) ?? 'int');
      return null;
    }
    if (text(start) === '(' && tokens[start + 1]?.token === 'TD' && text(start + 2) === ')') return type(text(start + 1));
    if (['+', '-', '~', '!'].includes(text(start))) return argumentType(start + 1, end, depth + 1);
    if (text(start) === 'new' && tokens[start + 1]?.kind === 'identifier' && model.pairs.get(start + 2) === end - 1) return type(text(start + 1));
    if (text(end - 1) === ')') {
      const open = model.pairs.get(end - 1);
      if (open > start) {
        const binding = resolve(open - 1);
        if (binding?.symbol?.type) return binding.symbol.type;
        if (binding?.external && text(open - 2) === '.') {
          const owner = argumentType(start, open - 2, depth + 1);
          if (owner?.name === 'String') {
            const returns = { length: 'int', charAt: 'char', substring: 'String' };
            if (Object.hasOwn(returns, text(open - 1))) return type(returns[text(open - 1)]);
          }
        }
      }
    }
    // Qualified fields retain their declared type, including object receivers.
    if (text(end - 2) === '.') return resolve(end - 1)?.symbol?.type ?? null;
    return null;
  }
  function choose(candidates, index, call = false) {
    if (call) {
      const ranges = argumentRanges(index + 1);
      candidates = candidates.filter(symbol => symbol.params.length === ranges.length);
      if (candidates.length > 1) {
        const args = ranges.map(([start, end]) => argumentType(start, end));
        // Solo firmas exactas. No simular la resolución completa de sobrecargas Java.
        if (args.every(Boolean)) {
          const exact = candidates.filter(symbol => symbol.params.every((param, i) => param.type.name === args[i].name && param.type.dimensions === args[i].dimensions));
          if (exact.length) candidates = exact;
        }
      }
    }
    if (candidates.length === 1) return { symbol: candidates[0] };
    issue(index, candidates.length ? 'AMBIGUOUS_NAME' : 'UNRESOLVED_NAME', candidates.length
      ? `Hay varias declaraciones posibles para «${text(index)}»; no se asignó un ID por suposición.`
      : `No se encontró una declaración compatible para «${text(index)}».`);
    return null;
  }
  function resolve(index) {
    if (bindings.has(index)) return bindings.get(index);
    if (active.has(index) || !tokens[index]) return null;
    active.add(index);
    let result = null;
    const name = text(index);
    const declared = model.declarations.get(index);
    let chainStart = index;
    while (text(chainStart - 1) === '.') chainStart -= 2;
    const call = text(index + 1) === '(' && text(chainStart - 1) !== 'new';
    if (declared) result = { symbol: declared };
    else if (model.external.has(index)) result = external();
    else if (text(index - 1) === '.') {
      const parent = expressionReceiver(index - 2);
      if (parent?.external || (parent?.array && name === 'length')) result = external();
      else if (parent?.symbol?.members) {
        const candidates = (parent.symbol.members.symbols.get(name) ?? []).filter(symbol =>
          call ? symbol.kind === 'method' : ['field', 'class', 'package'].includes(symbol.kind));
        result = choose(candidates, index, call);
      } else if (tokens[index].kind === 'identifier') issue(index, 'UNRESOLVED_MEMBER', `No se pudo determinar a quién pertenece «${name}».`);
    } else if (tokens[index].kind === 'identifier' || name === 'String') {
      const typePosition = model.typeReferences.has(index) || text(index - 1) === 'new' || text(index - 1) === 'instanceof';
      const kinds = typePosition ? ['class', 'package'] : call ? ['method'] : ['local', 'parameter', 'field', 'class', 'package'];
      const candidates = lookup(name, model.scopes[index], index, kinds);
      if (candidates.length) result = choose(candidates, index, call);
      else if (JAVA_TYPES.has(name) || JAVA_PACKAGE_ROOTS.has(name) || model.imports.has(name)) result = external();
      else if (tokens[index].kind === 'identifier') issue(index, 'UNRESOLVED_NAME', `«${name}» no tiene una declaración visible ni un origen Java reconocido. Conserva el lexema sin numerar.`);
    }
    active.delete(index);
    bindings.set(index, result);
    return result;
  }
  for (const token of tokens) {
    if (token.kind === 'identifier' || token.lexeme === 'String') resolve(token.index);
  }
  return { bindings, diagnostics };
}
