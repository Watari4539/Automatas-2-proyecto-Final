import { validateOptimization } from './validation.js';
export { validateOptimization } from './validation.js';
import { buildOptimizationRows } from './rows.js';
import { readLiteral, binaryValue, annotation, convertValue } from '../tree/values.js';
import { createEmptyOptimizationResult, createRecordIdentity, PROTECTED_OPERATORS } from './model.js';

const PURE = new Set(['+', '-', '*', '/']);
const copy = value => structuredClone(value);
const key = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? `${v}n` : v);
function mapOperand(operand, transform) {
  const value = operand.kind === 'externalCall'
    ? { ...operand, args: operand.args.map(arg => mapOperand(arg, transform)) } : copy(operand);
  return transform(value);
}
function literal(operand) {
  if (operand.kind !== 'literal') return null;
  return operand.type ? { type: operand.type, value: operand.value, constant: true } : readLiteral(operand.text);
}
function replacement(value) {
  const a = annotation(value);
  return { kind: 'literal', text: a.display, type: a.type, value: a.value, token: a.token };
}

/** Independent API. constantAssignments is origin-analysis evidence, keyed by qN,
 * never inferred from a recorded result. No mutation or DOM access. */
export function optimizeQuadruples(input, { constantAssignments = [], hasSourceErrors = false, maxRecords = 2000 } = {}) {
  const output = createEmptyOptimizationResult();
  if (hasSourceErrors || input?.status !== 'success' || input.validation?.valid !== true) {
    return { ...output, status: 'blocked', diagnostics: [{ code: 'OPT_INPUT', message: 'Se requieren cuádruplos completos y validados, sin errores de origen.' }] };
  }
  if (!Array.isArray(input.records) || !Number.isSafeInteger(maxRecords) || maxRecords < 0 || !Array.isArray(constantAssignments)) return { ...output, status: 'invalid', diagnostics: [{code: 'OPT_INPUT', message: 'Entrada u opciones inválidas.'}] };
  if (input.records.length > Math.min(maxRecords, 2000)) return { ...output, status: 'limit', diagnostics: [{ code: 'OPT_LIMIT', message: 'Demasiados registros para optimizar.' }] };
  output.originals = copy(input.records);
  try {
    const records = input.records.map((record, index) => {
      if (record.number !== index + 1 || record.result?.status !== 'available') throw new Error('Numeración o resultado inválido.');
      return { ...copy(record), identity: createRecordIdentity(record) };
    });
    const ids = new Map(records.map(r => [r.number, r.identity.id]));
    const internal = (operand, current) => mapOperand(operand, o => {
      if (o.kind !== 'register') return o;
      if (!ids.has(o.number) || o.number >= current) throw new Error('Referencia inválida.');
      return { kind: 'reference', recordId: ids.get(o.number) };
    });
    for (const r of records) { r.left = internal(r.left, r.number); r.right = internal(r.right, r.number); }
    let closure = input.closure ? { ...copy(input.closure), target: internal(input.closure.target, records.length + 1) } : null;
    const originals = new Map(records.map(r => [r.identity.id, copy(r)]));
    const evidence = new Set(constantAssignments);
    const causes = new Map(records.map(r => [r.identity.id, new Set()]));
    let active = [...records];
    const references = (operand, id) => {
      let found = false;
      mapOperand(operand, o => { if (o.kind === 'reference' && o.recordId === id) found = true; return o; });
      return found;
    };
    const project = r => {
      const numbers = new Map(active.map((item, i) => [item.identity.id, i + 1]));
      const external = o => mapOperand(o, x => {
        if (x.kind !== 'reference') return x;
        if (!numbers.has(x.recordId)) throw new Error('Referencia eliminada sin sustituir.');
        return { kind: 'register', number: numbers.get(x.recordId) };
      });
      const { identity, ...rest } = copy(r);
      return { ...rest, number: numbers.get(identity.id), left: external(r.left), right: external(r.right) };
    };
    const simplify = r => {
      // Integral identities avoid signed-zero/NaN and numeric promotion surprises.
      if (!['byte', 'short', 'int', 'long'].includes(r.result.type)) return null;
      const a = literal(r.left), b = literal(r.right);
      const typeOf = o => o.kind === 'reference' ? originals.get(o.recordId)?.result.type : literal(o)?.type;
      const is = (v, n) => v && ['int', 'long', 'short', 'byte'].includes(v.type) && v.value === BigInt(n);
      let operand = null;
      if ((r.operator === '*' || r.operator === '/') && is(b, 1)) operand = r.left;
      if (r.operator === '*' && is(a, 1)) operand = r.right;
      if (['+', '-'].includes(r.operator) && is(b, 0)) operand = r.left;
      if (r.operator === '+' && is(a, 0)) operand = r.right;
      return operand && typeOf(operand) === r.result.type ? copy(operand) : null;
    };
    const constantPair = r => PURE.has(r.operator) && literal(r.left) && literal(r.right);
    let changed;
    do {
      changed = false;
      const seen = new Map();
      for (const r of [...active]) {
        const id = r.identity.id, original = originals.get(id);
        if (PROTECTED_OPERATORS.includes(r.operator) || !PURE.has(r.operator) && r.operator !== '=') { seen.clear(); continue; }
        let technique, value, derived = false;
        try {
          value = simplify(r);
          if (value) { technique = 'SE'; derived = !simplify(original); }
          else if (constantPair(r)) {
            value = replacement(binaryValue(r.operator, literal(r.left), literal(r.right)));
            technique = 'FO'; derived = !constantPair(original);
          } else if (r.operator === '=' && evidence.has(id) && literal(r.right)) {
            // Explicit conversions already validated upstream; retain assignment type.
            value = replacement(convertValue(literal(r.right), r.result.type, 'cast'));
            technique = 'PC'; derived = !literal(original.right);
          }
        } catch { /* Unsupported literal/value operation: preserve the record. */ }
        const expressionKey = item => key([item.contextId, item.operator, item.left, item.right, item.result.type]);
        const immutable = o => o.kind === 'literal' || o.kind === 'reference';
        const eligibleRS = PURE.has(r.operator) && immutable(r.left) && immutable(r.right);
        if (!technique && eligibleRS) {
          const first = seen.get(expressionKey(r));
          if (first) {
            technique = 'RS'; value = { kind: 'reference', recordId: first.identity.id };
            derived = expressionKey(original) !== expressionKey(originals.get(first.identity.id));
            if (derived) for (const cause of causes.get(first.identity.id)) causes.get(id).add(cause);
          } else seen.set(expressionKey(r), r);
        }
        if (!technique) { if (r.operator === '=') seen.clear(); continue; }
        const affected = active.filter(x => x !== r && (references(x.left, id) || references(x.right, id)));
        const affectsClosure = !!closure && references(closure.target, id);
        const sequence = output.events.length + 1;
        output.events.push({ sequence, recordId: id, technique, derived,
          causedBy: derived ? [...causes.get(id)] : [], affectedRecordIds: affected.map(x => x.identity.id),
          affectsClosure, before: project(r), after: null, action: 'remove', replacement: copy(value) });
        const substitute = o => mapOperand(o, x => x.kind === 'reference' && x.recordId === id ? copy(value) : x);
        for (const consumer of affected) {
          consumer.left = substitute(consumer.left); consumer.right = substitute(consumer.right);
          causes.get(consumer.identity.id).add(sequence);
          for (const cause of causes.get(id)) causes.get(consumer.identity.id).add(cause);
        }
        if (affectsClosure) closure.target = substitute(closure.target);
        active = active.filter(x => x !== r); changed = true;
      }
    } while (changed);
    output.records = active.map(project);
    output.numberMap = Object.fromEntries(records.map(r => [r.identity.id, active.indexOf(r) < 0 ? null : active.indexOf(r) + 1]));
    if (closure) closure.target = mapOperand(closure.target, o => o.kind === 'reference' ? { kind: 'register', number: output.numberMap[o.recordId] } : o);
    output.closure = closure;
    output.status = 'success';
    output.rows = buildOptimizationRows(output);
    output.validation = validateOptimization(input, output, {constantAssignments});
    if (!output.validation.valid) return { ...createEmptyOptimizationResult(), status: 'invalid', validation: output.validation, diagnostics: output.validation.diagnostics };
    return output;
  } catch (error) {
    return { ...createEmptyOptimizationResult(), status: 'invalid', diagnostics: [{ code: 'OPT_INVALID', message: error.message }] };
  }
}
