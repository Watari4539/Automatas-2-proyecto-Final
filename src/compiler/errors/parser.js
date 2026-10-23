import { GRAMMAR, IGNORED_STATEMENTS, VALUES, BINARY_PRECEDENCE } from './grammar.js';
import { errorRow, shortName } from './diagnostics.js';
import { JAVA_PACKAGES } from '../symbols/java-library.js';

/** Árbol interno de validación; no es la salida 3 del proyecto. */
export function parseForErrors(tokens, invalidTokens, eof) {
  const errors = [];
  const notices = [];
  const root = { parent: null, kind: 'root', nodes: [], declarations: [] };
  const classes = [];
  const imports = new Set();
  let position = 0;
  let expressionDepth = 0;
  const at = () => tokens[position] ?? eof;
  const is = value => at().lexeme === value;
  const end = () => position >= tokens.length;
  const take = () => tokens[position++] ?? eof;
  const accept = value => is(value) ? take() : null;
  const identifier = token => token?.token === 'ID';
  const typeStart = token => ['TD', 'STR', 'ID'].includes(token?.token);
  const modifiers = new Set(['MA', 'ST', 'TDD', 'SY']);

  function syntax(rule, expected, token = at()) {
    if (invalidTokens.has(token.index)) return;
    if (!Object.hasOwn(GRAMMAR, rule)) throw new Error(`Regla no registrada: ${rule}`);
    errors.push(errorRow('syntax', `EXPECTED_${rule}`, token, `Estructura inválida (${rule})`,
      `En base a la regla gramatical ${rule}, se esperaba ${expected}.`, rule));
  }
  function notice(message, token = at(), code = 'UNREVIEWED_SYNTAX') {
    notices.push({ code, message, line: token.line, column: token.column });
  }
  function expect(value, rule, label = `«${value}»`) {
    if (is(value)) return take();
    syntax(rule, label);
    return { ...at(), lexeme: value, synthetic: true };
  }
  function name(rule) {
    if (identifier(at()) || invalidTokens.has(at().index)) return take();
    syntax(rule, 'un identificador ID');
    if (!end() && ![';', '=', '(', ')', '{', '}', ','].includes(at().lexeme)) return { ...take(), synthetic: true };
    return { ...at(), lexeme: '', synthetic: true };
  }
  function skipBalanced() {
    const pairs = { '(': ')', '[': ']', '{': '}' };
    const opening = take();
    const stack = [pairs[opening.lexeme]];
    while (!end() && stack.length) {
      const token = take();
      if (Object.hasOwn(pairs, token.lexeme)) stack.push(pairs[token.lexeme]);
      else if (token.lexeme === stack.at(-1)) stack.pop();
    }
  }
  function skipStatement() {
    if (is('{')) { skipBalanced(); return; }
    while (!end() && !is('}') && !is(';')) {
      if (is('(') || is('[')) skipBalanced();
      else if (is('{')) { skipBalanced(); return; }
      else take();
    }
    accept(';');
  }
  function ignoreControl() {
    const token = take();
    notice(`No se revisó la construcción «${shortName(token.lexeme)}»: su producción está fuera de las reglas acordadas.`, token);
    if (is('(')) skipBalanced();
    if (is(';')) take();
    else if (IGNORED_STATEMENTS.has(at().lexeme)) ignoreControl();
    else skipStatement();
    if (token.lexeme === 'if' && is('else')) { take(); if (is('if')) ignoreControl(); else skipStatement(); }
    if (token.lexeme === 'do' && accept('while')) { if (is('(')) skipBalanced(); accept(';'); }
    if (token.lexeme === 'try') while (is('catch') || is('finally')) ignoreControl();
  }
  function semicolon(rule) {
    if (accept(';')) return;
    const previous = tokens[position - 1];
    const location = previous && previous.line < at().line ? { ...previous, column: previous.column + previous.lexeme.length } : at();
    syntax(rule, 'un punto y coma FI («;»)', location);
    // Inserción virtual si comienza la siguiente instrucción; no consumirla.
    if (end() || is('}') || typeStart(at()) || is('return') || at().token === 'MA') return;
    skipStatement();
  }
  function readType(rule, allowVoid = false, allowArray = false) {
    const token = at();
    if (!typeStart(token) && !(allowVoid && is('void'))) {
      syntax(rule, allowVoid ? 'un tipo TYPE (TY o TM)' : 'un tipo TY (ID, TD o STR)');
      if (!end() && ![';', '}', ')'].includes(token.lexeme)) take();
      return { name: '?', dimensions: 0, at: token, invalid: true };
    }
    take();
    let typeName = token.lexeme;
    if (is('.')) {
      notice('La revisión de tipos con nombre calificado es parcial.', token);
      while (accept('.')) typeName += `.${name(rule).lexeme}`;
    }
    let dimensions = 0;
    while (is('[')) {
      const bracket = take();
      if (!allowArray) notice('Se reconoce el tipo arreglo; su revisión es parcial.', bracket);
      expect(']', rule);
      dimensions++;
    }
    return { name: typeName, dimensions, at: token };
  }
  function argumentsList() {
    const args = [];
    expect('(', 'OT', 'PA («(»)');
    while (!end() && !is(')') && !is('}') && !is(';')) {
      const start = position;
      const value = expression();
      args.push(value);

      if (!accept(',')) break;
      if (is(')')) syntax('ARG', 'un valor VAL después de CO («,» )');
      if (position === start) { take(); break; }
    }
    expect(')', 'OT', 'PC («)»)');
    return args;
  }
  function primary() {
    const token = at();
    if (invalidTokens.has(token.index) || token.token === null) {
      take();
      return { kind: 'unknown', at: token, invalid: true };
    }
    let node;
    if (['++', '--', '~', '!', '+', '-'].includes(token.lexeme)) {
      take();
      const operand = expression(7);

      node = { kind: 'unary', operator: token.lexeme, operand, at: token };
    } else if (is('(') && tokens[position + 1]?.token === 'TD' && tokens[position + 2]?.lexeme === ')') {
      take();
      const type = take();
      take();
      node = { kind: 'cast', type: type.lexeme, value: expression(7), at: token };
    } else if (accept('(')) {
      const value = expression();
      expect(')', 'EXPC', 'PC («)»)');

      node = { kind: 'group', value, at: token };
    } else if (accept('new')) {
      const type = typeStart(at()) ? take() : name('OBJ');
      if (is('[')) {
        while (accept('[')) { if (!is(']')) expression(); expect(']', 'OBJ'); }
        if (is('{')) skipBalanced();
        notice('La creación de arreglos tiene revisión semántica parcial.', token);
        node = { kind: 'unknown', invalid: true, at: token };
      } else node = { kind: 'new', type: type.lexeme, args: argumentsList(), at: token };
    } else if (VALUES.has(token.token)) {
      take();
      node = identifier(token) ? { kind: 'name', name: token.lexeme, at: token } : { kind: 'literal', at: token };
    } else if (is('null')) {
      take();
      node = { kind: 'null', at: token };
    } else if (is('this') || is('super')) {
      take();
      notice('Los accesos con this o super no tienen una producción acordada; no se validó este acceso.', token);
      node = { kind: 'unknown', invalid: true, at: token };
    } else {
      syntax('EXP', 'una expresión EXP (un valor, acceso o expresión compuesta)', token);
      if (!end() && ![';', ',', ')', '}'].includes(token.lexeme)) take();
      return { kind: 'unknown', invalid: true, at: token };
    }
    while (!end()) {
      if (accept('.')) {
        const member = name('OT');
        node = { kind: 'member', object: node, name: member.lexeme, at: member };
      } else if (is('(')) {

        node = { kind: 'call', callee: node, args: argumentsList(), at: node.at };
      } else if (is('[')) {
        const bracket = take();
        notice('Los accesos a arreglos no tienen una producción acordada.', bracket);
        const value = expression();
        expect(']', 'EXP');
        node = { kind: 'index', object: node, value, at: bracket, invalid: true };
      } else if (is('++') || is('--')) {
        const op = take();

        node = { kind: 'unary', operator: op.lexeme, operand: node, at: op };
      } else break;
    }
    return node;
  }
  function expression(minimum = 0) {
    if (++expressionDepth > 120) {
      notice('La expresión supera el límite de complejidad de esta revisión.', at(), 'EXPRESSION_LIMIT');
      skipStatement();
      expressionDepth--;
      return { kind: 'unknown', invalid: true, at: at() };
    }
    let left = primary();
    while (!end()) {
      const op = at();
      const precedence = Object.hasOwn(BINARY_PRECEDENCE, op.lexeme) ? BINARY_PRECEDENCE[op.lexeme] : undefined;
      if (precedence === undefined || precedence < minimum) break;
      take();
      const right = expression(precedence + 1);
      left = { kind: 'binary', operator: op.lexeme, left, right, at: op };
    }
    expressionDepth--;
    return left;
  }
  function variable(scope, type, id, rule, isStatic = false) {
    const before = errors.length;
    if (type.at.token === 'ID' && is('=') && tokens[position + 1]?.lexeme === 'new') rule = 'OBJ';
    if (is('[')) {
      type = { ...type };
      while (accept('[')) { expect(']', rule); type.dimensions++; }
      notice('Se reconoce el tipo arreglo; su revisión es parcial.', id);
    }
    let value = null;
    if (accept('=')) {
      if (is(';')) {
        syntax(rule, 'una expresión EXP después de ODA («=») y antes de FI («;»)');
        value = { kind: 'unknown', invalid: true, at: at() };
      } else {
        value = expression();

      }
    }
    const more = !!accept(',');
    if (!more) semicolon(rule);
    const node = { kind: 'declare', isStatic, name: id.lexeme, at: id, type, value, scope, invalid: id.synthetic || invalidTokens.has(id.index) || errors.length > before };
    scope.declarations.push(node);
    scope.nodes.push(node);
    if (more) variable(scope, type, name(rule), rule, isStatic);
  }
  function params(main) {
    const result = [];
    expect('(', main ? 'MAIN' : 'METODO', 'PA («(»)');
    while (!end() && !is(')') && !is('{') && !is('}')) {
      const start = position;
      const type = readType(main ? 'MAIN' : 'PARAM', false, main);
      const id = name(main ? 'MAIN' : 'PARAM');
      result.push({ kind: 'parameter', type, name: id.lexeme, at: id, invalid: id.synthetic || invalidTokens.has(id.index) });
      if (!accept(',')) break;
      if (is(')')) syntax('PARAM', 'TY ID después de CO («,» )');
      if (position === start) { take(); break; }
    }
    expect(')', main ? 'MAIN' : 'METODO', 'PC («)»)');
    return result;
  }
  function statement(scope) {
    const start = position;
    const before = errors.length;
    if (invalidTokens.has(at().index)) { skipStatement(); return; }
    if (IGNORED_STATEMENTS.has(at().lexeme)) { ignoreControl(); return; }
    if (is('{')) { notice('Los bloques independientes no tienen una producción acordada.'); skipBalanced(); return; }
    if (at().token === null) { notice('Esta instrucción contiene elementos fuera del catálogo acordado.'); skipStatement(); return; }
    if (accept('return')) {
      const token = tokens[start];
      const value = is(';') ? null : expression();
      semicolon('REE');
      const node = { kind: 'return', value, at: token, invalid: errors.length > before };
      if (!scope.method) syntax('REE', 'RTN dentro de un método', token);

      scope.nodes.push(node);
      return;
    }
    if (typeStart(at()) && (identifier(tokens[position + 1]) || invalidTokens.has(tokens[position + 1]?.index) || at().token === 'TD' || at().token === 'STR')) {
      const type = readType('DEC');
      const id = name('DEC');
      variable(scope, type, id, 'DEC');
      return;
    }
    const value = expression();
    if (accept('=')) {
      const target = value;
      if (target.kind !== 'name' && !target.invalid) syntax('ASIG', 'un ID antes de ODA («=»)', target.at);
      let assigned;
      if (is(';')) { syntax('ASIG', 'una expresión EXP después de ODA («=»)'); assigned = { kind: 'unknown', invalid: true, at: at() }; }
      else assigned = expression();
      semicolon('ASIG');
      scope.nodes.push({ kind: 'assign', target, value: assigned, at: target.at, invalid: errors.length > before });
    } else {
      // ACC no incluye FI en el material. Se tolera el terminador de la
      // instrucción de acceso para SOUT, aclarado por el usuario.
      const sout = tokens[start]?.lexeme === 'System' && tokens[start + 2]?.lexeme === 'out' && ['print', 'println'].includes(tokens[start + 4]?.lexeme);
      if (sout) semicolon('SOUT');
      else semicolon('INST');
      if (!(value.kind === 'call' || value.kind === 'new' || (value.kind === 'unary' && ['++', '--'].includes(value.operator))) && !value.invalid) syntax('INST', 'una declaración, asignación o acceso ACC', value.at);
      scope.nodes.push({ kind: 'expression', value, at: value.at, invalid: errors.length > before });
    }
    if (position === start && !end()) take();
  }
  function body(scope, rule) {
    const unreviewedBefore = notices.length;
    const syntaxBefore = errors.length;
    expect('{', rule, 'LLA («{»)');
    while (!end() && !is('}')) {
      // Un modificador indica probablemente el próximo método tras una llave omitida.
      if (at().token === 'MA') break;
      const start = position;
      statement(scope);
      if (position === start) take();
    }
    expect('}', rule, 'LLC («}»)');
    scope.hasUnreviewed = notices.length > unreviewedBefore || errors.length > syntaxBefore;
  }
  function member(scope) {
    const start = at();
    const mods = [];
    while (modifiers.has(at().token)) mods.push(take());
    if (is('class')) { notice('Las clases anidadas no tienen una producción acordada.', at()); take(); name('CLASE'); if (is('{')) skipBalanced(); return; }
    const type = readType('D_GLOB', true);
    const id = name('D_GLOB');
    if (is('(')) {
      const main = id.lexeme === 'main' && mods.some(t => t.lexeme === 'static') && type.name === 'void';
      const rule = main ? 'MAIN' : 'METODO';
      const parameters = params(main);
      if (main && (parameters.length !== 1 || parameters[0].type.name !== 'String' || parameters[0].type.dimensions !== 1)) syntax('MAIN', 'STR COA COC ID como único parámetro', parameters[0]?.at ?? id);
      const method = { kind: 'method', isStatic: mods.some(t => t.lexeme === 'static'), name: id.lexeme, type, params: parameters, at: id, main, invalid: id.synthetic };
      const methodScope = { parent: scope, kind: 'method', method, nodes: [], declarations: [...parameters] };
      method.scope = methodScope;
      scope.declarations.push(method);
      scope.nodes.push(method);
      body(methodScope, rule);
    } else {

      if (type.name === 'void') syntax('TY', 'un tipo de dato ID, TD o STR', type.at);
      variable(scope, type, id, 'D_GLOB', mods.some(t => t.lexeme === 'static'));
    }
  }
  function classDeclaration() {
    const initial = at();
    while (modifiers.has(at().token)) take();
    expect('class', 'CLASE', 'CL («class»)');
    const id = name('CLASE');
    if (is('extends') || is('implements')) {
      notice('No se revisan las relaciones de herencia ni implementación.');
      while (!end() && !is('{')) take();
    }
    const node = { kind: 'class', name: id.lexeme, at: id, invalid: id.synthetic };
    const scope = { parent: root, kind: 'class', classNode: node, nodes: [], declarations: [] };
    node.scope = scope;
    root.declarations.push(node);
    root.nodes.push(node);
    classes.push(node);
    expect('{', 'CLASE', 'LLA («{»)');
    while (!end() && !is('}')) {
      const start = position;
      if (invalidTokens.has(at().index) || at().token === null) { notice('No se revisó un miembro con elementos fuera de la gramática.'); skipStatement(); }
      else member(scope);
      if (position === start) take();
    }
    expect('}', 'CLASE', 'LLC («}»)');
  }
  function header(kind) {
    const first = take();
    const rule = kind === 'package' ? 'DPACKAGE' : 'IMPORT';
    const parts = [name(rule).lexeme];
    while (accept('.')) {
      if (accept('*')) { parts.push('*'); break; }
      parts.push(name(rule).lexeme);
    }

    if (kind === 'import') {

      if (parts.at(-1) === '*') {
        const path = parts.slice(0, -1).join('.');
        for (const name of Object.hasOwn(JAVA_PACKAGES, path) ? JAVA_PACKAGES[path] : []) imports.add(name);
      }
      else imports.add(parts.at(-1));
    }
    semicolon(rule);
  }

  if (is('package')) header('package');
  while (is('import')) header('import');
  if (!end() && !tokens.some(token => token.lexeme === 'class')) {
    notice('Se revisó un fragmento de instrucciones; no se validó el esqueleto JAVA.', at(), 'FRAGMENT');
    while (!end()) { const start = position; statement(root); if (position === start) take(); }
  } else {
    while (!end()) {
      const start = position;
      if (modifiers.has(at().token) || is('class')) {
        if (classes.length) syntax('JAVA', 'una única CLASE', at());
        classDeclaration();
      } else {
        syntax('JAVA', 'DPACKAGE opcional, IMPORTS y CLASE en ese orden');
        take();
      }
      if (position === start) take();
    }
  }
  if (tokens.length && !classes.length && !root.nodes.length && !notices.length) syntax('JAVA', 'una CLASE después de las declaraciones iniciales', eof);
  return { root, classes, imports, errors, notices };
}
