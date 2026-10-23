import { numberTreeOperations } from '../tree/numbering.js';
import { validateQuadruples } from './validation.js';
export { validateQuadruples } from './validation.js';

class UnsupportedQuadruple extends Error {
  constructor(node) {
    super(`No hay formato de cuádruplo para el nodo ${node.kind}.`);
    this.node = node;
  }
}

/** Transforms an evaluated semantic tree; never evaluates expressions or reads the DOM. */
export function buildQuadruples(tree) {
  if (!tree?.evaluation || typeof tree.evaluation.complete !== 'boolean') {
    throw new TypeError('Se requiere un árbol evaluado, no su geometría visual.');
  }
  // Obtain canonical levels without relying on stale coordinates or operation numbers.
  const ordered = numberTreeOperations(tree);
  const nodes = new Map(ordered.nodes.map(node => [node.id, node]));
  const symbols = new Set((ordered.symbols ?? []).map(symbol => symbol.id));
  const contexts = new Map((ordered.contexts ?? []).map(context => [context.id, context]));
  const operands = new Map();
  const records = [], diagnostics = [];
  let closure = null;
  function symbol(id) {
    if (!symbols.has(id)) throw new TypeError('El ID no pertenece a los símbolos del árbol.');
    return { kind: 'symbol', symbolId: id };
  }
  function arity(node, count) {
    if (node.children.length !== count) throw new TypeError(`Cantidad de hijos inválida en ${node.kind}.`);
  }
  function childOperand(node, index = 0) {
    const operand = operands.get(node.children[index]);
    if (!operand) throw new TypeError('Un operando no tiene productor previo.');
    return structuredClone(operand);
  }
  function emit(node, left, operator, right, evaluation = node.evaluation) {
    const number = records.length + 1;
    const result = evaluation
      ? { status: 'available', ...structuredClone(evaluation) }
      : { status: 'pending', value: null, type: null, token: null, display: null };
    records.push({ number, left, operator, right, result, nodeId: node.id, contextId: node.contextId, source: structuredClone(node.source), level: node.level });
    operands.set(node.id, { kind: 'register', number });
    if (result.status === 'pending') diagnostics.push({ code: 'QUAD_VALUE_PENDING', message: 'El nodo no tiene un resultado evaluado disponible.', nodeId: node.id, number, source: structuredClone(node.source) });
  }
  try {
    for (const row of ordered.numbering.levels) {
      for (const id of row.nodeIds) {
        const node = nodes.get(id);
        switch (node.kind) {
          case 'literal':
          case 'external':
            arity(node, 0);
            operands.set(id, { kind: node.kind, text: node.text });
            break;
          case 'constructor':
            arity(node, 0);
            symbol(node.symbolId);
            operands.set(id, { kind: 'constructor', symbolId: node.symbolId });
            break;
          case 'call':
            if (node.symbolId) {
              arity(node, 1);
              symbol(node.symbolId);
              operands.set(id, childOperand(node));
            } else {
              operands.set(id, node.children.length ? { kind: 'externalCall', name: node.text.slice(0, -2), args: node.children.map((_, i) => childOperand(node, i)) } : { kind: 'external', text: node.text });
            }
            break;
          case 'conversion':
            arity(node, 1);
            emit(node, childOperand(node), 'CAST', { kind: 'external', text: node.text });
            break;
          case 'operator':
            arity(node, 2);
            emit(node, childOperand(node), node.text, childOperand(node, 1));
            break;
          case 'assignment':
          case 'reference':
            arity(node, 1);
            emit(node, symbol(node.symbolId), '=', childOperand(node));
            break;
          case 'return': {
            arity(node, 1);
            const methodId = contexts.get(node.contextId)?.methodSymbolId;
            emit(node, symbol(methodId), 'RTN', childOperand(node));
            break;
          }
          case 'output':
            arity(node, 1);
            emit(node, { kind: 'main' }, 'SOUT', childOperand(node), nodes.get(node.children[0]).evaluation);
            break;
          case 'entry': {
            arity(node, 1);
            if (node.id !== ordered.rootId) throw new TypeError('PMAIN debe ser la raíz.');
            symbol(node.symbolId);
            const target = childOperand(node);
            if (target.kind !== 'register') throw new TypeError('El cierre requiere un registro de resultado.');
            closure = { classSymbolId: node.symbolId, entry: 'PMAIN', target };
            break;
          }
          default: throw new UnsupportedQuadruple(node);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof UnsupportedQuadruple)) throw error;
    // Do not expose a prefix as if it were a complete supported sequence.
    return { version: 1, status: 'unsupported', records: [], closure: null, diagnostics: [{ code: 'QUAD_UNSUPPORTED_NODE', message: error.message, nodeId: error.node.id, source: structuredClone(error.node.source) }] };
  }
  const result = { version: 1, status: diagnostics.length ? 'partial' : 'success', records, closure, diagnostics };
  const validation = validateQuadruples(tree, result);
  return { ...result, status: validation.valid ? result.status : 'invalid', validation }; 
}
