/** Catálogo del curso. No añadir equivalencias de Java por aproximación. */
const groups = {
  TD: ['int', 'boolean', 'double', 'float', 'long', 'short', 'byte', 'char'],
  ODA: ['='], FI: [';'], LLA: ['{'], LLC: ['}'], PA: ['('], PC: [')'],
  COA: ['['], COC: [']'], OPA: ['/', '*', '+', '-', '%'], DOP: [':'],
  OPT: ['?'], OPL: ['|', '&'], OPR: ['<', '>', '=='], CA: ['.'],
  MA: ['public', 'protected', 'private', 'abstract'], CL: ['class'], TM: ['void'],
  ISE: ['try'], IMP: ['import'], CE: ['catch'], BR: ['break'], ASR: ['assert'],
  CS: ['case'], PRIF: ['if'], PRE: ['else'], PRSW: ['switch'], PRW: ['while'],
  VTB: ['false', 'true'], TH: ['throws'], SY: ['synchronized'], PCK: ['package'],
  RTN: ['return'], SPR: ['super'], INOF: ['instanceof'], EXTS: ['extends'],
  FIN: ['finally'], NW: ['new'], RF: ['this'], PRF: ['for'], IMPL: ['implements'],
  TDD: ['final'], CO: [','], DEC: ['--'], INC: ['++'], DF: ['default'],
  _NU: ['null'], ST: ['static'], STR: ['String'], PRDO: ['do'], OPB: ['~'],
  XOR: ['^'], OPN: ['!'],
};

export const TOKEN_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(groups).flatMap(([token, lexemes]) => lexemes.map(lexeme => [lexeme, token])),
));
export const PRIMITIVES = new Set(groups.TD);
export const MODIFIERS = new Set([...groups.MA, 'static', 'final', 'synchronized']);

// Se reconocen completos para avisar que falta una regla, sin separarlos en
// operadores distintos (p. ej. <= nunca se convierte en < y =).
export const OPERATORS = [
  '>>>=', '>>>', '<<=', '>>=', '...', '==', '!=', '<=', '>=', '&&', '||',
  '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '->', '::', '=', ';', '{', '}', '(', ')', '[', ']', '/', '*', '+', '-',
  '%', ':', '?', '|', '&', '<', '>', '.', ',', '~', '^', '!', '@',
];

export const UNCATALOGUED_KEYWORDS = new Set([
  'interface', 'enum', 'record', 'var', 'continue', 'throw', 'native',
  'volatile', 'transient', 'strictfp', 'const', 'goto', 'yield', 'sealed', 'permits',
]);
