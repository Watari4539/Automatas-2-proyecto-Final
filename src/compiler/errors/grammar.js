/** Referencia del curso. El reconocedor añade las extensiones documentadas en tabla-de-errores.md. */
export const GRAMMAR = Object.freeze({
  JAVA: 'DPACKAGE? IMPORTS CLASE',
  DPACKAGE: 'PCK ID FI', IMPORTS: 'IMPORTS IMPORT | ε', IMPORT: 'IMP ID CA ID FI | ε',
  CLASE: 'MA CL ID LLA CONTENT LLC', CONTENT: 'VARIOS CONTENT | ε',
  VARIOS: 'MAIN | METODO | DECS_GLOB', DECS_GLOB: 'D_GLOB DECS_GLOB | ε',
  D_GLOB: 'MAO TY ID FI | MAO TY ID ODA EXP FI | OBJ', MAO: 'MA | ε',
  MAIN: 'MA ST TM PMAIN PA STR COA COC ID PC LLA CUERPO LLC',
  METODO: 'MA TYPE ID PA PARAMS PC LLA CUERPO REE LLC',
  TYPE: 'TY | TM', TY: 'ID | TD | STR', PARAMS: 'PARAM PARAMS | ε', PARAM: 'TY ID | CO TY ID',
  CUERPO: 'INST CUERPO | ε', INST: 'DEC | STAT_B | ASIG | ACC | OBJ',
  DEC: 'TY ID FI | TY ID ODA EXP FI', ASIG: 'ID ODA EXP FI',
  OBJ: 'ID ID ODA NW ID PA ARGS PC FI', REE: 'RTN FI | RTN EXP FI | ε',
  EXP: 'EXPC | VAL | ACC', EXPC: 'EXP OP EXP | PA EXP OP EXP PC | EXPU',
  EXPU: 'OPU VAL', OPU: 'DEC | INC | OPB | OPN', OP: 'OPA | OPR | OPL',
  VAL: 'VTE | VTD | VTS | VTB | ID | VTF | VTC',
  ACC: 'CLA OT', CLA: 'ID | VTS', OT: 'CA ID OT | CA ID PA ARGS PC OT | ε',
  ARGS: 'ARG ARGS | ε', ARG: 'VAL | CO VAL',
  SOUT: 'System.out.print() — aclaración del usuario; argumentos según ARGS',
});

export const IGNORED_STATEMENTS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'try', 'catch', 'finally', 'synchronized']);
export const VALUES = new Set(['VTE', 'VTD', 'VTF', 'VTS', 'VTB', 'VTC', 'ID']);
export const BINARY_PRECEDENCE = Object.freeze({ '|': 1, '&': 2, '==': 3, '<': 4, '>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 });
