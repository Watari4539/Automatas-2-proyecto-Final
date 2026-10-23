import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeProgram } from '../src/compiler/analysis.js';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { buildQuadruples, validateQuadruples } from '../src/compiler/quadruples/index.js';
import { formatRecord } from '../src/ui/quadruples/format.js';
const wrap = expression => `public class A { public static void main(String[] args){ System.out.println(${expression}); } }`;

test('Dos: objeto local, conversiones y métodos String generan árbol y cuádruplos completos', () => {
  const source = readFileSync(new URL('../fixtures/ArbolDos.java', import.meta.url), 'utf8');
  const result = analyzeProgram(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.treeAnalysis.status, 'success');
  const q = result.quadrupleAnalysis;
  assert.equal(q.status, 'success');
  assert.deepEqual(q.validation, { valid: true, complete: true, diagnostics: [] });
  assert.equal(q.records.at(-1).result.display, '",CQM"');
  assert.ok(q.records.some(r => r.operator === 'CAST' && r.result.display === "'Q'"));
  assert.ok(q.records.some(r => r.operator === '=' && r.result.type === 'object'));
  assert.ok(q.records.map(formatRecord).some(text => text.includes('substring(3, 4)')));
  assert.deepEqual(structuredClone(result), result);
});

test('argumentos calculados conservan registros y ocurrencias', () => {
  const tree = evaluateTree(buildProgramTree(wrap('"ABCDE".substring(1+1,4)+"XYZ".charAt(1)')).tree).tree;
  const q = buildQuadruples(tree);
  assert.equal(q.status, 'success');
  assert.equal(q.records.at(-1).result.display, '"CDY"');
  const call = q.records.find(r => r.right.kind === 'externalCall' && r.right.name === 'substring');
  assert.equal(call.right.args[0].kind, 'register');
  const damaged = structuredClone(q);
  damaged.records[call.number - 1].right.args[0].number = 999;
  assert.equal(validateQuadruples(tree, damaged).valid, false);
});

test('casts intermedios convierten el valor sin cambiar la concatenación anterior', () => {
  for (const [expression, expected] of [['"x"+(char)(80+1)', '"xQ"'], ['(int)(7.9)+2', '9'], ['"ABCDE".substring(2)', '"CDE"']]) {
    const result = analyzeProgram(wrap(expression));
    assert.equal(result.treeAnalysis.status, 'success', expression);
    assert.equal(result.quadrupleAnalysis.status, 'success', expression);
    assert.equal(result.quadrupleAnalysis.records.at(-1).result.display, expected);
  }
});

test('String valida intervalos, cantidad y tipos sin inventar resultados', () => {
  for (const [expression, code] of [['"A".charAt(1)', 'EVAL_STRING_BOUNDS'], ['"ABC".substring(2,1)', 'EVAL_STRING_BOUNDS'], ['"ABC".substring(0,4)', 'EVAL_STRING_BOUNDS'], ['"ABC".charAt(0,1)', 'EVAL_ARGUMENT_COUNT'], ['"ABC".charAt(0.5)', 'EVAL_ARGUMENT_TYPE']]) {
    const r = analyzeProgram(wrap(expression));
    assert.equal(r.treeAnalysis.status, 'partial', expression);
    assert.ok(r.treeAnalysis.diagnostics.some(d => d.code === code), expression);
    assert.equal(r.quadrupleAnalysis.status, 'partial', expression);
  }
});

test('Lunes: receptor agrupado, campos y variables homónimas conservan sus identidades', () => {
  const source = `public class Lunes {
    int a = 'F'; private char b = 99/10; int c = b+1;
    public char qwerty(int numero) {
      String a = "1";
      return (char)(b + (a+c).length()+numero);
    }
    public static void main(String[] arreglo) {
      Lunes obj = new Lunes();
      System.out.println(obj.qwerty(obj.a));
    }
  }`;
  const r = analyzeProgram(source);
  assert.deepEqual(r.errors, []);
  assert.equal(r.treeAnalysis.status, 'success');
  assert.equal(r.quadrupleAnalysis.status, 'success');
  assert.equal(r.quadrupleAnalysis.records.at(-1).result.display, "'R'");
  assert.ok(r.quadrupleAnalysis.validation.complete);
  const names = r.symbols.filter(s => s.name === 'a');
  assert.equal(names.length, 2);
  assert.notEqual(names[0].id, names[1].id);
  for (const symbol of names) assert.ok(r.treeAnalysis.layout.symbols.some(s => s.id === symbol.id));
});

test('agrupaciones y cadenas de llamadas mantienen el tipo de resultado', () => {
  for (const [expression, expected] of [
    ['("AB"+"CD").substring(1,3).length()', '2'],
    ['(("a"+2)).length()', '2'],
    ['("AB"+"CD").substring(1).charAt(0)', "'B'"],
    ['new A().texto().substring(1).length()', '3'],
    ['(new A().texto()).length()', '4'],
  ]) {
    const source = `public class A {public String texto(){return "HOLA";} public static void main(String[] args){System.out.println(${expression});}}`;
    const r = analyzeProgram(source);
    assert.deepEqual(r.errors, [], expression);
    assert.equal(r.treeAnalysis.status, 'success', expression);
    assert.equal(r.quadrupleAnalysis.status, 'success', expression);
    assert.equal(r.quadrupleAnalysis.records.at(-1).result.display, expected, expression);
  }
});

test('inferencia de expresiones distingue sobrecargas sin elegir por nombre', () => {
  const source = `public class A {
    public int f(String s){return 7;}
    public int f(int n){return 9;}
    public static void main(String[] args){System.out.println(new A().f("a"+2));}
  }`;
  const r = analyzeProgram(source);
  assert.equal(r.treeAnalysis.status, 'success');
  assert.equal(r.quadrupleAnalysis.records.at(-1).result.display, '7');
});

test('un receptor numérico o desconocido no se inventa como String', () => {
  for (const expression of ['(2+3).length()', '(desconocida+1).length()']) {
    const r = analyzeProgram(wrap(expression));
    assert.notEqual(r.treeAnalysis.status, 'success');
    assert.ok(r.errors.some(e => e.category === 'semantic'));
    assert.equal(r.quadrupleAnalysis.records.length, 0);
  }
});
