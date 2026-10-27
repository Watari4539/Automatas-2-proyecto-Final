import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProgram } from '../src/compiler/analysis.js';
import { analyzeQuadrupleInput } from '../src/compiler/optimization/input.js';
const run = expression => analyzeProgram(`public class Demo { public static void main(String[] args){System.out.println(${expression});}}`);
test('random y operaciones mantienen expresiones, tipos y todas las etapas', () => {
  for (const [expression, expected] of [
    ['Math.random()', 'x'], ['5*Math.random()', '5x'],
    ['5+Math.random()', '5+x'], ['10/Math.random()', '10/x'],
    ['67-Math.random()', '67-x'], ['10/(Math.random()+2)', '10/(x+2)'],
    ['(Math.random()+2)*3', '(x+2)*3'],
    ['"Resultado: "+Math.random()', '"Resultado: "+x'],

  ]) {
    const r=run(expression);
    assert.deepEqual(r.errors, [], expression);
    for (const name of ['treeAnalysis','quadrupleAnalysis','optimizationAnalysis','threeAddressAnalysis'])
      assert.equal(r[name].status,'success',expression+' '+name);
    assert.equal(r.quadrupleAnalysis.records.at(-1).result.display,expected);
    assert.equal(r.quadrupleAnalysis.records.at(-1).result.symbolic,true);
    assert.deepEqual(structuredClone(r),r);
  }
});
test('FO calcula constantes pero no elimina random ni propaga x como constante', () => {
  const r=analyzeProgram('public class Demo {public static void main(String[] args){double a=Math.random();System.out.println((2+3)*a);}}');
  assert.equal(r.optimizationAnalysis.status,'success');
  assert.ok(r.optimizationAnalysis.events.some(e=>e.technique==='FO'));
  assert.ok(!r.optimizationAnalysis.events.some(e=>e.technique==='PC'));
  assert.equal(r.optimizationAnalysis.records.at(-1).result.display,'5x');
  assert.ok(r.optimizationAnalysis.records.some(r=>r.operator==='.'));
});
test('casts conservan incertidumbre y el tipo destino', () => {
  const r=run('(char)(Math.random()+65)');
  const value=r.quadrupleAnalysis.records.at(-1).result;
  assert.equal(value.display,'(char)(x+65)');
  assert.equal(value.token,'VTC');
  assert.equal(value.constant,false);
});
test('entrada de cuádruplos acepta resultados simbólicos sin ejecutar texto', () => {
 const r=analyzeQuadrupleInput('1.- (Math, ., random(), x)\n2.- (5, *, [1], 5x)');
 assert.equal(r.optimizationAnalysis?.status,'success',r.inputError);
 assert.ok(analyzeQuadrupleInput('1.- (Math, ., random(), x)\n2.- (5, *, [1], 6x)').inputError);
});
