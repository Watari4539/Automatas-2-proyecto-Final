import { MODIFIERS, PRIMITIVES } from '../lexical/catalog.js';
import { JAVA_PACKAGES } from './java-library.js';

/**
 * Reconoce declaraciones y ámbitos del subconjunto académico, no genera el
 * árbol semántico de la materia ni verifica tipos de las operaciones.
 * Dos pasadas permiten encontrar campos y métodos declarados más adelante.
 */
export function readStructure(tokens) {
  const root = { kind: 'root', parent: null, symbols: new Map() };
  const model = {
    tokens, root, scopes: Array(tokens.length).fill(root), declarations: new Map(),
    typeReferences: new Set(), external: new Set(), imports: new Set(),
    symbols: [], pairs: new Map(), diagnostics: [], mainTokens: new Set(),
  };
  const text = index => tokens[index]?.lexeme;
  function issue(index, code, message) {
    const at = tokens[index] ?? tokens.at(-1) ?? { line: 1, column: 1 };
    model.diagnostics.push({ code, message, line: at.line, column: at.column });
  }
  const stack = [];
  const closing = { ')': '(', ']': '[', '}': '{' };
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue;
    if (['(', '[', '{'].includes(token.lexeme)) stack.push(token.index);
    else if (Object.hasOwn(closing, token.lexeme)) {
      const open = stack.at(-1);
      if (text(open) !== closing[token.lexeme]) issue(token.index, 'UNBALANCED_DELIMITER', `Cierre «${token.lexeme}» sin apertura correspondiente.`);
      else { stack.pop(); model.pairs.set(open, token.index); model.pairs.set(token.index, open); }
    }
  }
  for (const index of stack) issue(index, 'UNBALANCED_DELIMITER', `Falta cerrar «${text(index)}».`);
  if (model.diagnostics.length) return model;

  function scope(kind, parent, classSymbol = parent.classSymbol) {
    return { kind, parent, classSymbol, symbols: new Map() };
  }
  function mark(start, end, owner) {
    for (let index = start; index < end; index++) model.scopes[index] = owner;
  }
  function declare(index, kind, owner, options = {}) {
    const name = text(index);
    const same = owner.symbols.get(name) ?? [];
    if (same.some(item => (item.kind === kind && kind !== 'method') || (['local', 'parameter'].includes(kind) && ['local', 'parameter'].includes(item.kind)))) {
      issue(index, 'DUPLICATE_DECLARATION', `«${name}» ya está declarado en este ámbito.`);
    }
    if (kind === 'local' || kind === 'parameter') {
      let parent = owner.parent;
      while (parent && parent.kind !== 'class' && parent.kind !== 'root') {
        if ((parent.symbols.get(name) ?? []).some(item => ['local', 'parameter'].includes(item.kind))) {
          issue(index, 'OVERLAPPING_LOCAL', `«${name}» vuelve a declararse dentro del ámbito de una variable local o parámetro existente.`);
          break;
        }
        parent = parent.parent;
      }
    }
    const symbol = { key: model.symbols.length, name, kind, declaration: index, scope: owner, ...options };
    same.push(symbol);
    owner.symbols.set(name, same);
    model.symbols.push(symbol);
    model.declarations.set(index, symbol);
    return symbol;
  }
  function modifiers(start) {
    let next = start;
    while (MODIFIERS.has(text(next))) next++;
    return { next, words: tokens.slice(start, next).map(token => token.lexeme) };
  }
  function readType(start, record = false) {
    let next = start;
    const token = tokens[next];
    if (!token || !(PRIMITIVES.has(token.lexeme) || ['String', 'void'].includes(token.lexeme) || token.kind === 'identifier')) return null;
    const indices = [next++];
    while (text(next) === '.' && (tokens[next + 1]?.kind === 'identifier' || text(next + 1) === 'String')) { indices.push(next + 1); next += 2; }
    let dimensions = 0;
    while (text(next) === '[' && text(next + 1) === ']') { dimensions++; next += 2; }
    if (record) for (const index of indices) model.typeReferences.add(index);
    return { name: indices.map(text).join('.'), dimensions, next };
  }
  function expressionEnd(start, end, separators = new Set([';'])) {
    let index = start;
    while (index < end && !separators.has(text(index))) {
      if (['(', '[', '{'].includes(text(index))) index = model.pairs.get(index) + 1;
      else index++;
    }
    return index;
  }
  function variables(start, end, owner, kind) {
    const head = modifiers(start).next;
    const candidate = readType(head);
    if (!candidate || tokens[candidate.next]?.kind !== 'identifier') return false;
    if (!['=', ';', ',', '[', ':'].includes(text(candidate.next + 1)) && candidate.next + 1 !== end) return false;
    const type = readType(head, true);
    let index = type.next;
    while (index < end) {
      if (tokens[index]?.kind !== 'identifier') { issue(index, 'EXPECTED_NAME', 'Se esperaba un nombre en la declaración.'); break; }
      const nameIndex = index++;
      let dimensions = type.dimensions;
      while (text(index) === '[' && text(index + 1) === ']') { dimensions++; index += 2; }
      declare(nameIndex, kind, owner, { type: { name: type.name, dimensions } });
      if (text(index) === '=') index = expressionEnd(index + 1, end, new Set([',', ';']));
      if (text(index) !== ',') break;
      index++;
    }
    return true;
  }
  function parameters(start, end, owner) {
    const params = [];
    let index = start;
    while (index < end) {
      index = modifiers(index).next;
      const type = readType(index, true);
      if (!type || tokens[type.next]?.kind !== 'identifier') {
        issue(index, 'UNSUPPORTED_PARAMETER', 'No se pudo interpretar este parámetro. Se admiten tipos simples y arreglos.');
        break;
      }
      index = type.next;
      const nameIndex = index++;
      let dimensions = type.dimensions;
      while (text(index) === '[' && text(index + 1) === ']') { dimensions++; index += 2; }
      params.push(declare(nameIndex, 'parameter', owner, { type: { name: type.name, dimensions } }));
      if (index < end && text(index) !== ',') { issue(index, 'UNSUPPORTED_PARAMETER', 'Formato de parámetro no admitido todavía.'); break; }
      if (text(index) === ',') index++;
    }
    return params;
  }
  function block(open, owner) {
    const end = model.pairs.get(open);
    mark(open, end + 1, owner);
    let index = open + 1;
    while (index < end) index = statement(index, end, owner);
    return end + 1;
  }
  function controlledBody(index, end, parent) {
    const bodyScope = scope('block', parent);
    return text(index) === '{' ? block(index, bodyScope) : statement(index, end, bodyScope);
  }
  function statement(start, end, owner) {
    const first = text(start);
    if (first === '{') return block(start, scope('block', owner));
    if (first === 'class' || text(modifiers(start).next) === 'class') return classDeclaration(start, owner);
    if (['for', 'catch'].includes(first) && text(start + 1) === '(') {
      const localScope = scope(first, owner);
      const close = model.pairs.get(start + 1);
      mark(start, close + 1, localScope);
      if (first === 'catch') parameters(start + 2, close, localScope);
      else {
        const headerEnd = expressionEnd(start + 2, close, new Set([';', ':']));
        variables(start + 2, headerEnd, localScope, 'local');
        // En for-each la nueva variable no existe en la expresión de colección.
        if (text(headerEnd) === ':') mark(headerEnd + 1, close, owner);
      }
      return controlledBody(close + 1, end, localScope);
    }
    if (['if', 'while', 'switch', 'synchronized'].includes(first) && text(start + 1) === '(') {
      const close = model.pairs.get(start + 1);
      mark(start, close + 1, owner);
      let next = controlledBody(close + 1, end, owner);
      if (first === 'if' && text(next) === 'else') {
        mark(next, next + 1, owner);
        next = controlledBody(next + 1, end, owner);
      }
      return next;
    }
    if (['else', 'finally', 'do'].includes(first)) {
      mark(start, start + 1, owner);
      return controlledBody(start + 1, end, owner);
    }
    if (first === 'try') {
      mark(start, start + 1, owner);
      if (text(start + 1) === '(') {
        issue(start + 1, 'UNSUPPORTED_SYNTAX', 'Los recursos declarados dentro de try aún no están admitidos.');
        return model.pairs.get(start + 1) + 1;
      }
      return controlledBody(start + 1, end, owner);
    }
    if (first === 'case' || first === 'default') {
      const next = expressionEnd(start + 1, end, new Set([':']));
      mark(start, Math.min(next + 1, end), owner);
      return Math.min(next + 1, end);
    }
    const finish = expressionEnd(start, end);
    const next = Math.min(finish + 1, end);
    mark(start, next, owner);
    variables(start, finish, owner, 'local');
    if (finish === end && start < end) issue(start, 'MISSING_SEMICOLON', 'No se encontró ; al final de esta instrucción.');
    return Math.max(next, start + 1);
  }
  function classDeclaration(start, parent) {
    let index = modifiers(start).next;
    const classIndex = index + 1;
    if (tokens[classIndex]?.kind !== 'identifier') { issue(classIndex, 'EXPECTED_CLASS', 'Se esperaba el nombre de la clase.'); return classIndex + 1; }
    const symbol = declare(classIndex, 'class', parent);
    const owner = scope('class', parent, symbol);
    symbol.members = owner;
    index = classIndex + 1;
    while (index < tokens.length && text(index) !== '{') {
      if (tokens[index].kind === 'identifier') model.typeReferences.add(index);
      index++;
    }
    if (index === tokens.length) { issue(classIndex, 'EXPECTED_BODY', 'Falta el cuerpo de la clase.'); return index; }
    const end = model.pairs.get(index);
    mark(start, end + 1, owner);
    index++;
    while (index < end) {
      const memberStart = index;
      const mods = modifiers(index);
      index = mods.next;
      if (text(index) === ';') { index++; continue; }
      if (text(index) === 'class') { index = classDeclaration(memberStart, owner); continue; }
      if (text(index) === '{') { index = block(index, scope('block', owner)); continue; }
      const constructor = text(index) === symbol.name && text(index + 1) === '(';
      const type = constructor ? { name: symbol.name, dimensions: 0, next: index } : readType(index, true);
      if (!type || tokens[type.next]?.kind !== 'identifier') {
        issue(index, 'UNSUPPORTED_MEMBER', 'No se pudo interpretar este miembro. Se admiten campos, métodos y clases con tipos simples o arreglos.');
        // Recuperación hasta ; o cuerpo equilibrado, sin adivinar declaraciones.
        let next = index;
        while (next < end && ![';', '{'].includes(text(next))) next++;
        index = text(next) === '{' ? model.pairs.get(next) + 1 : Math.min(next + 1, end);
        continue;
      }
      const nameIndex = type.next;
      if (text(nameIndex + 1) === '(') {
        const methodScope = scope('method', owner);
        const close = model.pairs.get(nameIndex + 1);
        const params = parameters(nameIndex + 2, close, methodScope);
        const isMain = text(nameIndex) === 'main' && type.name === 'void' && mods.words.includes('public') && mods.words.includes('static') && params.length === 1 && ['String', 'java.lang.String'].includes(params[0].type.name) && params[0].type.dimensions === 1;
        const method = declare(nameIndex, 'method', owner, { type, params, isMain, constructor });
        if (isMain) model.mainTokens.add(nameIndex);
        const duplicates = owner.symbols.get(method.name).filter(item => item.kind === 'method' && item !== method && item.params.map(p => `${p.type.name}:${p.type.dimensions}`).join(',') === params.map(p => `${p.type.name}:${p.type.dimensions}`).join(','));
        if (duplicates.length) issue(nameIndex, 'DUPLICATE_METHOD', `La firma de «${method.name}» está repetida.`);
        index = close + 1;
        if (text(index) === 'throws') {
          while (index < end && !['{', ';'].includes(text(index))) {
            if (tokens[index].kind === 'identifier') model.typeReferences.add(index);
            index++;
          }
        }
        mark(memberStart, index, methodScope);
        if (text(index) === '{') index = block(index, methodScope);
        else if (text(index) === ';') index++;
        else { issue(index, 'EXPECTED_BODY', 'Se esperaba el cuerpo del método o ;.'); index++; }
      } else {
        const finish = expressionEnd(memberStart, end);
        if (!variables(memberStart, finish, owner, 'field')) issue(memberStart, 'UNSUPPORTED_MEMBER', 'Declaración de campo no reconocida.');
        if (finish === end) issue(memberStart, 'MISSING_SEMICOLON', 'Falta ; al final del campo.');
        index = Math.min(finish + 1, end);
      }
    }
    return end + 1;
  }

  let index = 0;
  while (index < tokens.length) {
    if (text(index) === 'package' || text(index) === 'import') {
      const isPackage = text(index) === 'package';
      const end = expressionEnd(index + 1, tokens.length);
      let packageScope = root;
      for (let current = index + 1; current < end; current++) {
        if (tokens[current].kind !== 'identifier' && text(current) !== 'String') continue;
        if (isPackage) {
          const symbol = declare(current, 'package', packageScope);
          packageScope = scope('package', packageScope);
          symbol.members = packageScope;
        } else model.external.add(current);
      }
      if (isPackage) model.packageScope = packageScope;
      if (!isPackage) {
        if (text(end - 1) === '*') {
          const path = tokens.slice(index + 1, end - 2).map(token => token.lexeme).join('');
          const names = Object.hasOwn(JAVA_PACKAGES, path) ? JAVA_PACKAGES[path] : null;
          if (names) for (const name of names) model.imports.add(name);
          else issue(index, 'WILDCARD_IMPORT', 'Esta importación con * no está en el registro local. Usa una importación explícita para distinguir los nombres externos.');
        }
        else if (tokens[end - 1]) model.imports.add(text(end - 1));
      }
      if (end === tokens.length) issue(index, 'MISSING_SEMICOLON', 'Falta ; en la declaración de package o import.');
      index = Math.min(end + 1, tokens.length);
    } else if (text(modifiers(index).next) === 'class') index = classDeclaration(index, root);
    else {
      // Permite también los fragmentos de declaraciones usados en clase.
      index = statement(index, tokens.length, root);
    }
  }
  if (model.packageScope) {
    for (const symbol of model.symbols) {
      if (symbol.kind === 'class' && symbol.scope === root) model.packageScope.symbols.set(symbol.name, [symbol]);
    }
  }
  return model;
}
