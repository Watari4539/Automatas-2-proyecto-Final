import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightSource, selectedBracket } from '../src/ui/source-highlighting.js';

test('preserva texto, comentarios, Unicode y fragmentos sin cerrar', () => {
  for (const source of ['public class A {\n\tString ñ="<b>😀</b>"; // }\n}', '/* { sin cerrar', 'String s="hola', '  \n', '']) {
    assert.equal(highlightSource(source).parts.map(p => p.text).join(''), source);
  }
});
test('parejas anidadas ignoran cadenas y comentarios; selección en ambas direcciones', () => {
  const source = '{ foo("}", a[1]); /* ] */ }';
  const { pairs } = highlightSource(source);
  assert.equal(pairs.get(0), source.length - 1);
  assert.deepEqual(selectedBracket(pairs, 0, 1), [0, source.length - 1]);
  assert.deepEqual(selectedBracket(pairs, source.length, source.length), [source.length - 1, 0]);
  assert.equal(selectedBracket(pairs, 0, 5), null);
  assert.equal(highlightSource('{]').pairs.size, 0);
});
test('distingue métodos, tipos, variables, valores y palabras clave', () => {
  const parts = highlightSource('public class A { int x=3; String s="hola"; f(x); }').parts;
  for (const [text, style] of [['public','keyword'], ['A','type'], ['x','identifier'], ['3','number'], ['"hola"','string'], ['f','method']]) {
    assert.ok(parts.some(p => p.text === text && p.style === style));
  }
});
