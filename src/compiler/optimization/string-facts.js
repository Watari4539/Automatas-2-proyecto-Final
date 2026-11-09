import { readLiteral } from '../tree/values.js';

function literal(o) {
  if (!o || o.kind !== 'literal' || o.symbolic) return null;
  try { return o.type ? o : readLiteral(o.text); } catch { return null; }
}
const index = o => {
  const value = literal(o);
  if (!value || !['byte', 'short', 'int', 'char'].includes(value.type)) return null;
  const n = value.type === 'char' ? value.value.charCodeAt(0) : Number(value.value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 2147483647 ? n : null;
};

/** Proves length from operands, never from a displayed/evaluated result.
 * A substring access remains in the output, preserving its possible exception.
 * References use stable qN identities, including during validator replay.
 */
export function foldedStringLength(row, records) {
  if (row.operator !== '.' || row.right.kind !== 'external' || row.right.text !== 'length()') return null;
  const visited = new Set();
  function length(operand) {
    const value = literal(operand);
    if (value?.type === 'String') return value.value.length;
    if (operand.kind !== 'reference' || visited.has(operand.recordId)) return null;
    visited.add(operand.recordId);
    const producer = records.get(operand.recordId);
    if (!producer || producer.result.type !== 'String') return null;
    if (producer.operator === '=') return producer.right.kind === 'reference' ? length(producer.right) : null;
    const call = producer.right;
    if (producer.operator !== '.' || call.kind !== 'externalCall' || call.name !== 'substring' || ![1, 2].includes(call.args.length)) return null;
    const start = index(call.args[0]);
    const receiverLength = length(producer.left);
    const end = call.args.length === 2 ? index(call.args[1]) : receiverLength;
    if (start === null || end === null || end < start || receiverLength !== null && end > receiverLength) return null;
    // A typed String receiver is required even if its contents are unknown.
    const receiverType = literal(producer.left)?.type ?? records.get(producer.left.recordId)?.result.type;
    return receiverType === 'String' ? end - start : null;
  }
  const n = length(row.left);
  return n === null ? null : { type: 'int', value: BigInt(n), constant: true };
}
