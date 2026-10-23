import { numberTreeOperations } from '../tree/numbering.js';
import { validateQuadruples } from '../quadruples/validation.js';
import { TEMPORARY_OPERATORS, TEMPORARIES } from './model.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function same(a, b, depth = 0) {
  if (Object.is(a, b)) return true;
  if (depth > 128 || a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key], depth + 1));
}
function refs(value) {
  if (value.kind === 'register') return [value.number];
  return value.kind === 'externalCall' ? value.args.flatMap(refs) : [];
}

/** Independent replay: never calls the generator, scheduler or its storage simulator. */
export function validateThreeAddress(tree, quadruples, data) {
  const diagnostics = [];
  const reject = (code, message, instruction = null) => {
    diagnostics.push({ code, message, instruction });
    return { valid: false, complete: false, diagnostics };
  };
  let ordered, upstream;
  try {
    upstream = validateQuadruples(tree, quadruples);
    if (!upstream.valid) return reject('THREE_VALIDATION_INPUT', 'El árbol y los cuádruplos de referencia no son válidos.');
    ordered = numberTreeOperations(tree);
  } catch { return reject('THREE_VALIDATION_INPUT', 'No se pudo leer la referencia de árbol y cuádruplos.'); }
  if (!object(data) || data.version !== 1 || !Array.isArray(data.instructions) || !Array.isArray(data.diagnostics)) return reject('THREE_VALIDATION_DATA', 'La salida no cumple el contrato de tres direcciones.');
  if (!['success', 'partial'].includes(data.status)) return reject('THREE_NOT_GENERATED', 'No hay una secuencia completa disponible para validar.');
  const records = quadruples.records;
  if (data.instructions.length > records.length * 2) return reject('THREE_INSTRUCTION_COUNT', 'Hay instrucciones adicionales a las operaciones y pendientes permitidos.');
  const nodes = new Map(ordered.nodes.map(node => [node.id, node]));
  const origins = records.map(r => ({ quadrupleNumber: r.number, nodeId: r.nodeId, treeOperationNumber: nodes.get(r.nodeId).operationNumber, contextId: r.contextId, source: r.source }));
  const remaining = new Map(records.map(r => [r.number, 0]));
  for (const r of records) for (const n of [...refs(r.left), ...refs(r.right)]) remaining.set(n, remaining.get(n) + 1);
  const target = quadruples.closure?.target ?? (records.length ? { kind: 'register', number: records.at(-1).number } : null);
  for (const n of target ? refs(target) : []) remaining.set(n, remaining.get(n) + 1);
  const slots = new Map(TEMPORARIES.map(name => [name, null]));
  const variables = new Map();
  const stored = new Map(); // producer -> actual physical cell
  const completed = [], done = new Set(), announced = new Set();
  let queued = [];
  function resolve(value) {
    if (value.kind === 'register') {
      const cell = stored.get(value.number);
      if (!cell || !done.has(value.number) || remaining.get(value.number) <= 0) return null;
      return cell.kind === 'temporary' ? { kind: 'temporary', name: cell.name, producer: value.number }
        : { kind: 'symbol', symbolId: cell.symbolId, producer: value.number };
    }
    if (value.kind === 'symbol') return { kind: 'symbolIdentity', symbolId: value.symbolId };
    if (value.kind === 'externalCall') {
      const args = value.args.map(resolve);
      return args.some(v => v === null) ? null : { kind: 'externalCall', name: value.name, args };
    }
    return value;
  }
  function consume(numbers) {
    for (const n of numbers) {
      remaining.set(n, remaining.get(n) - 1);
      if (!remaining.get(n)) {
        const cell = stored.get(n);
        if (cell.kind === 'temporary') slots.set(cell.name, null);
        else variables.get(cell.symbolId).producers.delete(n);
        stored.delete(n);
      }
    }
  }
  for (let index = 0; index < data.instructions.length; index++) {
    const instruction = data.instructions[index], line = index + 1;
    if (!object(instruction) || !object(instruction.origin)) return reject('THREE_INSTRUCTION', 'Instrucción u origen ausente.', line);
    const number = instruction.origin.quadrupleNumber;
    if (!Number.isSafeInteger(number) || number < 1 || number > records.length || !same(instruction.origin, origins[number - 1])) return reject('THREE_ORIGIN', 'La instrucción no corresponde al nodo, contexto o numeración originales.', line);
    const record = records[number - 1];
    if (instruction.kind === 'pending') {
      if (!Number.isSafeInteger(instruction.treeOperationNumber) || instruction.treeOperationNumber < 1 || instruction.treeOperationNumber !== origins[number - 1].treeOperationNumber) return reject('THREE_PENDING_NUMBER', 'Pn debe usar el número de operación del árbol.', line);
      if (done.has(number) || announced.has(number) || queued.includes(number)) return reject('THREE_PENDING_DUPLICATE', 'La operación pendiente ya se ejecutó o ya fue anunciada.', line);
      if (!same(instruction, { kind: 'pending', treeOperationNumber: instruction.treeOperationNumber, origin: origins[number - 1] })) return reject('THREE_INSTRUCTION', 'Formato de pendiente inválido.', line);
      queued.push(number);
      continue;
    }
    if (done.has(number)) return reject('THREE_DUPLICATE_OPERATION', 'Una operación se ejecutó más de una vez.', line);
    const expectedPending = records.filter(r => r.number < number && !done.has(r.number) && !announced.has(r.number) && origins[r.number - 1].treeOperationNumber !== null).map(r => r.number);
    if (!same(queued, expectedPending)) return reject('THREE_PENDING_ORDER', 'Faltan pendientes o se anuncian operaciones que no se están posponiendo.', line);
    for (const n of queued) announced.add(n);
    queued = [];
    const left = resolve(record.left), right = resolve(record.right);
    if (left === null || right === null) return reject('THREE_DEPENDENCY', 'Un productor requerido todavía no se ejecutó o su valor ya no está disponible.', line);
    const reads = [...refs(record.left), ...refs(record.right)];
    if (record.operator === '=') {
      if (!same(instruction, { kind: 'assignment', symbolId: record.left.symbolId, value: right, origin: origins[number - 1] })) return reject('THREE_ASSIGNMENT', 'El destino o valor asignado difiere de su cuádruplo.', line);
      const previous = variables.get(record.left.symbolId);
      if (previous) for (const n of previous.producers) {
        const stillNeeded = remaining.get(n) > reads.filter(read => read === n).length;
        const value = records[n - 1];
        const equivalent = previous.contextId === record.contextId && value.result.status === 'available' && record.result.status === 'available' && value.result.type === record.result.type && Object.is(value.result.value, record.result.value);
        if (stillNeeded && !equivalent) return reject('THREE_LIVE_VARIABLE', 'Se sobrescribiría una versión de un ID que aún tiene consumidores.', line);
      }
      consume(reads);
      const cell = variables.get(record.left.symbolId) ?? { contextId: record.contextId, producers: new Set() };
      cell.contextId = record.contextId;
      if (remaining.get(number)) {
        cell.producers.add(number);
        stored.set(number, { kind: 'symbol', symbolId: record.left.symbolId });
      }
      variables.set(record.left.symbolId, cell);
    } else {
      if (!TEMPORARY_OPERATORS.includes(record.operator) || instruction.kind !== 'operation' || instruction.operator !== record.operator) return reject('THREE_OPERATOR', 'El operador no coincide con el cuádruplo o no está soportado.', line);
      if (!same(instruction.left, left) || !same(instruction.right, right)) return reject('THREE_OPERAND', 'Un operando no identifica el valor y productor correctos.', line);
      if (reads.some(n => stored.get(n)?.kind === 'temporary' && stored.get(n).name === instruction.destination)) return reject('THREE_SELF_REFERENCE', 'El temporal de destino se usa como operando de la misma operación.', line);
      const free = TEMPORARIES.find(name => slots.get(name) === null);
      if (!free) return reject('THREE_MEMORY_FULL', 'No hay un temporal libre antes de consumir los operandos.', line);
      if (instruction.destination !== free) return reject('THREE_TEMPORARY_PRIORITY', 'Debe elegirse el temporal libre de menor número.', line);
      if (!same(instruction, { kind: 'operation', destination: free, left, operator: record.operator, right, origin: origins[number - 1] })) return reject('THREE_INSTRUCTION', 'La operación contiene campos inesperados.', line);
      if (record.operator === 'SOUT' && records.some(r => r.number < number && r.operator === 'SOUT' && !done.has(r.number))) return reject('THREE_OUTPUT_ORDER', 'Se alteró el orden de las salidas.', line);
      consume(reads);
      if (remaining.get(number)) { slots.set(free, number); stored.set(number, { kind: 'temporary', name: free }); }
    }
    done.add(number); completed.push(number);
  }
  if (queued.length || done.size !== records.length) return reject('THREE_UNFINISHED', 'Faltan operaciones o quedaron pendientes sin resolver.');
  if (quadruples.closure) {
    const expectedTarget = resolve(target);
    if (!expectedTarget || !same(data.closure, { kind: 'closure', classSymbolId: quadruples.closure.classSymbolId, entry: 'PMAIN', target: expectedTarget })) return reject('THREE_CLOSURE', 'El cierre debe usar el resultado final disponible y la clase original.');
    consume(refs(target));
  } else if (data.closure !== null) return reject('THREE_CLOSURE', 'Este subárbol no tiene cierre PMAIN.');
  const expectedMemory = {
    temporaries: TEMPORARIES.map(name => ({ name, producer: slots.get(name), remainingUses: slots.get(name) === null ? 0 : remaining.get(slots.get(name)) })),
    variables: [...variables].map(([symbolId, cell]) => ({ symbolId, contextId: cell.contextId, producer: [...cell.producers].at(-1) ?? null, producers: [...cell.producers], remainingUses: [...cell.producers].reduce((sum,n) => sum + remaining.get(n), 0) })),
    completed, pending: [],
  };
  if (!same(data.memory, expectedMemory)) return reject('THREE_MEMORY_STATE', 'El estado final de memoria no coincide con la ejecución de las instrucciones.');
  if (data.status !== (upstream.complete ? 'success' : 'partial')) return reject('THREE_STATUS', 'El estado no corresponde a los valores evaluados disponibles.');
  if (upstream.complete ? data.diagnostics.length !== 0 : data.diagnostics.length !== 1 || data.diagnostics[0]?.code !== 'THREE_PARTIAL_VALUES' || data.diagnostics[0]?.origin !== null || typeof data.diagnostics[0]?.message !== 'string') return reject('THREE_DIAGNOSTICS', 'Los avisos no corresponden al estado de evaluación.');
  return { valid: true, complete: upstream.complete, diagnostics };
}
