import { NODE_KINDS } from './model.js';

/** Clases confirmadas como operaciones; independiente de los IDs de símbolos. */
export const NUMBERED_NODE_KINDS = Object.freeze(['operator', 'assignment', 'return', 'conversion']);

/**
 * Devuelve una copia: niveles completos desde abajo, hermanos de izquierda a derecha.
 * No utiliza coordenadas, orden de creación, nombres ni índices del código fuente.
 */
export function numberTreeOperations(tree) {
  if (!tree || !Array.isArray(tree.nodes) || !tree.nodes.length) {
    throw new TypeError('Se requiere un árbol construido con al menos un nodo.');
  }
  const nodes = new Map();
  for (const node of tree.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || nodes.has(node.id) ||
        !NODE_KINDS.includes(node.kind) || !Array.isArray(node.children)) {
      throw new TypeError('Los nodos deben tener identidad única, clase válida e hijos ordenados.');
    }
    nodes.set(node.id, node);
  }
  if (!nodes.has(tree.rootId)) throw new TypeError('La raíz no pertenece al árbol.');

  const rows = [];
  const seen = new Set([tree.rootId]);
  const queue = [{ id: tree.rootId, depth: 0 }];
  // Cola con cursor: evita recursión y el coste repetido de shift().
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { id, depth } = queue[cursor];
    const row = rows[depth] ?? (rows[depth] = []);
    row.push(id);
    for (const child of nodes.get(id).children) {
      if (!nodes.has(child)) throw new TypeError('Un hijo no pertenece al árbol.');
      if (seen.has(child)) throw new TypeError('El árbol contiene un ciclo o una rama compartida.');
      seen.add(child);
      queue.push({ id: child, depth: depth + 1 });
    }
  }
  if (seen.size !== nodes.size) throw new TypeError('Hay nodos desconectados de la raíz.');

  const result = structuredClone(tree);
  const output = new Map(result.nodes.map(node => [node.id, node]));
  const maxDepth = rows.length - 1;
  const operationOrder = [];
  const levels = [];
  for (let depth = maxDepth; depth >= 0; depth--) {
    const level = maxDepth - depth + 1;
    const nodeIds = rows[depth];
    levels.push({ level, depth, nodeIds: [...nodeIds] });
    nodeIds.forEach((id, levelIndex) => {
      const node = output.get(id);
      node.depth = depth;
      node.level = level;
      node.levelIndex = levelIndex;
      node.operationNumber = null;
      if (NUMBERED_NODE_KINDS.includes(node.kind)) {
        operationOrder.push(id);
        node.operationNumber = operationOrder.length;
      }
    });
  }
  result.numbering = {
    operationKinds: [...NUMBERED_NODE_KINDS],
    operationCount: operationOrder.length,
    operationOrder,
    levels,
  };
  return result;
}
