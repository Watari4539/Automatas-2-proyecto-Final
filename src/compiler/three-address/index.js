import { validateThreeAddress } from './validation.js';
export { validateThreeAddress } from './validation.js';
import { numberTreeOperations } from '../tree/numbering.js';
import { validateQuadruples } from '../quadruples/validation.js';
import { TEMPORARY_OPERATORS, createOrigin, createOperand, createOperation, createAssignment, createPending, createClosure, createMemoryState, createEmptyResult } from './model.js';
import { createMachine, references, schedule } from './scheduler.js';

/** Generate from validated data. Search never executes Java or changes the inputs. */
export function buildThreeAddress(tree, quadruples, options = {}) {
  const result = createEmptyResult();
  let memory = createMemoryState();
  const finish = () => ({ ...result, memory });
  const fail = (status, code, message, origin = null) => {
    result.status = status; result.diagnostics.push({ code, message, origin }); return finish();
  };
  let validation, numbered;
  try {
    validation = validateQuadruples(tree, quadruples);
    if (!validation.valid) return fail('invalid', 'THREE_INVALID_INPUT', 'Los cuádruplos no corresponden a un árbol evaluado válido.');
    numbered = numberTreeOperations(tree);
  } catch {
    return fail('invalid', 'THREE_INVALID_INPUT', 'Se requiere un árbol evaluado y cuádruplos válidos.');
  }
  const nodes = new Map(numbered.nodes.map(node => [node.id, node]));
  const records = quadruples.records;
  const originOf = record => createOrigin({ quadrupleNumber: record.number, nodeId: record.nodeId, treeOperationNumber: nodes.get(record.nodeId).operationNumber, contextId: record.contextId, source: record.source });
  for (const record of records) if (record.operator !== '=' && !TEMPORARY_OPERATORS.includes(record.operator)) {
    return fail('unsupported', 'THREE_OPERATOR_UNSUPPORTED', `El operador ${record.operator} todavía no tiene una regla de temporales acordada.`, originOf(record));
  }
  if (!records.length) return finish();
  const target = quadruples.closure?.target ?? { kind: 'register', number: records.at(-1).number };
  const machine = createMachine(records, target);
  const plan = schedule(records, machine, options);
  result.planning = { states: plan.states, steps: plan.steps, reordered: plan.order.some((n, i) => n !== i) };
  const state = machine.initial(), deferred = new Set();
  function operand(value) {
    if (value.kind === 'register') {
      const cell = machine.location(state, value.number);
      return createOperand(cell.name ? { kind: 'temporary', name: cell.name, producer: value.number } : { kind: 'symbol', symbolId: cell.symbolId, producer: value.number });
    }
    if (value.kind === 'symbol') return createOperand({ kind: 'symbolIdentity', symbolId: value.symbolId });
    if (value.kind === 'externalCall') return createOperand({ ...value, args: value.args.map(operand) });
    return createOperand(value);
  }
  for (const index of plan.order) {
    // Print each skipped tree operation once, only for the final chosen schedule.
    for (let i = 0; i < index; i++) if (!state.done[i] && !deferred.has(i)) {
      const origin = originOf(records[i]);
      if (origin.treeOperationNumber !== null) result.instructions.push(createPending(origin));
      deferred.add(i);
    }
    const record = records[index], origin = originOf(record);
    const left = operand(record.left), right = operand(record.right);
    const destination = machine.execute(state, index);
    result.instructions.push(record.operator === '='
      ? createAssignment({ symbolId: record.left.symbolId, value: right, origin })
      : createOperation({ destination, left, operator: record.operator, right, origin }));
  }
  if (plan.status === 'success' && quadruples.closure) {
    result.closure = createClosure({ classSymbolId: quadruples.closure.classSymbolId, target: operand(target) });
    machine.consume(state, references(target));
  }
  memory = {
    temporaries: state.slots.map(slot => ({ name: slot.name, producer: slot.producers[0] ?? null, remainingUses: slot.producers.reduce((sum,n) => sum + state.remaining[n], 0) })),
    variables: state.variables.map(cell => ({ symbolId: cell.symbolId, contextId: cell.contextId, producer: cell.producers.at(-1) ?? null, producers: [...cell.producers], remainingUses: cell.producers.reduce((sum,n) => sum + state.remaining[n], 0) })),
    completed: plan.order.map(i => records[i].number),
    pending: records.filter((_,i) => !state.done[i]).map(r => r.number),
  };
  if (plan.status !== 'success') {
    const next = records.find((_,i) => !state.done[i]);
    return fail(plan.status, plan.status === 'limit' ? 'THREE_SEARCH_LIMIT' : 'THREE_NO_SCHEDULE', plan.status === 'limit'
      ? 'Se alcanzó el límite de búsqueda. No se concluye que sea imposible resolver este código.'
      : 'No se encontró un orden válido con tres temporales y las variables disponibles, sin sobrescribir valores necesarios.', next ? originOf(next) : null);
  }
  result.status = validation.complete ? 'success' : 'partial';
  if (!validation.complete) result.diagnostics.push({ code: 'THREE_PARTIAL_VALUES', message: 'La secuencia fue generada, pero el árbol contiene valores pendientes de evaluación.', origin: null });
  const output = finish();
  const checked = validateThreeAddress(tree, quadruples, output);
  return { ...output, status: checked.valid ? output.status : 'invalid', validation: checked };
}
