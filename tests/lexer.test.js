import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/compiler/lexical/lexer.js';

test('separa por unidades, no por espacios', () => {
  assert.deepEqual(tokenize('int b = a+5*6;').tokens.map(t => t.lexeme), ['int', 'b', '=', 'a', '+', '5', '*', '6', ';']);
});
test('cabecera del ejemplo conserva los tokens del curso', () => {
  assert.deepEqual(tokenize('public static void mostrarProcesos(int limite) {').tokens.map(t => t.token), ['MA', 'ST', 'TM', 'ID', 'PA', 'TD', 'ID', 'PC', 'LLA']);
});
test('catálogo: casos particulares transcritos del material', () => {
  const source = 'abstract String default null do ~ ^ ! | & : ? == ++ --';
  assert.deepEqual(tokenize(source).tokens.map(t => t.token), ['MA', 'STR', 'DF', '_NU', 'PRDO', 'OPB', 'XOR', 'OPN', 'OPL', 'OPL', 'DOP', 'OPT', 'OPR', 'INC', 'DEC']);
});
test('ignora comentarios pero conserva sus saltos para las posiciones', () => {
  const result = tokenize('// comentario\r\n/* bloque\nsegunda línea */\r\nint x;');
  assert.deepEqual(result.tokens.map(t => t.lexeme), ['int', 'x', ';']);
  assert.equal(result.tokens[0].line, 4);
  assert.equal(result.tokens[0].column, 1);
});
test('comentarios separan identificadores en vez de concatenarlos', () => {
  assert.deepEqual(tokenize('uno/* separación */dos').tokens.map(t => t.lexeme), ['uno', 'dos']);
});
test('cadenas conservan comillas, espacios, escapes y aparentes comentarios', () => {
  const source = '"a // b /* c */ \\"texto\\""'.replaceAll('\\\\', '\\');
  const result = tokenize(source);
  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0].lexeme, source);
  assert.equal(result.tokens[0].token, 'VTS');
});
test('enteros, decimales, flotantes, caracteres y booleanos', () => {
  const source = "10 2.5 .5 1e3 1.5f 2F 100L 0xFF 0b10 'a' '\\n' true false";
  assert.deepEqual(tokenize(source).tokens.map(t => t.token), ['VTE', 'VTD', 'VTD', 'VTD', 'VTF', 'VTF', 'VTE', 'VTE', 'VTE', 'VTC', 'VTC', 'VTB', 'VTB']);
});
test('signo negativo permanece como operador independiente', () => {
  assert.deepEqual(tokenize('-5').tokens.map(t => [t.lexeme, t.token]), [['-', 'OPA'], ['5', 'VTE']]);
});
test('operadores sin regla no se fragmentan para fingir tokens válidos', () => {
  const result = tokenize('a<=b && b!=c; x+=2;');
  assert.deepEqual(result.tokens.filter(t => t.token === null).map(t => t.lexeme), ['<=', '&&', '!=', '+=']);
  assert.equal(result.diagnostics.length, 4);
});
test('main es contextual, no una palabra reservada global', () => {
  assert.equal(tokenize('main').tokens[0].token, 'ID');
});
test('literal o comentario sin cierre produce aviso', () => {
  assert.equal(tokenize('"hola').diagnostics[0].code, 'UNCLOSED_LITERAL');
  assert.equal(tokenize('/* hola').diagnostics[0].code, 'UNCLOSED_COMMENT');
  assert.equal(tokenize("'ab'").diagnostics[0].code, 'INVALID_CHARACTER');
});
test('identificadores Unicode, signo dólar y guion bajo', () => {
  assert.deepEqual(tokenize('índice $valor _base').tokens.map(t => t.token), ['ID', 'ID', 'ID']);
});
