/** Structural equality preserving BigInt, NaN and signed zero, browser compatible. */
export function isDeepStrictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && isDeepStrictEqual(a[key], b[key]));
}
