import { readLiteral } from '../tree/values.js';

/** Explicit evidence of copies of one source occurrence, not textual equality. */
export function reuseOrigins(groups, recordIds) {
  if (!Array.isArray(groups)) throw new TypeError('La evidencia de reutilización debe ser una lista.');
  const origins = new Map();
  for (const [index, group] of groups.entries()) {
    if (!Array.isArray(group) || group.length < 2) throw new TypeError('Una ocurrencia repetida necesita al menos dos registros.');
    for (const id of group) {
      if (!recordIds.has(id) || origins.has(id)) throw new TypeError('Evidencia de reutilización inválida.');
      origins.set(id, index);
    }
  }
  return origins;
}

const immutable = o => o.kind === 'literal' || o.kind === 'reference';
function operandKey(o) {
  if (o.kind === 'literal') {
    const value = o.type ? o : readLiteral(o.text);
    return ['literal', value.type, value.value, !!value.symbolic];
  }
  if (o.kind === 'externalCall') return ['call', o.name, o.args.map(operandKey)];
  if (o.kind === 'reference') return ['reference', o.recordId];
  if (o.kind === 'symbol' || o.kind === 'constructor') return [o.kind, o.symbolId];
  return [o.kind, o.text ?? null];
}

export function reuseKey(row, origins, records) {
  const id = row.identity?.id ?? row.id;
  const pure = ['+', '-', '*', '/'].includes(row.operator) && immutable(row.left) && immutable(row.right);
  const receiverType = row.left.kind === 'literal' ? (row.left.type ?? readLiteral(row.left.text).type)
    : row.left.kind === 'reference' ? records.get(row.left.recordId)?.result.type : null;
  const length = row.operator === '.' && receiverType === 'String' && immutable(row.left) &&
    row.right.kind === 'external' && row.right.text === 'length()';
  const origin = origins.get(id);
  if (!pure && !length && !(origin !== undefined && ['=', '.'].includes(row.operator))) return null;
  return JSON.stringify([row.contextId, row.operator, operandKey(row.left), operandKey(row.right), row.result.type,
    pure || length ? null : origin], (_, value) => typeof value === 'bigint' ? `${value}n`
      : typeof value === 'number' && (Object.is(value, -0) || !Number.isFinite(value)) ? {number:String(Object.is(value, -0) ? '-0' : value)} : value);
}
