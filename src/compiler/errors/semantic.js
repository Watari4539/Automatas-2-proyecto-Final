import { readLiteral, convertValue } from '../tree/values.js';
import { JAVA_TYPES } from '../symbols/java-library.js';
import { PRIMITIVES } from '../lexical/catalog.js';
import { errorRow, shortName } from './diagnostics.js';
import { NUMERIC, INTEGRAL, RANGES, conversion, promoted, literalType, outOfRange, typeName, valueType } from './types.js';

/** Comprueba solo relaciones demostrables, sin ejecutar ni adivinar valores. */
export function checkSemantics(program) {
  const errors = [];
  const notices = [];
  const unknown = () => ({ unknown: true });
  const classMap = new Map(program.classes.map(node => [node.name, node]));
  const verifiedTypes = new WeakSet();
  const initializing = new WeakSet();
  const initializedLocals = new WeakSet();
  let assignmentTarget = null;
  let evaluationDepth = 0;
  let depthReported = false;
  function issue(code, at, title, message) {
    errors.push(errorRow('semantic', code, at, title, message));
  }
  function notReviewed(at, message) {
    notices.push({ code: 'UNREVIEWED_SEMANTICS', line: at.line, column: at.column, message });
  }
  function find(scope, name, kinds, at) {
    while (scope) {
      const found = scope.declarations.filter(node => node.name === name && !node.at.synthetic && kinds.includes(node.kind) &&
        (scope.kind === 'class' || node.kind === 'method' || node.kind === 'class' || node.kind === 'parameter' || node.at.index <= at.index));
      if (found.length) return found;
      scope = scope.parent;
    }
    return [];
  }
  function knownType(type) {
    return type && (PRIMITIVES.has(type.name) || type.name === 'void' || classMap.has(type.name) || JAVA_TYPES.has(type.name) || program.imports.has(type.name));
  }
  function validateType(type) {
    if (!type || type.invalid || verifiedTypes.has(type)) return;
    verifiedTypes.add(type);
    if (!knownType(type)) issue('UNKNOWN_TYPE', type.at, 'Tipo no declarado', `El tipo «${shortName(type.name)}» no está declarado ni importado. No puede utilizarse para declarar una variable, parámetro o retorno.`);
  }
  function nodeType(node) {
    return knownType(node.type) ? { name: node.type.name, dimensions: node.type.dimensions ?? 0, declaration: node } : unknown();
  }
  function staticMethod(scope) {
    while (scope) {
      if (scope.method) return scope.method.isStatic === true;
      scope = scope.parent;
    }
    return false;
  }
  function instanceFieldError(node) {
    issue('INSTANCE_FIELD_IN_STATIC_CONTEXT', node.at, 'Campo de instancia sin objeto',
      `El campo «${shortName(node.name)}» no es static y pertenece a una instancia. Para utilizarlo desde un contexto estático, debes acceder mediante un objeto.`);
    return unknown();
  }
  function named(node, scope) {
    const declarations = find(scope, node.name, ['declare', 'parameter', 'class'], node.at);
    if (declarations.length) {
      const item = declarations[0];
      if (initializing.has(item) && item.scope.kind !== 'class') {
        issue('UNINITIALIZED_LOCAL', node.at, 'Variable sin inicializar', `«${shortName(node.name)}» se utiliza dentro de su propio inicializador antes de recibir un valor.`);
        return unknown();
      }
      if (item.kind === 'declare' && item.scope === scope && scope.kind !== 'class' && !scope.hasUnreviewed && node !== assignmentTarget && !initializedLocals.has(item)) {
        issue('UNINITIALIZED_LOCAL', node.at, 'Variable sin inicializar', `«${shortName(node.name)}» se utiliza antes de recibir un valor. Declárala con un inicializador o asígnale un valor antes de leerla.`);
        return nodeType(item);
      }
      if (item.kind === 'class') return { classReference: item.name, name: item.name, dimensions: 0 };
      if (item.kind === 'declare' && item.scope.kind === 'class' && !item.isStatic && staticMethod(scope)) return instanceFieldError(node);
      return nodeType(item);
    }
    if (JAVA_TYPES.has(node.name) || program.imports.has(node.name)) return { external: true, classReference: node.name, name: node.name, dimensions: 0 };
    issue('UNDECLARED_NAME', node.at, 'Identificador no declarado', `«${shortName(node.name)}» no tiene una declaración visible en este ámbito. Debe declararse antes de utilizarse o pertenecer a una clase accesible.`);
    return unknown();
  }
  function range(value, at) {
    if (outOfRange(value)) {
      issue('NUMERIC_OVERFLOW', at, 'Valor fuera de rango', `El valor constante calculado excede el rango de ${value.name}. La operación o el literal no puede representar ese resultado con este tipo de dato.`);
      return unknown();
    }
    return value;
  }
  function assign(type, source, at, context = 'asignación') {
    if (!source || source.unknown || !knownType(type)) return;
    if (source.classReference) {
      issue('TYPE_AS_VALUE', at, 'Se esperaba un valor', 'Se utilizó el nombre de una clase como valor. Una clase identifica un tipo, no una variable ni una instancia.');
      return;
    }
    if (conversion(type, source, true) !== Infinity) return;
    const narrow = ['byte', 'short', 'char'].includes(type.name) && source.name === 'int' && typeof source.constant === 'bigint';
    issue(narrow ? 'VALUE_OUT_OF_RANGE' : 'INCOMPATIBLE_ASSIGNMENT', at, narrow ? 'Valor fuera de rango' : 'Tipos incompatibles', narrow
      ? `El valor constante no cabe en ${type.name}. Su rango permitido es de ${RANGES[type.name][0]} a ${RANGES[type.name][1]}.`
      : `La ${context} requiere ${shortName(typeName(type))}, pero la expresión produce ${shortName(typeName(source))}. No existe una conversión implícita compatible entre estos tipos.`);
  }
  function member(node, scope) {
    const object = evaluate(node.object, scope);
    if (object.unknown) return unknown();
    if (object.dimensions && node.name === 'length') return valueType('int');
    const owner = classMap.get(object.name);
    if (owner) {
      const target = owner.scope.declarations.find(item => item.kind === 'declare' && item.name === node.name);
      if (target) {
        if (object.classReference && !target.isStatic) return instanceFieldError(node);
        return nodeType(target);
      }
      issue('UNDECLARED_MEMBER', node.at, 'Miembro inexistente', `La clase «${shortName(owner.name)}» no declara el campo «${shortName(node.name)}». No puede accederse a un miembro que no existe.`);
      return unknown();
    }
    const path = `${object.path ?? object.name}.${node.name}`;
    if (['System.out', 'System.err'].includes(path)) return { external: true, name: 'PrintStream', path, dimensions: 0 };
    if (path === 'System.in') return { external: true, name: 'InputStream', path, dimensions: 0 };
    if (object.external || JAVA_TYPES.has(object.name) || program.imports.has(object.name)) {
      notReviewed(node.at, `No se dispone del tipo del miembro externo «${shortName(path)}»; se omitieron las comprobaciones que dependen de él.`);
      return unknown();
    }
    issue('INVALID_MEMBER_ACCESS', node.at, 'Acceso incompatible', `El tipo ${shortName(typeName(object))} no dispone del miembro «${shortName(node.name)}» utilizado en este acceso.`);
    return unknown();
  }
  function checkCall(candidates, args, at, methodName) {
    if (args.some(arg => arg.unknown)) return unknown();
    const count = candidates.filter(method => method.params.length === args.length);
    if (!count.length) {
      const counts = [...new Set(candidates.map(method => method.params.length))].sort((a, b) => a - b).join(' o ');
      issue('ARGUMENT_COUNT', at, 'Cantidad de argumentos incorrecta', `El método «${shortName(methodName)}» recibe ${counts} argumento(s), pero la llamada proporciona ${args.length}. La cantidad debe coincidir con una firma declarada.`);
      return unknown();
    }
    const compatible = count.map(method => ({ method, costs: method.params.map((param, i) => args[i].classReference ? Infinity : conversion(param.type, args[i])) }))
      .filter(item => item.costs.every(cost => cost !== Infinity && cost !== null))
      .map(item => ({ ...item, score: item.costs.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => a.score - b.score);
    if (!compatible.length) {
      if (count.length === 1) {
        const index = count[0].params.findIndex((param, i) => args[i].classReference || conversion(param.type, args[i]) === Infinity);
        if (index < 0) return unknown();
        issue('ARGUMENT_TYPE', at, 'Tipo de argumento incompatible', `El argumento ${index + 1} de «${shortName(methodName)}» debe ser ${shortName(typeName(count[0].params[index].type))}, pero se proporcionó ${shortName(typeName(args[index]))}. Ese tipo no es compatible con el parámetro declarado.`);
      } else issue('NO_MATCHING_OVERLOAD', at, 'Argumentos incompatibles', `Ninguna firma de «${shortName(methodName)}» acepta los tipos proporcionados. Los argumentos deben ser compatibles con los parámetros de una misma declaración.`);
      return unknown();
    }
    if (compatible.length > 1 && compatible[0].score === compatible[1].score) {
      notReviewed(at, `La llamada a «${shortName(methodName)}» requiere una resolución de sobrecargas más amplia; no se eligió una firma por suposición.`);
      return unknown();
    }
    return { ...compatible[0].method.type, constant: undefined };
  }
  function externalCall(object, method, args, at) {
    const signature = (name, parameters = []) => ({ type: valueType(name), params: parameters.map(type => ({ type: valueType(type) })) });
    if (['System.out', 'System.err'].includes(object.path) && ['print', 'println'].includes(method)) {
      if (args.length > 1) issue('ARGUMENT_COUNT', at, 'Cantidad de argumentos incorrecta', `La salida «${method}» admite como máximo un argumento en este proyecto, pero recibió ${args.length}.`);
      else if (args.some(arg => arg.name === 'void')) issue('VOID_ARGUMENT', at, 'Argumento sin valor', 'Un método void no produce un valor que pueda enviarse como argumento a la salida.');
      return valueType('void');
    }
    let signatures;
    if (object.name === 'Math' && method === 'random') signatures = [signature('double')];
    if (object.name === 'Math' && ['max', 'min', 'abs'].includes(method)) {
      signatures = ['int', 'long', 'float', 'double'].map(type => signature(type, method === 'abs' ? [type] : [type, type]));
    }
    if (object.name === 'Math' && ['sqrt', 'sin', 'cos', 'floor', 'ceil'].includes(method)) signatures = [signature('double', ['double'])];
    if (object.name === 'Scanner') {
      const methods = { nextInt: 'int', nextLong: 'long', nextDouble: 'double', nextFloat: 'float', nextBoolean: 'boolean', nextLine: 'String', next: 'String', hasNext: 'boolean', close: 'void' };
      if (Object.hasOwn(methods, method)) signatures = [signature(methods[method])];
    }
    if (object.name === 'String') {
      if (method === 'length') signatures = [signature('int')];
      if (method === 'charAt') signatures = [signature('char', ['int'])];
      if (method === 'substring') signatures = [signature('String', ['int']), signature('String', ['int', 'int'])];
      if (['toUpperCase', 'toLowerCase', 'trim'].includes(method)) signatures = [signature('String')];
      if (method === 'equals') signatures = [signature('boolean', ['Object'])];
    }
    if (signatures) return checkCall(signatures, args, at, `${object.name}.${method}`);
    notReviewed(at, `No se dispone de la firma externa de «${shortName(object.name)}.${shortName(method)}»; no se comprobaron sus parámetros ni su retorno.`);
    return unknown();
  }
  function call(node, scope) {
    const args = node.args.map(arg => evaluate(arg, scope));
    const callee = node.callee;
    if (callee.kind === 'name') {
      const methods = find(scope, callee.name, ['method'], callee.at);
      if (methods.length) return checkCall(methods, args, node.at, callee.name);
      issue('UNDECLARED_METHOD', callee.at, 'Método no declarado', `No existe un método visible llamado «${shortName(callee.name)}». La llamada requiere una declaración accesible con ese nombre.`);
      return unknown();
    }
    if (callee.kind === 'member') {
      const object = evaluate(callee.object, scope);
      if (object.unknown) return unknown();
      const owner = classMap.get(object.name);
      if (owner) {
        const methods = owner.scope.declarations.filter(item => item.kind === 'method' && item.name === callee.name);
        if (methods.length) return checkCall(methods, args, node.at, callee.name);
        issue('UNDECLARED_METHOD', callee.at, 'Método inexistente', `La clase «${shortName(owner.name)}» no declara un método llamado «${shortName(callee.name)}». No puede realizarse esta llamada.`);
        return unknown();
      }
      if (object.external || JAVA_TYPES.has(object.name) || program.imports.has(object.name)) return externalCall(object, callee.name, args, callee.at);
      issue('INVALID_METHOD_RECEIVER', callee.at, 'Llamada incompatible', `El tipo ${shortName(typeName(object))} no contiene el método «${shortName(callee.name)}».`);
    }
    return unknown();
  }
  function binary(node, scope) {
    const left = evaluate(node.left, scope);
    const right = evaluate(node.right, scope);
    if (left.unknown || right.unknown) return unknown();
    const op = node.operator;
    const numeric = !left.dimensions && !right.dimensions && NUMERIC.has(left.name) && NUMERIC.has(right.name);
    const boolean = left.name === 'boolean' && right.name === 'boolean' && !left.dimensions && !right.dimensions;
    if (!left.classReference && !right.classReference && op === '+' && (left.name === 'String' || right.name === 'String') && left.name !== 'void' && right.name !== 'void') return valueType('String');
    if (['<', '>', '<=', '>='].includes(op) && numeric) return valueType('boolean');
    if (['==', '!='].includes(op) && (numeric || boolean || (typeName(left) === typeName(right) && left.name !== 'void'))) return valueType('boolean');
    if (['&', '|', '^', '&&', '||'].includes(op) && boolean) return valueType('boolean');
    if (['<','>','<=','>=','==','!=','&&','||'].includes(op) || !numeric || left.classReference || right.classReference || (['&', '|', '^'].includes(op) && !(INTEGRAL.has(left.name) && INTEGRAL.has(right.name)))) {
      issue('INVALID_OPERANDS', node.at, 'Operandos incompatibles', `El operador «${op}» no admite operandos de tipos ${shortName(typeName(left))} y ${shortName(typeName(right))} en esta combinación. La operación requiere tipos compatibles.`);
      return unknown();
    }
    const result = valueType(promoted(left, right));
    if (left.constant !== undefined && right.constant !== undefined) {
      const integer = INTEGRAL.has(result.name);
      const a = integer ? BigInt(left.constant) : Number(left.constant);
      const b = integer ? BigInt(right.constant) : Number(right.constant);
      if (integer && ['/', '%'].includes(op) && b === 0n) {
        issue('INTEGER_DIVISION_BY_ZERO', node.at, 'División entera por cero', 'El divisor de esta operación entera es la constante cero. La división o el residuo no está definido para ese divisor.');
        return unknown();
      }
      const operations = { '+': () => a + b, '-': () => a - b, '*': () => a * b, '/': () => a / b, '%': () => a % b, '&': () => a & b, '|': () => a | b, '^': () => a ^ b };
      if (operations[op]) result.constant = operations[op]();
    }
    if (result.name === 'float' && result.constant !== undefined) result.constant = Math.fround(result.constant);
    // Non-finite floating operation results are representable; literals still
    // pass through range checks. Preserve the academic integral overflow rule.
    return INTEGRAL.has(result.name) ? range(result, node.at) : result;
  }
  function evaluate(node, scope) {
    if (++evaluationDepth > 120) {
      if (!depthReported) notReviewed(node?.at ?? { line: 1, column: 1 }, 'La expresión supera el límite de profundidad semántica; no se calcularon sus tipos ni sus valores constantes.');
      depthReported = true;
      evaluationDepth--;
      return unknown();
    }
    try { return evaluateInner(node, scope); }
    finally { evaluationDepth--; }
  }
  function evaluateInner(node, scope) {
    if (!node || node.invalid) return unknown();
    if (node.kind === 'null') return valueType('null');
    if (node.kind === 'cast') {
      const source = evaluate(node.value, scope);
      if (source.unknown) return unknown();
      if (!source.dimensions && ((NUMERIC.has(source.name) && NUMERIC.has(node.type)) || (source.name === 'boolean' && node.type === 'boolean'))) {
        if (source.constant !== undefined) {
          const converted = convertValue({type: source.name, value: source.name === 'char' ? String.fromCharCode(Number(source.constant)) : source.constant, constant: true}, node.type, 'cast');
          return valueType(node.type, {constant: converted.type === 'char' ? BigInt(converted.value.charCodeAt(0)) : converted.value});
        }
        return valueType(node.type);
      }
      issue('INVALID_CAST', node.at, 'Conversión incompatible', `No se puede convertir ${typeName(source)} a ${node.type} mediante este cast.`);
      return unknown();
    }
    if (node.kind === 'literal') {
      const result = literalType(node.at);
      if (node.at.token === 'VTC') {
        try { result.constant = BigInt(readLiteral(node.at.lexeme).value.charCodeAt(0)); } catch { return unknown(); }
      }
      if (result.name === 'float' && result.constant !== undefined) result.constant = Math.fround(result.constant);
      return range(result, node.at);
    }
    if (node.kind === 'name') return named(node, scope);
    if (node.kind === 'member') return member(node, scope);
    if (node.kind === 'call') return call(node, scope);
    if (node.kind === 'group') return evaluate(node.value, scope);
    if (node.kind === 'binary') return binary(node, scope);
    if (node.kind === 'new') {
      for (const arg of node.args) evaluate(arg, scope);
      if (!knownType({ name: node.type })) {
        issue('UNKNOWN_TYPE', node.at, 'Clase no declarada', `La clase «${shortName(node.type)}» no está declarada ni importada. No puede crearse una instancia de un tipo desconocido.`);
        return unknown();
      }
      notReviewed(node.at, `No se validó la firma del constructor de «${shortName(node.type)}».`);
      return valueType(node.type);
    }
    if (node.kind === 'unary') {
      // Negation may make the otherwise oversized minimum integer literal valid.
      const operand = node.operator === '-' && node.operand?.kind === 'literal' && node.operand.at.token === 'VTE'
        ? literalType(node.operand.at) : evaluate(node.operand, scope);
      if (operand.unknown) return unknown();
      const op = node.operator;
      const valid = !operand.dimensions && !operand.classReference && (op === '!' ? operand.name === 'boolean' : op === '~' ? INTEGRAL.has(operand.name) : NUMERIC.has(operand.name));
      if (!valid) {
        issue('INVALID_UNARY_OPERAND', node.at, 'Operador unario incompatible', `El operador «${op}» no admite un operando de tipo ${shortName(typeName(operand))}. Su tipo no cumple los requisitos de esta operación.`);
        return unknown();
      }
      if (['++', '--'].includes(op) && !operand.declaration) {
        issue('NOT_ASSIGNABLE', node.at, 'Operando no modificable', `El operador «${op}» requiere una variable modificable. Un literal o resultado temporal no puede incrementarse ni decrementarse.`);
        return unknown();
      }
      const type = op === '!' ? 'boolean' : ['++', '--'].includes(op) ? operand.name : promoted(operand);
      if (['+', '-'].includes(op) && operand.constant !== undefined) {
        return range(valueType(type, { constant: op === '-' ? -operand.constant : operand.constant }), node.at);
      }
      return valueType(type);
    }
    return unknown();
  }
  function checkDuplicates(scope) {
    const seen = new Set();
    for (const node of scope.declarations) {
      if (!node.name || node.at.synthetic) continue;
      const key = node.kind === 'method' ? `method:${node.name}(${node.params.map(param => typeName(param.type)).join(',')})` : `value:${node.name}`;
      if (seen.has(key)) issue('DUPLICATE_DECLARATION', node.at, 'Declaración duplicada', `«${shortName(node.name)}» ya tiene una declaración con la misma identidad en este ámbito. No pueden coexistir ambas declaraciones.`);
      seen.add(key);
    }
  }
  function visit(scope) {
    checkDuplicates(scope);
    for (const parameter of scope.declarations.filter(node => node.kind === 'parameter')) validateType(parameter.type);
    for (const node of scope.nodes) {
      if (node.kind === 'class') { visit(node.scope); continue; }
      if (node.kind === 'method') {
        validateType(node.type);
        visit(node.scope);
        if (node.type.name !== 'void' && !node.scope.nodes.some(item => item.kind === 'return') && !node.scope.hasUnreviewed) issue('MISSING_RETURN', node.at, 'Falta un valor de retorno', `El método «${shortName(node.name)}» declara un retorno ${shortName(typeName(node.type))}, pero su cuerpo no devuelve ningún valor.`);
        continue;
      }
      if (node.kind === 'declare') validateType(node.type);
      if (node.invalid) continue;
      if (node.kind === 'declare' && node.value) {
        initializing.add(node);
        try { assign(node.type, evaluate(node.value, scope), node.at); initializedLocals.add(node); } finally { initializing.delete(node); }
      }
      else if (node.kind === 'assign') {
        assignmentTarget = node.target;
        let target;
        try { target = evaluate(node.target, scope); } finally { assignmentTarget = null; }
        const source = evaluate(node.value, scope);
        if (!target.unknown) {
          if (!target.declaration) issue('NOT_ASSIGNABLE', node.at, 'Destino no asignable', 'El destino no es una variable modificable. Una asignación debe guardar el valor en una variable declarada.');
          else { assign(target, source, node.at); initializedLocals.add(target.declaration); }
        }
      } else if (node.kind === 'expression') evaluate(node.value, scope);
      else if (node.kind === 'return' && scope.method) {
        const target = scope.method.type;
        if (!node.value && target.name !== 'void') issue('MISSING_RETURN_VALUE', node.at, 'Retorno sin valor', `El método debe devolver ${shortName(typeName(target))}, pero return no proporciona ninguna expresión.`);
        if (node.value) {
          const result = evaluate(node.value, scope);
          if (target.name === 'void') issue('VOID_RETURN_VALUE', node.at, 'Retorno incompatible', 'El método está declarado como void y no puede devolver un valor mediante return.');
          else assign(target, result, node.at, 'devolución del método');
        }
      }
    }
  }
  visit(program.root);
  return { errors, notices };
}
