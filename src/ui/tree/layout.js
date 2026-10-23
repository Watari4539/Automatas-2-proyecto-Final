import { numberTreeOperations } from '../../compiler/tree/numbering.js';

const DEFAULTS = Object.freeze({ siblingGap: 32, levelGap: 56, padding: 32, fontSize: 14, lineHeight: 20, maxLineLength: 24, minRadius: 28 });

function lines(text, limit) {
  return String(text).split('\n').flatMap(line => {
    const chars = Array.from(line);
    if (!chars.length) return [''];
    const result = [];
    for (let i = 0; i < chars.length; i += limit) result.push(chars.slice(i, i + limit).join(''));
    return result;
  });
}

/** Labels never consult programmer names. The original text is retained for accessibility. */
function label(node) {
  if (node.kind === 'return' && node.castType) return `${node.text} (${node.castType})`;
  if (node.kind === 'conversion') return `(${node.text})`;
  if (!node.symbolId) return node.text;
  if (node.kind === 'entry') return `${node.symbolId}\nPMAIN`;
  if (node.kind === 'constructor') return `${node.symbolId}()`;
  if (node.kind === 'assignment') return `${node.symbolId}=${node.castType ? ` (${node.castType})` : ''}`;
  return node.symbolId;
}

/** Pure world coordinates; independent of SVG, screen size, pan and zoom. */
export function layoutTree(tree, options = {}) {
  const config = { ...DEFAULTS, ...options };
  for (const [key, value] of Object.entries(config)) {
    if (!(key in DEFAULTS) || !Number.isFinite(value) || value <= 0) throw new TypeError(`Opción de distribución inválida: ${key}`);
  }
  if (!Number.isInteger(config.maxLineLength)) throw new TypeError('maxLineLength debe ser entero.');
  // Reuses graph validation and the same level ordering as evaluation.
  const numbered = numberTreeOperations(tree);
  const source = new Map(numbered.nodes.map(node => [node.id, node]));
  const measured = new Map();
  const textWidth = text => Array.from(text).length * config.fontSize;
  for (const node of numbered.nodes) {
    const fullLabel = label(node);
    const labelLines = lines(fullLabel, config.maxLineLength);
    // Conservative monospace cells, with all corners inside the circle.
    const radius = Math.max(config.minRadius, Math.hypot(Math.max(...labelLines.map(textWidth)) / 2, labelLines.length * config.lineHeight / 2) + 10);
    const value = node.operationNumber !== null && node.evaluation ? `${node.evaluation.display}\n${node.evaluation.token}` : null;
    const valueLines = value === null ? [] : lines(value, config.maxLineLength);
    const badgeWidth = node.operationNumber === null ? 0 : textWidth(String(node.operationNumber)) + 16;
    const annotationWidth = valueLines.length ? Math.max(...valueLines.map(textWidth)) + 16 : 0;
    const halfWidth = radius + Math.max(badgeWidth, annotationWidth);
    const halfHeight = Math.max(radius, valueLines.length * config.lineHeight / 2);
    measured.set(node.id, { id: node.id, depth: node.depth, level: node.level, operationNumber: node.operationNumber, fullLabel, labelLines, valueLines, radius, halfWidth, halfHeight });
  }

  // Contours record occupied space at each depth, including annotations.
  // Only overlapping depths constrain neighbouring subtrees; shallow leaves
  // therefore do not reserve a full column all the way to the last row.
  const subtrees = new Map();
  const offsets = new Map();
  for (const row of numbered.numbering.levels) {
    for (const id of row.nodeIds) {
      const node = source.get(id);
      const shape = measured.get(id);
      const left = [], right = [], childOffsets = [];
      for (const child of node.children) {
        const contour = subtrees.get(child);
        let shift = 0;
        for (let depth = 0; depth < Math.min(right.length, contour.left.length); depth++) {
          shift = Math.max(shift, right[depth] + config.siblingGap - contour.left[depth]);
        }
        childOffsets.push(shift);
        contour.left.forEach((x, depth) => {
          left[depth] = Math.min(left[depth] ?? Infinity, x + shift);
          right[depth] = Math.max(right[depth] ?? -Infinity, contour.right[depth] + shift);
        });
      }
      const center = childOffsets.length ? (childOffsets[0] + childOffsets.at(-1)) / 2 : 0;
      node.children.forEach((child, index) => offsets.set(child, childOffsets[index] - center));
      subtrees.set(id, { left: [-shape.halfWidth, ...left.map(x => x - center)], right: [shape.halfWidth, ...right.map(x => x - center)] });
    }
  }

  const rows = [...numbered.numbering.levels].reverse();
  const rowHeights = rows.map(row => Math.max(...row.nodeIds.map(id => measured.get(id).halfHeight)));
  const ys = [];
  rows.forEach((row, depth) => { ys[depth] = depth === 0 ? config.padding + rowHeights[0] : ys[depth - 1] + rowHeights[depth - 1] + config.levelGap + rowHeights[depth]; });
  const rootContour = subtrees.get(numbered.rootId);
  const rootX = config.padding - Math.min(...rootContour.left);
  const xs = new Map([[numbered.rootId, rootX]]);
  const nodes = [];
  for (const row of rows) {
    for (const id of row.nodeIds) {
      const shape = measured.get(id), x = xs.get(id), y = ys[shape.depth];
      nodes.push({ ...shape, symbolId: source.get(id).symbolId, x, y, bounds: { x: x - shape.halfWidth, y: y - shape.halfHeight, width: shape.halfWidth * 2, height: shape.halfHeight * 2 }, label: { x, y }, operation: shape.operationNumber === null ? null : { x: x - shape.radius - 8, y, anchor: 'end' }, value: shape.valueLines.length ? { x: x + shape.radius + 16, y, anchor: 'start' } : null });
      source.get(id).children.forEach(child => xs.set(child, x + offsets.get(child)));
    }
  }
  const placed = new Map(nodes.map(node => [node.id, node]));
  const edges = nodes.flatMap(parent => source.get(parent.id).children.map(id => {
    const child = placed.get(id);
    const corridorY = parent.y + rowHeights[parent.depth] + config.levelGap / 2;
    return { from: parent.id, to: id, points: [{ x: parent.x, y: parent.y + parent.radius }, { x: parent.x, y: corridorY }, { x: child.x, y: corridorY }, { x: child.x, y: child.y - child.radius }] };
  }));
  const usedSymbols = new Set(numbered.nodes.map(node => node.symbolId).filter(Boolean));
  const symbols = numbered.symbols.filter(symbol => usedSymbols.has(symbol.id)).map(symbol => ({ id: symbol.id, name: symbol.name }));
  return { rootId: numbered.rootId, symbols, nodes, edges, bounds: { x: 0, y: 0, width: Math.max(...rootContour.right) + rootX + config.padding, height: ys.at(-1) + rowHeights.at(-1) + config.padding }, config };
}
