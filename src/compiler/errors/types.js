export const NUMERIC = new Set(['byte', 'short', 'char', 'int', 'long', 'float', 'double']);
export const INTEGRAL = new Set(['byte', 'short', 'char', 'int', 'long']);
export const RANGES = Object.freeze({
  byte: [-128n, 127n], short: [-32768n, 32767n], char: [0n, 65535n],
  int: [-2147483648n, 2147483647n], long: [-9223372036854775808n, 9223372036854775807n],
});
const WIDEN = {
  byte: ['short', 'int', 'long', 'float', 'double'], short: ['int', 'long', 'float', 'double'],
  char: ['int', 'long', 'float', 'double'], int: ['long', 'float', 'double'],
  long: ['float', 'double'], float: ['double'], double: [],
};
export const typeName = type => type ? type.name + '[]'.repeat(type.dimensions ?? 0) : 'desconocido';
export const valueType = (name, extra = {}) => ({ name, dimensions: 0, ...extra });

/** Retorna coste de conversión, o Infinity si no es compatible. */
export function conversion(target, source, assignment = false) {
  if (!target || !source || source.unknown) return null;
  if (source.name === 'null') return target.dimensions || (!NUMERIC.has(target.name) && !['boolean', 'void'].includes(target.name)) ? 0 : Infinity;
  if (typeName(target) === typeName(source)) return 0;
  if (target.name === 'Object' && !NUMERIC.has(source.name) && source.name !== 'boolean' && source.name !== 'void') return 10;
  if (target.dimensions || source.dimensions) return Infinity;
  const widening = Object.hasOwn(WIDEN, source.name) ? WIDEN[source.name].indexOf(target.name) : -1;
  if (widening >= 0) return widening + 1;
  if (assignment && source.name === 'int' && ['byte', 'short', 'char'].includes(target.name) && typeof source.constant === 'bigint') {
    const [minimum, maximum] = RANGES[target.name];
    if (source.constant >= minimum && source.constant <= maximum) return 1;
  }
  return Infinity;
}

export function promoted(left, right = left) {
  return ['double', 'float', 'long'].find(name => left.name === name || right.name === name) ?? 'int';
}

export function literalType(token) {
  const text = token.lexeme.replaceAll('_', '');
  if (token.token === 'VTS') return valueType('String');
  if (token.token === 'VTC') return valueType('char');
  if (token.token === 'VTB') return valueType('boolean');
  if (token.token === 'VTE') {
    const name = /[lL]$/.test(text) ? 'long' : 'int';
    let digits = text.replace(/[lL]$/, '');
    if (/^0[0-7]+$/.test(digits)) digits = `0o${digits.slice(1)}`;
    try {
      let constant = BigInt(digits);
      if (/^0[xXbBoO]/.test(digits)) {
        const bits = name === 'long' ? 64 : 32;
        if (constant < (1n << BigInt(bits))) constant = BigInt.asIntN(bits, constant);
      }
      return valueType(name, { constant });
    }
    catch { return { unknown: true }; }
  }
  return valueType(token.token === 'VTF' ? 'float' : 'double', { constant: Number(text.replace(/[fFdD]$/, '')) });
}

export function outOfRange(value) {
  if (typeof value?.constant === 'bigint' && RANGES[value.name]) {
    const [minimum, maximum] = RANGES[value.name];
    return value.constant < minimum || value.constant > maximum;
  }
  if (typeof value?.constant === 'number') {
    return !Number.isFinite(value.constant) || (value.name === 'float' && Math.abs(value.constant) > 3.4028234663852886e38);
  }
  return false;
}
