import { isDeepStrictEqual as equal } from './validation-equality.js';
import { binaryValue, readLiteral, convertValue, annotation } from '../tree/values.js';
import { PROTECTED_OPERATORS } from './model.js';
import { buildOptimizationRows } from './rows.js';

const clone = value => structuredClone(value);
function map(value, fn) {
  if (!value || typeof value !== 'object') throw new Error('Operando inválido.');
  return fn(value.kind === 'externalCall' ? { ...value, args: value.args.map(arg => map(arg, fn)) } : clone(value));
}
const literal = o => o.kind !== 'literal' ? null : o.type ? {type: o.type, value: o.value, constant: true} : readLiteral(o.text);
const sameValue = (a, b) => !!a && !!b && a.type === b.type && !!a.symbolic === !!b.symbolic && Object.is(a.value, b.value);
const pure = new Set(['+', '-', '*', '/']);

/** Replays the explanation independently and verifies the final graph and values.
 * Never throws for malformed output; never changes input or result. */
export function validateOptimization(input, output, { constantAssignments = [] } = {}) {
  const diagnostics = [];
  try {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    check(input?.status === 'success' && input.validation?.valid === true, 'Entrada sin validación.');
    check(output?.status === 'success', 'Salida incompleta.');
    check(equal(input.records, output.originals), 'Los originales fueron modificados.');
    const evidence = new Set(constantAssignments);
    let active = input.records.map((r, i) => {
      check(r.number === i + 1, 'Numeración original inválida.');
      const internal = operand => map(operand, o => {
        if (o.kind !== 'register') return o;
        check(Number.isInteger(o.number) && o.number > 0 && o.number < r.number, 'Referencia original inválida.');
        return {kind: 'reference', recordId: `q${o.number}`};
      });
      return {...clone(r), id: `q${r.number}`, left: internal(r.left), right: internal(r.right)};
    });
    const originals = new Map(active.map(r => [r.id, clone(r)]));
    let closure = input.closure ? clone(input.closure) : null;
    if (closure) closure.target = map(closure.target, o => {
      if (o.kind !== 'register') return o;
      check(originals.has(`q${o.number}`), 'Referencia de cierre inválida.');
      return {kind: 'reference', recordId: `q${o.number}`};
    });
    const external = operand => map(operand, o => {
      if (o.kind !== 'reference') return o;
      const index = active.findIndex(r => r.id === o.recordId);
      check(index >= 0, 'Referencia a registro eliminado.');
      return {kind: 'register', number: index + 1};
    });
    const project = r => {
      const {id, ...rest} = clone(r);
      return {...rest, number: active.indexOf(r) + 1, left: external(r.left), right: external(r.right)};
    };
    const value = o => o.kind === 'reference' ? originals.get(o.recordId)?.result : literal(o);
    const has = (o, id) => { let found = false; map(o, x => { found ||= x.kind === 'reference' && x.recordId === id; return x; }); return found; };
    for (const [index, event] of output.events.entries()) {
      check(event.sequence === index + 1, 'Secuencia de eventos inválida.');
      const row = active.find(r => r.id === event.recordId);
      check(row && event.action === 'remove', 'Evento sin registro activo o acción soportada.');
      check(!PROTECTED_OPERATORS.includes(row.operator), 'Se eliminó una operación protegida.');
      check(equal(project(row), event.before) && event.after === null, 'Estado intermedio incorrecto.');
      check(typeof event.derived === 'boolean' && Array.isArray(event.causedBy), 'Derivación inválida.');
      check(event.causedBy.every(n => Number.isInteger(n) && n > 0 && n < event.sequence), 'Causa futura o inexistente.');
      check(!event.derived || event.causedBy.length > 0, 'Optimización derivada sin causa.');
      const a = literal(row.left), b = literal(row.right);
      const replacement = event.replacement;
      const original = originals.get(row.id);
      if (event.technique === 'FO') check(event.derived === !(literal(original.left) && literal(original.right)), 'Etiqueta FOD incorrecta.');
      if (event.technique === 'PC') check(event.derived === !literal(original.right), 'Etiqueta PCD incorrecta.');
      if (!event.derived) check(event.causedBy.length === 0, 'Técnica directa con causas derivadas.');
      if (event.technique === 'FO') {
        check(pure.has(row.operator) && a && b, 'Folding sin operandos constantes.');
        check(sameValue(binaryValue(row.operator, a, b), literal(replacement)), 'Folding cambia el resultado o tipo.');
      } else if (event.technique === 'PC') {
        check(row.operator === '=' && evidence.has(row.id) && b, 'Propagación sin evidencia de constancia.');
        check(sameValue(convertValue(b, row.result.type, 'cast'), literal(replacement)), 'PC pierde conversión de tipo.');
      } else if (event.technique === 'SE') {
        const is = (v, n) => v && ['byte','short','int','long'].includes(v.type) && v.value === BigInt(n);
        const candidates = [];
        if (['*','/'].includes(row.operator) && is(b,1) || ['+','-'].includes(row.operator) && is(b,0)) candidates.push(row.left);
        if (row.operator === '*' && is(a,1) || row.operator === '+' && is(a,0)) candidates.push(row.right);
        check(candidates.some(o => equal(o, replacement)), 'Identidad algebraica inválida.');
      } else if (event.technique === 'RS') {
        const prior = active.find(r => r.id === replacement.recordId);
        check(replacement.kind === 'reference' && prior && active.indexOf(prior) < active.indexOf(row), 'RS no apunta a una expresión anterior.');
        check(pure.has(row.operator) && prior.operator === row.operator && prior.contextId === row.contextId && equal(prior.left, row.left) && equal(prior.right, row.right), 'RS fusiona expresiones distintas.');
      } else throw new Error('Técnica desconocida.');
      check(sameValue(value(replacement), row.result), 'La sustitución cambia el valor o el tipo registrado.');
      if (replacement.kind === 'literal') {
        const formatted = annotation(literal(replacement));
        check(replacement.text === formatted.display && replacement.token === formatted.token || !replacement.type, 'Literal tipado inconsistente.');
      }
      const affected = active.filter(r => r !== row && (has(r.left,row.id) || has(r.right,row.id))).map(r => r.id);
      check(equal(affected, event.affectedRecordIds), 'Lista de afectados incorrecta.');
      check(event.affectsClosure === (!!closure && has(closure.target,row.id)), 'Afectación del cierre incorrecta.');
      const substitute = o => map(o, x => x.kind === 'reference' && x.recordId === row.id ? clone(replacement) : x);
      for (const r of active) if (r !== row) { r.left = substitute(r.left); r.right = substitute(r.right); }
      if (closure) closure.target = substitute(closure.target);
      active = active.filter(r => r !== row);
    }
    check(equal(active.map(project), output.records), 'Los registros finales no corresponden al historial.');
    if (closure) closure.target = external(closure.target);
    check(equal(closure, output.closure), 'Cierre final incorrecto.');
    const numbers = Object.fromEntries([...originals.keys()].map(id => [id, active.some(r => r.id === id) ? active.findIndex(r => r.id === id) + 1 : null]));
    check(equal(numbers, output.numberMap), 'Mapa de números incorrecto.');
    check(equal(buildOptimizationRows(output), output.rows), 'Tabla explicativa inconsistente.');
  } catch (error) { diagnostics.push({code: 'OPT_VALIDATION', message: error.message}); }
  return {valid: diagnostics.length === 0, diagnostics};
}
