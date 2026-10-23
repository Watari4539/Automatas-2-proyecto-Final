import { numberTreeOperations } from '../tree/numbering.js';

const PRODUCERS = new Set(['operator', 'assignment', 'reference', 'return', 'output', 'conversion']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameFields = (actual, expected) => object(actual) && Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => Object.is(actual[key], value));
const sameOperand = (a, b) => {
  if (a?.kind !== 'externalCall' || b?.kind !== 'externalCall') return sameFields(a, b);
  return Object.keys(a).length === 3 && a.name === b.name && Array.isArray(a.args) && a.args.length === b.args.length && a.args.every((arg, i) => sameOperand(arg, b.args[i]));
};
const sameSource = (a, b) => b === null ? a === null : sameFields(a, b);

/** Checks the contract against source occurrences, without regenerating or evaluating records. */
export function validateQuadruples(tree, data) {
  const diagnostics = [];
  const issue = (code, message, number = null) => diagnostics.push({ code, message, number });
  const finish = (complete = false) => ({ valid: diagnostics.length === 0, complete: diagnostics.length === 0 && complete, diagnostics });
  let ordered;
  try {
    if (!tree?.evaluation || typeof tree.evaluation.complete !== 'boolean') throw new TypeError();
    ordered = numberTreeOperations(tree);
  } catch {
    issue('QUAD_INVALID_TREE', 'La validación requiere un árbol evaluado y estructuralmente válido.');
    return finish();
  }
  if (!object(data) || data.version !== 1 || !Array.isArray(data.records) || !Array.isArray(data.diagnostics)) {
    issue('QUAD_INVALID_DATA', 'La respuesta no cumple el contrato de cuádruplos.');
    return finish();
  }
  if (!['success', 'partial'].includes(data.status)) {
    issue('QUAD_NOT_GENERATED', 'La secuencia no está disponible para validación.');
    return finish();
  }
  if (!Array.isArray(ordered.symbols) || (ordered.contexts !== undefined && !Array.isArray(ordered.contexts))) {
    issue('QUAD_TREE_METADATA', 'Los símbolos y contextos deben ser listas.');
    return finish();
  }
  const nodes = new Map(ordered.nodes.map(node => [node.id, node]));
  const symbols = new Map();
  for (const symbol of ordered.symbols ?? []) {
    if (!object(symbol) || !/^ID[1-9]\d*$/.test(symbol.id) || symbols.has(symbol.id)) issue('QUAD_INVALID_SYMBOLS', 'La tabla de identidades es inválida.');
    else symbols.set(symbol.id, symbol);
  }
  const contexts = new Map();
  for (const context of ordered.contexts ?? []) {
    if (!object(context) || typeof context.id !== 'string' || contexts.has(context.id)) issue('QUAD_INVALID_CONTEXTS', 'Los contextos del árbol son inválidos.');
    else contexts.set(context.id, context);
  }
  const traversal = ordered.numbering.levels.flatMap(row => row.nodeIds.map(id => nodes.get(id)));
  const expectedNodes = traversal.filter(node => PRODUCERS.has(node.kind));
  const numbers = new Map(expectedNodes.map((node, i) => [node.id, i + 1]));
  if (data.records.length !== expectedNodes.length) issue('QUAD_RECORD_COUNT', 'Faltan registros o hay registros adicionales.');
  const resolved = new Map();
  const symbolOperand = symbolId => ({ kind: 'symbol', symbolId });
  for (const node of traversal) {
    if (node.symbolId && !symbols.has(node.symbolId)) issue('QUAD_UNKNOWN_SYMBOL', 'Un nodo utiliza un ID que no pertenece al árbol.');
    const expectedArity = node.kind === 'call' && !node.symbolId ? node.children.length : node.kind === 'operator' ? 2
      : PRODUCERS.has(node.kind) || node.kind === 'entry' || (node.kind === 'call' && node.symbolId) ? 1 : 0;
    if (node.children.length !== expectedArity) issue('QUAD_NODE_ARITY', 'Un nodo no tiene los operandos requeridos.');
    if (PRODUCERS.has(node.kind)) resolved.set(node.id, { kind: 'register', number: numbers.get(node.id) });
    else if (node.kind === 'literal' || node.kind === 'external') resolved.set(node.id, { kind: node.kind, text: node.text });
    else if (node.kind === 'constructor') resolved.set(node.id, { kind: 'constructor', symbolId: node.symbolId });
    else if (node.kind === 'call') {
      if (node.symbolId) {
        if (nodes.get(node.children[0])?.kind !== 'return') issue('QUAD_CALL_RETURN', 'La llamada debe enlazar su retorno.');
        if (contexts.get(node.contextId)?.methodSymbolId !== node.symbolId) issue('QUAD_CALL_CONTEXT', 'El contexto no corresponde al método llamado.');
        resolved.set(node.id, resolved.get(node.children[0]));
      } else resolved.set(node.id, node.children.length ? { kind: 'externalCall', name: node.text.slice(0, -2), args: node.children.map(id => resolved.get(id)) } : { kind: 'external', text: node.text });
    } else if (node.kind !== 'entry') issue('QUAD_NODE_UNSUPPORTED', 'El árbol contiene un nodo sin formato acordado.');
  }
  let pending = 0;
  expectedNodes.forEach((node, index) => {
    const number = index + 1, record = data.records[index];
    if (!object(record)) { issue('QUAD_INVALID_RECORD', 'El registro está ausente o mal formado.', number); return; }
    if (record.number !== number) issue('QUAD_NUMBERING', 'La numeración debe ser continua y comenzar en 1.', number);
    if (record.nodeId !== node.id || record.level !== node.level || record.contextId !== node.contextId || !sameSource(record.source, node.source)) issue('QUAD_ORIGIN', 'El registro no corresponde a la ocurrencia y nivel esperados del árbol.', number);
    for (const operand of [record.left, record.right]) {
      if (!object(operand)) { issue('QUAD_OPERAND', 'Falta un operando estructurado.', number); continue; }
      if (operand.kind === 'register' && (!Number.isSafeInteger(operand.number) || operand.number < 1 || operand.number >= number || data.records[operand.number - 1]?.number !== operand.number)) issue('QUAD_REFERENCE', 'La referencia debe apuntar a un registro anterior existente.', number);
      if (['symbol', 'constructor'].includes(operand.kind) && !symbols.has(operand.symbolId)) issue('QUAD_UNKNOWN_SYMBOL', 'El operando contiene un ID ajeno a la tabla.', number);
    }
    const child = i => resolved.get(node.children[i]);
    let left, right, operator;
    if (node.kind === 'operator') { left = child(0); right = child(1); operator = node.text; }
    else if (node.kind === 'conversion') { left = child(0); right = { kind: 'external', text: node.text }; operator = 'CAST'; }
    else if (node.kind === 'output') { left = { kind: 'main' }; right = child(0); operator = 'SOUT'; }
    else if (node.kind === 'return') {
      const methodId = contexts.get(node.contextId)?.methodSymbolId;
      if (symbols.get(methodId)?.kind !== 'method') issue('QUAD_RETURN_CONTEXT', 'RTN requiere el ID del método de su contexto.', number);
      left = symbolOperand(methodId); right = child(0); operator = 'RTN';
    } else { left = symbolOperand(node.symbolId); right = child(0); operator = '='; }
    if (record.operator !== operator) issue('QUAD_OPERATOR', 'El operador no corresponde al nodo de origen.', number);
    if (!left || !right || !sameOperand(record.left, left) || !sameOperand(record.right, right)) issue('QUAD_PRODUCER', 'Los operandos no apuntan a los productores de esta ocurrencia.', number);
    const evaluation = node.kind === 'output' ? nodes.get(node.children[0])?.evaluation : node.evaluation;
    if (evaluation) {
      const expected = { status: 'available', ...evaluation };
      if (!sameFields(record.result, expected)) issue('QUAD_RESULT', 'El valor, tipo, token o formato difiere del resultado evaluado.', number);
    } else {
      pending++;
      if (!sameFields(record.result, { status: 'pending', value: null, type: null, token: null, display: null })) issue('QUAD_PENDING_RESULT', 'Un resultado no evaluado debe permanecer pendiente y sin valor inventado.', number);
    }
  });
  const root = nodes.get(ordered.rootId);
  if (root.kind === 'entry') {
    const target = resolved.get(root.children[0]);
    if (!object(data.closure) || Object.keys(data.closure).length !== 3 || data.closure.entry !== 'PMAIN' || data.closure.classSymbolId !== root.symbolId || symbols.get(root.symbolId)?.kind !== 'class' || target?.kind !== 'register' || !sameFields(data.closure.target, target)) issue('QUAD_CLOSURE', 'El cierre debe enlazar la clase y PMAIN con el registro final de su rama.');
  } else if (data.closure !== null) issue('QUAD_CLOSURE', 'Un subárbol sin PMAIN no debe inventar un cierre.');
  if (data.status !== (pending ? 'partial' : 'success')) issue('QUAD_STATUS', 'El estado no corresponde a los resultados disponibles.');
  const pendingNumbers = expectedNodes.flatMap((node, i) => (node.kind === 'output' ? nodes.get(node.children[0])?.evaluation : node.evaluation) ? [] : [i + 1]);
  if (data.diagnostics.length !== pendingNumbers.length || data.diagnostics.some((d, i) => !object(d) || d.code !== 'QUAD_VALUE_PENDING' || d.number !== pendingNumbers[i] || d.nodeId !== expectedNodes[pendingNumbers[i] - 1]?.id || typeof d.message !== 'string' || !sameSource(d.source, expectedNodes[pendingNumbers[i] - 1]?.source))) issue('QUAD_DIAGNOSTICS', 'Los avisos no identifican correctamente los resultados pendientes.');
  return finish(pending === 0);
}
