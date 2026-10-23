/** Academic optimization contract. No rewriting or UI integration in stage 1. */
export const OPTIMIZATION_VERSION = 1;
export const TECHNIQUES = Object.freeze(['SE', 'FO', 'PC', 'RS']);
export const PROTECTED_OPERATORS = Object.freeze(['RTN', '.', 'SOUT']);
export const RESULT_STATUSES = Object.freeze(['empty', 'success', 'unsupported', 'blocked', 'limit', 'invalid']);

/** Stable only within one analysis run; display numbers are assigned separately. */
export function createRecordIdentity(record) {
  if (!Number.isSafeInteger(record?.number) || record.number < 1 ||
      typeof record.nodeId !== 'string' || !record.nodeId) {
    throw new TypeError('Se requiere un cuádruplo con número original y nodo de origen.');
  }
  return {
    id: `q${record.number}`,
    originalNumber: record.number,
    nodeId: record.nodeId,
    contextId: record.contextId ?? null,
    source: structuredClone(record.source ?? null),
  };
}

export function techniqueLabel(technique, derived = false) {
  if (!TECHNIQUES.includes(technique) || typeof derived !== 'boolean') {
    throw new TypeError('Técnica o condición derivada inválida.');
  }
  return technique + (derived ? 'D' : '');
}

/**
 * Working register operand: { kind: 'reference', recordId: 'q3' }.
 * Other operands retain the quadruple kinds (including externalCall.args).
 * Propagated literals also retain { value, type, token, text }.
 *
 * Working record: { identity, left, operator, right, result }.
 * Original records remain independent immutable snapshots, with their numbers.
 *
 * Event: { sequence, recordId, technique, derived, causedBy: event sequence[],
 *   affectedRecordIds: string[], affectsClosure: boolean,
 *   before, after, action: 'remove'|'replace', replacement }.
 * before/after are snapshots with the visible numbering at that instant.
 * replacement is a typed literal or stable reference, never a display number.
 *
 * Table row: { recordId, original, events, final }.
 * One row per ORIGINAL record, including protected and unchanged records.
 * final: null for removed rows, otherwise the final numbered quadruple.
 * Events preserve intermediate states; final alone cannot explain derivation.
 *
 * Result records use the existing numbered quadruple operand format, allowing
 * existing formatters to render them. numberMap maps stable IDs to final numbers
 * or null if removed. closure uses the final numbering, without its own number.
 */
export function createEmptyOptimizationResult() {
  return {
    version: OPTIMIZATION_VERSION,
    status: 'empty',
    originals: [],
    events: [],
    rows: [],
    records: [],
    numberMap: {},
    closure: null,
    diagnostics: [],
  };
}
