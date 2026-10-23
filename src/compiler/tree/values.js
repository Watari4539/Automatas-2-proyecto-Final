import { tokenize } from '../lexical/lexer.js';
import { NUMERIC, INTEGRAL, RANGES, literalType, promoted, conversion } from '../errors/types.js';

export class EvaluationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new EvaluationError(code, message); };
const TOKENS = { byte: 'VTE', short: 'VTE', int: 'VTE', long: 'VTE', char: 'VTC', float: 'VTF', double: 'VTD', String: 'VTS', boolean: 'VTB' };
export const MAX_STRING_VALUE_LENGTH = 100_000;

export function typedValue(type, value, constant = false) {
  return { type, value, constant };
}

function decodeQuoted(text) {
  const inner = text.slice(1, -1);
  return inner.replace(/\\(u+[0-9a-fA-F]{4}|[0-3][0-7]{0,2}|[4-7][0-7]?|[btnfrs"'\\])/g, (_, escape) => {
    if (escape.startsWith('u')) return String.fromCharCode(parseInt(escape.slice(-4), 16));
    if (/^[0-7]/.test(escape)) return String.fromCharCode(parseInt(escape, 8));
    return { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', s: ' ', '"': '"', "'": "'", '\\': '\\' }[escape];
  });
}

export function readLiteral(text) {
  const lexical = tokenize(text);
  const token = lexical.tokens[0];
  if (lexical.diagnostics.length || lexical.tokens.length !== 1) fail('EVAL_LITERAL', 'No se reconoce este literal.');
  if (token.token === 'VTS') return typedValue('String', decodeQuoted(text), true);
  if (token.token === 'VTC') {
    const value = decodeQuoted(text);
    if (value.length !== 1) fail('EVAL_CHARACTER', 'Un char debe contener una unidad UTF-16.');
    return typedValue('char', value, true);
  }
  if (token.token === 'VTB') return typedValue('boolean', text === 'true', true);
  if (!['VTE', 'VTD', 'VTF'].includes(token.token)) fail('EVAL_LITERAL', 'El elemento no es un literal de valor.');
  if (token.token === 'VTE' && /^0[0-9]+[lL]?$/.test(text.replaceAll('_', '')) && /[89]/.test(text)) {
    fail('EVAL_LITERAL', 'Un literal octal no puede contener 8 ni 9.');
  }
  const parsed = literalType(token);
  if (parsed.unknown) fail('EVAL_LITERAL', 'El literal numérico no se pudo interpretar.');
  if (INTEGRAL.has(parsed.name)) {
    const [min, max] = RANGES[parsed.name];
    if (parsed.constant < min || parsed.constant > max) fail('EVAL_LITERAL_RANGE', 'El literal está fuera del rango de su tipo.');
  } else if (!Number.isFinite(parsed.constant) || (parsed.name === 'float' && !Number.isFinite(Math.fround(parsed.constant)))) {
    fail('EVAL_LITERAL_RANGE', 'El literal flotante está fuera del rango admitido.');
  }
  if (!INTEGRAL.has(parsed.name) && (parsed.name === 'float' ? Math.fround(parsed.constant) : parsed.constant) === 0 && /[1-9]/.test(text.split(/[eE]/)[0])) {
    fail('EVAL_LITERAL_RANGE', 'El literal no nulo es demasiado pequeño para su tipo flotante.');
  }
  return typedValue(parsed.name, parsed.name === 'float' ? Math.fround(parsed.constant) : parsed.constant, true);
}

const numeric = value => value.type === 'char' ? BigInt(value.value.charCodeAt(0)) : value.value;
function integralCast(value, type) {
  if (type === 'char') return String.fromCharCode(Number(BigInt.asUintN(16, value)));
  return BigInt.asIntN({ byte: 8, short: 16, int: 32, long: 64 }[type], value);
}

// Evita doble redondeo long → double → float cerca de un punto medio binary32.
function integerToFloat(value) {
  const sign = value < 0n ? -1 : 1;
  const absolute = value < 0n ? -value : value;
  const shift = absolute.toString(2).length - 24;
  if (shift <= 0) return Number(value);
  let significand = absolute >> BigInt(shift);
  const remainder = absolute - (significand << BigInt(shift));
  const half = 1n << BigInt(shift - 1);
  if (remainder > half || (remainder === half && (significand & 1n))) significand++;
  return sign * Number(significand) * 2 ** shift;
}

export function convertValue(value, target, mode = 'assignment') {
  if (!TOKENS[target]) fail('EVAL_TYPE_UNSUPPORTED', `No se ha definido la evaluación del tipo ${target ?? 'desconocido'}.`);
  if (target === value.type) return { ...value };
  if (!NUMERIC.has(value.type) || !NUMERIC.has(target)) fail('EVAL_INCOMPATIBLE_TYPE', `No se puede convertir ${value.type} a ${target}.`);
  if (mode !== 'cast') {
    let permitted = conversion({ name: target }, { name: value.type }) !== Infinity;
    if (mode === 'assignment' && value.constant && ['byte', 'short', 'char', 'int'].includes(value.type) && ['byte', 'short', 'char'].includes(target)) {
      const number = numeric(value);
      permitted = number >= RANGES[target][0] && number <= RANGES[target][1];
    }
    if (!permitted) fail('EVAL_INCOMPATIBLE_TYPE', `La conversión de ${value.type} a ${target} requiere un cast válido.`);
  }
  let number = numeric(value);
  if (INTEGRAL.has(target)) {
    if (typeof number === 'number') {
      const intermediate = target === 'long' ? 'long' : 'int';
      const [min, max] = RANGES[intermediate];
      number = Number.isNaN(number) ? 0n : number <= Number(min) ? min : number >= Number(max) ? max : BigInt(Math.trunc(number));
    }
    return typedValue(target, integralCast(number, target), value.constant);
  }
  if (target === 'float' && typeof number === 'bigint') return typedValue(target, integerToFloat(number), value.constant);
  number = Number(number);
  return typedValue(target, target === 'float' ? Math.fround(number) : number, value.constant);
}

/** Formato de float corto que vuelve a representar el mismo binary32. */
function floatText(value) {
  if (!Number.isFinite(value) || Object.is(value, -0)) return Object.is(value, -0) ? '-0' : String(value);
  for (let precision = 1; precision <= 9; precision++) {
    const candidate = Number(value.toPrecision(precision));
    if (Object.is(Math.fround(candidate), value)) return String(candidate);
  }
  return String(value);
}
function decimalText(value, float = false) {
  let text = float ? floatText(value) : Object.is(value, -0) ? '-0' : String(value);
  if (!Number.isFinite(value)) return text;
  const [base, exponent] = text.split(/e/i);
  text = base.includes('.') ? base : `${base}.0`;
  return exponent === undefined ? text : `${text}e${exponent}`;
}
function quoted(value, quote) {
  const escaped = value.replace(/[\\\u0000-\u001f\u007f"']/g, char => {
    if (char === quote || char === '\\') return `\\${char}`;
    return { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' }[char]
      ?? (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}` : char);
  });
  return quote + escaped + quote;
}
export function formatValue(value) {
  if (value.type === 'String') return quoted(value.value, '"');
  if (value.type === 'char') return quoted(value.value, "'");
  if (value.type === 'float') return decimalText(value.value, true) + 'f';
  if (value.type === 'double') return decimalText(value.value);
  return String(value.value);
}
export function annotation(value) {
  return { ...value, token: TOKENS[value.type], display: formatValue(value) };
}
function stringValue(value) {
  if (value.type === 'float') return decimalText(value.value, true);
  if (value.type === 'double') return decimalText(value.value);
  return String(value.value);
}

export function binaryValue(operator, left, right) {
  const constant = left.constant && right.constant;
  if (operator === '+' && (left.type === 'String' || right.type === 'String')) {
    const a = stringValue(left);
    const b = stringValue(right);
    if (a.length + b.length > MAX_STRING_VALUE_LENGTH) fail('EVAL_VALUE_LIMIT', 'La cadena calculada supera 100 000 caracteres.');
    return typedValue('String', a + b, constant);
  }
  if (!NUMERIC.has(left.type) || !NUMERIC.has(right.type)) fail('EVAL_OPERANDS', 'La operación aritmética requiere dos valores numéricos.');
  const type = promoted({ name: left.type }, { name: right.type });
  const a = numeric(convertValue(left, type, 'invocation'));
  const b = numeric(convertValue(right, type, 'invocation'));
  if (operator === '/' && INTEGRAL.has(type) && b === 0n) fail('EVAL_DIVISION_ZERO', 'La división entera entre cero no tiene resultado.');
  let value;
  if (operator === '+') value = a + b;
  else if (operator === '-') value = a - b;
  else if (operator === '*') value = a * b;
  else if (operator === '/') value = a / b;
  else fail('EVAL_OPERATOR', 'Este operador aún no tiene regla de evaluación.');
  if (INTEGRAL.has(type)) {
    // Política académica existente: señalar overflow, sin ocultarlo mediante wraparound.
    const [min, max] = RANGES[type];
    if (value < min || value > max) fail('EVAL_OVERFLOW', 'La operación desborda el rango del tipo entero.');
  }
  if (type === 'float') value = Math.fround(value);
  return typedValue(type, value, constant);
}
