import { prepareExpressionSource } from '../tree/source-context.js';

/** Proves absence of writes using resolved symbol identities, not variable names.
 * Constancy of each initializer is checked separately by the optimizer. */
export function collectConstantAssignments(source, tree, quadruples) {
  const context = prepareExpressionSource(source);
  const nodes = new Map(tree.nodes.map(node => [node.id, node]));
  return quadruples.records.filter(record => {
    if (record.operator !== '=' || record.left.kind !== 'symbol') return false;
    const node = nodes.get(record.nodeId);
    const symbol = context.symbolsById.get(record.left.symbolId);
    if (!node || node.symbolId !== record.left.symbolId || !symbol) return false;
    if (!['local', 'field', 'parameter'].includes(symbol.kind)) return false;
    return !(context.writes.get(symbol.key)?.length);
  }).map(record => `q${record.number}`);
}
