import { numberTreeOperations } from './numbering.js';
import { EvaluationError, readLiteral, typedValue, symbolicValue, convertValue, binaryValue, annotation } from './values.js';

const BLOCKED = Symbol('blocked');
const fail = (code, message) => { throw new EvaluationError(code, message); };
const scalar = value => value && typeof value.type === 'string';

/** Evalúa datos del árbol, nunca código fuente Java ni JavaScript proporcionado por el usuario. */
export function evaluateTree(tree) {
  const result = numberTreeOperations(tree);
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const values = new Map();
  const diagnostics = [];
  const evaluatedOperationOrder = [];
  for (const node of result.nodes) node.evaluation = null;

  function one(children) {
    if (children.length !== 1) fail('EVAL_ARITY', 'El nodo requiere exactamente un hijo.');
    return children[0];
  }
  function requireValue(value) {
    if (!scalar(value)) fail('EVAL_VALUE_PENDING', 'Este elemento todavía no dispone de un valor evaluable.');
    return value;
  }
  function access(node, children) {
    if (children.length !== 2) fail('EVAL_ARITY', 'El acceso requiere dos ramas.');
    const [left, right] = children;
    if (left?.marker === 'external' && left.name === 'Math') {
      if (right?.marker === 'externalCall' && right.name === 'random()') {
        // Regla escolar explícita: no usa el generador aleatorio de Java ni el del navegador.
        const value = symbolicValue('double', 'x');
        nodes.get(node.children[1]).evaluation = annotation(value);
        return value;
      }
      if (right?.marker === 'external' && ['PI', 'E'].includes(right.name)) {
        return typedValue('double', right.name === 'PI' ? Math.PI : Math.E, true);
      }
    }
    if (left?.marker === 'object' && scalar(right)) return { ...right, constant: false };
    if (left?.type === 'String' && right?.marker === 'externalCall' && right.name === 'length()') {
      return left.symbolic ? symbolicValue('int', '(' + left.value + ').length()') : typedValue('int', BigInt(left.value.length), false);
    }
    if (left?.type === 'String' && right?.marker === 'externalCall' && ['substring()', 'charAt()'].includes(right.name)) {
      const args = right.args ?? [];
      const charAt = right.name === 'charAt()';
      if ((charAt && args.length !== 1) || (!charAt && ![1, 2].includes(args.length))) fail('EVAL_ARGUMENT_COUNT', 'Cantidad incorrecta de argumentos para el método de String.');
      if (args.some(arg => !['byte', 'short', 'char', 'int'].includes(arg?.type))) fail('EVAL_ARGUMENT_TYPE', 'Los índices de String deben ser enteros compatibles con int.');
      if (left.symbolic || args.some(arg => arg.symbolic)) {
        return symbolicValue(charAt ? 'char' : 'String', '(' + annotation(left).display + ').' + right.name.slice(0, -2) + '(' + args.map(arg => annotation(arg).display).join(',') + ')');
      }
      const indexes = args.map(arg => arg.type === 'char' ? arg.value.charCodeAt(0) : Number(arg.value));
      const [start, end = left.value.length] = indexes;
      if (start < 0 || start > left.value.length || (charAt && start === left.value.length) || end < start || end > left.value.length) fail('EVAL_STRING_BOUNDS', 'El índice o intervalo está fuera de los límites de la cadena.');
      return typedValue(charAt ? 'char' : 'String', charAt ? left.value.charAt(start) : left.value.substring(start, end), false);
    }
    fail('EVAL_ACCESS_PENDING', 'Este acceso externo o de objeto todavía no tiene una regla de evaluación.');
  }

  function evaluate(node, children) {
    switch (node.kind) {
      case 'literal': return readLiteral(node.text);
      case 'external': return { marker: 'external', name: node.text };
      case 'constructor': return { marker: 'object', symbolId: node.symbolId };
      case 'call':
        if (!node.symbolId) return { marker: 'externalCall', name: node.text, args: children.map(requireValue) };
        return { ...requireValue(one(children)), constant: false };
      case 'reference':
        return { ...convertValue(requireValue(one(children)), node.declaredType, 'invocation'), constant: false };
      case 'conversion': return convertValue(requireValue(one(children)), node.text, 'cast');
      case 'assignment': {
        if (one(children)?.marker === 'object') return one(children);
        let value = requireValue(one(children));
        if (node.castType) value = convertValue(value, node.castType, 'cast');
        value = convertValue(value, node.declaredType, 'assignment');
        return { ...value, constant: node.constantVariable && value.constant };
      }
      case 'return': {
        let value = requireValue(one(children));
        if (node.castType) value = convertValue(value, node.castType, 'cast');
        return { ...convertValue(value, node.declaredType, 'assignment'), constant: false };
      }
      case 'operator':
        if (node.text === '.') return access(node, children);
        if (children.length !== 2) fail('EVAL_ARITY', 'La operación binaria requiere dos operandos.');
        return binaryValue(node.text, requireValue(children[0]), requireValue(children[1]));
      case 'entry':
        return children.length ? one(children) : null;
      case 'output': return children.length ? requireValue(one(children)) : null;
      default: fail('EVAL_NODE_PENDING', 'Esta clase de nodo todavía no tiene regla de evaluación.');
    }
  }

  // También procesa nodos de paso sin número (parámetros y llamadas). Así los
  // valores llegan a sus padres sin cambiar el orden numerado de las operaciones.
  for (const level of result.numbering.levels) {
    for (const id of level.nodeIds) {
      const node = nodes.get(id);
      const children = node.children.map(child => values.get(child));
      if (children.includes(BLOCKED)) { values.set(id, BLOCKED); continue; }
      try {
        const value = evaluate(node, children);
        values.set(id, value);
        if (scalar(value) && !['entry', 'output'].includes(node.kind)) node.evaluation = annotation(value);
        else if (value?.marker === 'object') node.evaluation = { type: 'object', value: value.symbolId, token: 'ID', display: `${value.symbolId}()` };
        if (node.operationNumber !== null) {
          if (!node.evaluation) fail('EVAL_VALUE_PENDING', 'La operación todavía no tiene un valor y token definidos.');
          evaluatedOperationOrder.push(id);
        }
      } catch (error) {
        if (!(error instanceof EvaluationError)) throw error;
        values.set(id, BLOCKED);
        node.evaluation = null;
        diagnostics.push({ code: error.code, message: error.message, nodeId: id, operationNumber: node.operationNumber, source: node.source });
      }
    }
  }
  result.evaluation = {
    complete: diagnostics.length === 0,
    evaluatedOperationOrder,
    randomPolicy: 'symbolic-x',
  };
  return { status: diagnostics.length ? 'partial' : 'success', tree: result, diagnostics };
}
