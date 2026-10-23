import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis } from '../src/compiler/index.js';

test('la columna Error contiene el código del ejemplo, con categorías y orden intactos', () => {
  const source = `public class PruebaErrores {
    public void procesar(char letra) {
        double total = "texto";
        int 2contador = 0;
        int incompleto = ;
        desconocida = 10;
        boolean activo = 25;
        int resultado = true * 3;
        byte pequeno = 200;
        procesar(10);
    }
}`;
  const errors = requestAnalysis(source).errors;
  assert.deepEqual(errors.map(row => [row.category, row.error]), [
    ['lexical', '2contador'],
    ['syntax', 'int incompleto = ;'],
    ['semantic', 'double total = "texto";'],
    ['semantic', 'desconocida'],
    ['semantic', 'boolean activo = 25;'],
    ['semantic', 'int resultado = true * 3;'],
    ['semantic', 'byte pequeno = 200;'],
    ['semantic', 'procesar(10)'],
  ]);
  for (const row of errors) {
    assert.equal(row.error, source.slice(row.sourceStart, row.sourceEnd));
    assert.ok(row.description);
    assert.ok(row.justification.split(/\s+/).length < 50);
  }
});

test('conserva espacios y saltos originales sin confundir ; dentro de una cadena', () => {
  const source = 'public class A { public void f(){ int bien=1; double mal =\r\n  "texto; <b>"; } }';
  const error = requestAnalysis(source).errors.find(row => row.code === 'INCOMPATIBLE_ASSIGNMENT');
  assert.equal(error.error, 'double mal =\r\n  "texto; <b>";');
});

test('extrae comentarios sin cierre y literales numéricos inválidos', () => {
  assert.equal(requestAnalysis('/* sin\ncierre').errors[0].error, '/* sin\ncierre');
  const errors = requestAnalysis('double x = 123.45.67;').errors;
  assert.equal(errors.find(row => row.category === 'lexical').error, '123.45.67');
});

test('las omisiones al final muestran código real, no un título de error', () => {
  const source = 'public class A { public void f(){ int x=1;';
  for (const error of requestAnalysis(source).errors) {
    assert.ok(error.error.length > 0);
    assert.equal(error.error, source.slice(error.sourceStart, error.sourceEnd));
  }
});
