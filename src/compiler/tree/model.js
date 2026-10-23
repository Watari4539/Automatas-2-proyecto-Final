/** Modelo del árbol académico; no es el AST de validación de la GLC. */
export const NODE_KINDS = Object.freeze([
  'entry', 'output', 'operator', 'assignment', 'literal',
  'reference', 'call', 'constructor', 'return', 'conversion', 'external',
]);

function sourceRange(source) {
  if (source === null) return null;
  const { start, end, line, column } = source;
  if (!Number.isSafeInteger(start) || start < 0 ||
      !Number.isSafeInteger(end) || end < start ||
      !Number.isSafeInteger(line) || line < 1 ||
      !Number.isSafeInteger(column) || column < 1) {
    throw new TypeError('La ubicación requiere start/end UTF-16 y line/column desde 1.');
  }
  return { start, end, line, column };
}

/**
 * Crea ocurrencias distintas vinculadas a los IDs de una misma tabla de símbolos.
 * Los hijos se crean antes que el padre y se pasan en orden visual izquierda-derecha.
 * El resultado contiene datos planos transferibles por el Web Worker, sin DOM ni coordenadas.
 */
export function createTreeBuilder(symbols = []) {
  const symbolIds = new Set();
  const symbolRecords = symbols.map(symbol => {
    if (!/^ID[1-9]\d*$/.test(symbol.id) || symbolIds.has(symbol.id)) {
      throw new TypeError('Cada símbolo debe tener un IDn único de la tabla de símbolos.');
    }
    symbolIds.add(symbol.id);
    return { id: symbol.id, name: symbol.name, kind: symbol.kind, declaration: symbol.declaration };
  });
  const nodes = new Map();

  function addNode({ kind, text = null, symbolId = null, children = [], source = null, contextId = null, castType = null, declaredType = null, constantVariable = false }) {
    if (!NODE_KINDS.includes(kind)) throw new TypeError(`Clase de nodo desconocida: ${kind}`);
    if (symbolId !== null && !symbolIds.has(symbolId)) {
      throw new TypeError(`El símbolo ${symbolId} no pertenece a esta tabla.`);
    }
    // El nombre del programador proviene de symbolId, nunca de una etiqueta libre.
    if (symbolId !== null && text !== null) {
      throw new TypeError('Un nodo de programador usa symbolId, sin texto alternativo.');
    }
    if (symbolId === null && (typeof text !== 'string' || text.length === 0)) {
      throw new TypeError('Un nodo sin símbolo requiere su operador, literal o etiqueta de Java.');
    }
    if (!Array.isArray(children) || children.some(id => !nodes.has(id))) {
      throw new TypeError('Los hijos deben ser IDs de nodos ya creados en este árbol.');
    }
    const range = sourceRange(source);
    if (contextId !== null && (typeof contextId !== 'string' || !contextId)) throw new TypeError('El contexto debe tener un ID de texto.');
    if (castType !== null && (!['assignment', 'return'].includes(kind) || !['byte', 'short', 'int', 'long', 'float', 'double', 'char', 'boolean'].includes(castType))) {
      throw new TypeError('El cast anotado requiere una asignación o retorno y un tipo primitivo.');
    }
    const id = `node${nodes.size + 1}`;
    nodes.set(id, {
      id, kind, text, symbolId, children: [...children], source: range, contextId, castType, declaredType, constantVariable,
      operationNumber: null,
      evaluation: null,
    });
    return id;
  }

  function build(rootId) {
    if (!nodes.has(rootId)) throw new TypeError('La raíz debe pertenecer a este árbol.');
    const visited = new Set();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) {
        throw new TypeError('Cada aparición necesita su propio nodo; no se comparten ramas.');
      }
      visited.add(id);
      const children = nodes.get(id).children;
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
    if (visited.size !== nodes.size) {
      throw new TypeError('Hay nodos sin conectar a la raíz.');
    }
    return {
      version: 1,
      rootId,
      symbols: symbolRecords.map(symbol => ({ ...symbol })),
      nodes: [...nodes.values()].map(node => ({
        ...node, children: [...node.children],
        source: node.source === null ? null : { ...node.source },
      })),
    };
  }

  return { addNode, build };
}
