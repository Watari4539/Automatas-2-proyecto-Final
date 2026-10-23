/** Classroom notation: three reusable slots, not unrestricted three-address code. */
export const THREE_ADDRESS_VERSION = 1;
export const TEMPORARIES = Object.freeze(['T1', 'T2', 'T3']);
export const TEMPORARY_OPERATORS = Object.freeze(['+', '-', '*', '/', '.', 'RTN', 'SOUT']);
export const RESULT_STATUSES = Object.freeze(['empty', 'success', 'partial', 'unsupported', 'blocked', 'limit', 'invalid']);

function positive(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} debe ser un entero positivo.`);
  return value;
}
function identity(value, label) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${label} requiere una identidad.`);
  return value;
}
function symbol(value) {
  if (!/^ID[1-9]\d*$/.test(value)) throw new TypeError('Se requiere un ID del programador.');
  return value;
}
function temporary(value) {
  if (!TEMPORARIES.includes(value)) throw new TypeError('Solo existen T1, T2 y T3.');
  return value;
}

/** Every executable occurrence retains both numbering systems independently. */
export function createOrigin({ quadrupleNumber, nodeId, treeOperationNumber = null, contextId = null, source = null }) {
  positive(quadrupleNumber, 'El número de cuádruplo');
  identity(nodeId, 'El nodo');
  if (treeOperationNumber !== null) positive(treeOperationNumber, 'La operación del árbol');
  if (contextId !== null) identity(contextId, 'El contexto');
  if (source !== null) {
    if (!Number.isSafeInteger(source.start) || source.start < 0 || !Number.isSafeInteger(source.end) || source.end < source.start) throw new TypeError('Intervalo de origen inválido.');
    positive(source.line, 'La línea'); positive(source.column, 'La columna');
    source = { start: source.start, end: source.end, line: source.line, column: source.column };
  }
  return { quadrupleNumber, nodeId, treeOperationNumber, contextId, source };
}

/** Producers distinguish repeated expansions of the same ID in different contexts. */
export function createOperand(value, depth = 0) {
  if (!value || depth > 128) throw new TypeError('Operando inválido o demasiado profundo.');
  switch (value.kind) {
    case 'temporary':
      return { kind: 'temporary', name: temporary(value.name), producer: positive(value.producer, 'El productor') };
    case 'symbol':
      return { kind: 'symbol', symbolId: symbol(value.symbolId), producer: positive(value.producer, 'El productor') };
    case 'symbolIdentity':
      return { kind: 'symbolIdentity', symbolId: symbol(value.symbolId) };
    case 'constructor':
      return { kind: 'constructor', symbolId: symbol(value.symbolId) };
    case 'main': return { kind: 'main' };
    case 'literal':
    case 'external': return { kind: value.kind, text: identity(value.text, 'El lexema') };
    case 'externalCall':
      if (!Array.isArray(value.args)) throw new TypeError('Los argumentos deben ser una lista.');
      return { kind: 'externalCall', name: identity(value.name, 'La llamada'), args: value.args.map(arg => createOperand(arg, depth + 1)) };
    default: throw new TypeError('Clase de operando desconocida.');
  }
}
function temporaryReads(operand) {
  if (operand.kind === 'temporary') return [operand.name];
  if (operand.kind === 'externalCall') return operand.args.flatMap(temporaryReads);
  return [];
}

export function createOperation({ destination, left, operator, right, origin }) {
  temporary(destination);
  if (!TEMPORARY_OPERATORS.includes(operator)) throw new TypeError('Operador sin regla de temporales acordada.');
  left = createOperand(left); right = createOperand(right);
  if ([...temporaryReads(left), ...temporaryReads(right)].includes(destination)) throw new TypeError('Un temporal no puede referenciarse a sí mismo.');
  return { kind: 'operation', destination, left, operator, right, origin: createOrigin(origin) };
}
export function createAssignment({ symbolId, value, origin }) {
  return { kind: 'assignment', symbolId: symbol(symbolId), value: createOperand(value), origin: createOrigin(origin) };
}
export function createPending(origin) {
  const validated = createOrigin(origin);
  positive(validated.treeOperationNumber, 'La operación pendiente del árbol');
  return { kind: 'pending', treeOperationNumber: validated.treeOperationNumber, origin: validated };
}
export function createClosure({ classSymbolId, target }) {
  target = createOperand(target);
  if (!['temporary', 'symbol'].includes(target.kind)) throw new TypeError('El cierre requiere un resultado almacenado.');
  return { kind: 'closure', classSymbolId: symbol(classSymbolId), entry: 'PMAIN', target };
}

/** New state per run. No allocation, execution or scheduling in this stage. */
export function createMemoryState() {
  return {
    temporaries: TEMPORARIES.map(name => ({ name, producer: null, remainingUses: 0 })),
    variables: [], // { symbolId, contextId, producer, remainingUses }
    completed: [], // original quadruple numbers, not output line numbers
    pending: [],   // original quadruple numbers; Pn uses the separate tree number
  };
}
export function createEmptyResult() {
  return { version: THREE_ADDRESS_VERSION, status: 'empty', instructions: [], closure: null, diagnostics: [] };
}
