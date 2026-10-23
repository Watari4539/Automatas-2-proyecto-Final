import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestAnalysis } from '../src/compiler/index.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { readLiteral, convertValue, typedValue, annotation } from '../src/compiler/tree/values.js';

function expression(source, name = 'b') {
  const id = requestAnalysis(source).symbols.find(symbol => symbol.name === name)?.id;
  const built = buildExpressionTree(source, id);
  assert.equal(built.status, 'success', JSON.stringify(built.diagnostics));
  return evaluateTree(built.tree);
}
function main(code, methods = '') {
  const built = buildProgramTree(`public class A { ${methods} public static void main(String[] args){ ${code} } }`);
  assert.equal(built.status, 'success', JSON.stringify(built.diagnostics));
  return evaluateTree(built.tree);
}
const operationValues = result => result.tree.numbering.operationOrder.map(id => result.tree.nodes.find(node => node.id === id).evaluation);
function finalValue(result) {
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  return operationValues(result).at(-1);
}

test('referencia A: los ocho resultados y tokens coinciden con el dibujo', () => {
  const result = expression("char a='A'; int b=35/10+a-(23+2)/5-10;");
  assert.equal(result.status, 'success');
  assert.deepEqual(operationValues(result).map(value => [value.display, value.token]), [
    ['3', 'VTE'], ["'A'", 'VTC'], ['25', 'VTE'], ['68', 'VTE'],
    ['5', 'VTE'], ['63', 'VTE'], ['53', 'VTE'], ['53', 'VTE'],
  ]);
  assert.deepEqual(result.tree.evaluation.evaluatedOperationOrder, result.tree.numbering.operationOrder);
});

test('Viernes: random siempre 1.0, cast 2, división entera 0 y return double 12.0', () => {
  const source = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
  const built = buildProgramTree(source);
  const result = evaluateTree(built.tree);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(operationValues(result).map(value => [value.display, value.token]), [
    ['6', 'VTE'], ['1.0', 'VTD'], ['1.0', 'VTD'], ['6', 'VTE'],
    ['2.0', 'VTD'], ['2.0', 'VTD'], ['2', 'VTE'], ['2', 'VTE'],
    ['12', 'VTE'], ['0', 'VTE'], ['12', 'VTE'], ['12.0', 'VTD'], ['12.0', 'VTD'],
  ]);
  assert.deepEqual(evaluateTree(built.tree), result);
  assert.ok(result.tree.nodes.filter(node => node.text === 'random()').every(node => node.evaluation.value === 1));
  assert.deepEqual(result.tree.contexts, built.tree.contexts);
  assert.deepEqual(result.tree.symbols, built.tree.symbols);
});

test('la división depende de los operandos antes de convertir la asignación', () => {
  for (const [source, value, type] of [
    ['int b=35/10;', 3n, 'int'],
    ['double b=35/10;', 3, 'double'],
    ['double b=35.0/10;', 3.5, 'double'],
    ['float b=35f/10;', 3.5, 'float'],
    ['int b=(0-35)/10;', -3n, 'int'],
    ['int b=35/(0-10);', -3n, 'int'],
  ]) {
    const result = finalValue(expression(source));
    assert.equal(result.value, value, source);
    assert.equal(result.type, type, source);
  }
});

test('promoción aritmética de char, byte, long, float y double', () => {
  for (const [source, type, value] of [
    ["char a='A'; int b=a+1;", 'int', 66n],
    ["int b='A'+'B';", 'int', 131n],
    ['byte a=1; int b=a+a;', 'int', 2n],
    ['long b=9007199254740993L+2L;', 'long', 9007199254740995n],
    ['float b=1L+0.5f;', 'float', 1.5],
    ['double b=1f+0.5;', 'double', 1.5],
  ]) {
    const actual = finalValue(expression(source));
    assert.equal(actual.type, type);
    assert.equal(actual.value, value);
  }
});

test('float se redondea a binary32 en cada operación', () => {
  const actual = finalValue(expression('float a=16777216f; float b=(a+1f)-a;'));
  assert.equal(actual.value, 0);
  assert.equal(actual.display, '0.0f');
  assert.equal(finalValue(expression('float b=0.1f+0.2f;')).display, '0.3f');
  // Este long está por encima del punto medio float pero se redondea al medio como double.
  const integer = (1n << 62n) + (1n << 38n) + 1n;
  const value = convertValue(typedValue('long', integer), 'float');
  assert.equal(value.value, 2 ** 62 + 2 ** 39);
});

test('concatenación respeta tipos, orden y comillas de presentación', () => {
  for (const [source, value, display] of [
    ['String b=1+2+"x";', '3x', '"3x"'],
    ['String b="x"+1+2;', 'x12', '"x12"'],
    ['String b="v="+3.0;', 'v=3.0', '"v=3.0"'],
    ["String b=\"v=\"+'A';", 'v=A', '"v=A"'],
    ['String b="v="+true;', 'v=true', '"v=true"'],
    ['String b="a\\n"+"b";', 'a\nb', '"a\\nb"'],
  ]) {
    const actual = finalValue(expression(source));
    assert.equal(actual.value, value);
    assert.equal(actual.display, display);
    assert.equal(actual.token, 'VTS');
  }
});

test('literales, escapes y formatos conservan los tipos del catálogo', () => {
  for (const [text, type, value, token] of [
    ["'\\n'", 'char', '\n', 'VTC'],
    ["'\\101'", 'char', 'A', 'VTC'],
    ['"a\\\"b"', 'String', 'a"b', 'VTS'],
    ['0xffffffff', 'int', -1n, 'VTE'],
    ['0b101', 'int', 5n, 'VTE'],
    ['077', 'int', 63n, 'VTE'],
    ['2L', 'long', 2n, 'VTE'],
    ['false', 'boolean', false, 'VTB'],
  ]) {
    const actual = annotation(readLiteral(text));
    assert.deepEqual([actual.type, actual.value, actual.token], [type, value, token]);
  }
  assert.equal(annotation(readLiteral('3f')).display, '3.0f');
  assert.equal(annotation(readLiteral('3d')).display, '3.0');
});

test('casts anotados truncan hacia cero y convierten al tipo declarado', () => {
  for (const [code, display, type] of [
    ['int b=(int)(7.9);', '7', 'int'],
    ['int b=(int)(0.0-7.9);', '-7', 'int'],
    ['double b=(int)(7.9);', '7.0', 'double'],
    ['byte b=(byte)(130);', '-126', 'byte'],
    ["char b=(char)(65);", "'A'", 'char'],
    ['float b=(float)(1.25);', '1.25f', 'float'],
  ]) {
    const value = finalValue(main(`${code} System.out.print(b);`));
    assert.deepEqual([value.display, value.type], [display, type]);
  }
});

test('solo constantes admisibles se estrechan implícitamente; parámetros no', () => {
  assert.equal(finalValue(expression('char b=65;')).value, 'A');
  assert.equal(finalValue(expression('final int a=65; char b=a;')).value, 'A');
  assert.equal(expression('int a=65; char b=a;').status, 'partial');
  const result = main('System.out.print(new A().f(65));', 'public int f(char x){return x+1;}');
  assert.equal(result.status, 'partial');
  assert.equal(result.diagnostics[0].code, 'EVAL_INCOMPATIBLE_TYPE');
});

test('parámetros y retornos se convierten antes de usarse en operaciones posteriores', () => {
  const result = main('System.out.print(new A().f(35));', 'public double f(double x){return x/10;}');
  assert.equal(finalValue(result).display, '3.5');
  const reference = result.tree.nodes.find(node => node.kind === 'reference');
  assert.equal(reference.evaluation.type, 'double');
  assert.equal(reference.evaluation.display, '35.0');
  const different = main('System.out.print(new A().f(2)+new A().f(7));', 'public int f(int x){return x*2;}');
  assert.equal(finalValue(different).value, 18n);
});

test('errores de evaluación no inventan resultados ni generan cascadas de diagnósticos', () => {
  for (const [source, code] of [
    ['int b=2/0+1;', 'EVAL_DIVISION_ZERO'],
    ['int b=true+1;', 'EVAL_OPERANDS'],
    ['double b="x";', 'EVAL_INCOMPATIBLE_TYPE'],
    ['int b=2147483647+1;', 'EVAL_OVERFLOW'],
    ['byte b=200;', 'EVAL_INCOMPATIBLE_TYPE'],
  ]) {
    const result = expression(source);
    assert.equal(result.status, 'partial');
    assert.equal(result.diagnostics.length, 1, source);
    assert.equal(result.diagnostics[0].code, code);
    assert.equal(result.tree.nodes.find(node => node.id === result.tree.rootId).evaluation, null);
    assert.equal(result.tree.evaluation.complete, false);
  }
});

test('IEEE: división flotante entre cero, NaN y casts saturados', () => {
  assert.equal(finalValue(expression('double b=1.0/0.0;')).value, Infinity);
  assert.ok(Number.isNaN(finalValue(expression('double b=0.0/0.0;')).value));
  assert.equal(convertValue(typedValue('double', Infinity), 'int', 'cast').value, 2147483647n);
  assert.equal(convertValue(typedValue('double', -Infinity), 'int', 'cast').value, -2147483648n);
  assert.equal(convertValue(typedValue('double', NaN), 'int', 'cast').value, 0n);
});

test('accesos conocidos se evalúan sin ejecutar código externo', () => {
  assert.equal(finalValue(expression('double b=Math.PI*2;')).value, Math.PI * 2);
  assert.equal(finalValue(main('System.out.print("Hola".length());')).value, 4n);
  const unknown = main('System.out.print(Math.desconocido());');
  assert.equal(unknown.status, 'partial');
  assert.equal(unknown.diagnostics[0].code, 'EVAL_ACCESS_PENDING');
});

test('la evaluación es reproducible, reinicia anotaciones y no modifica la entrada', () => {
  const built = buildExpressionTree('int b=2+3;', 'ID1').tree;
  const original = structuredClone(built);
  const first = evaluateTree(built);
  assert.deepEqual(built, original);
  assert.deepEqual(evaluateTree(first.tree), first);
  assert.deepEqual(structuredClone(first), first);
  first.tree.nodes.forEach(node => { node.evaluation = { value: 999 }; });
  assert.deepEqual(evaluateTree(first.tree), evaluateTree(built));
});

test('literales fuera de rango y cadenas expansivas tienen límites explícitos', () => {
  for (const text of ['2147483648', '09', '1e500', '1e-500', '1e-50f']) {
    assert.throws(() => readLiteral(text), error => error.code.startsWith('EVAL_LITERAL'), text);
  }
  assert.equal(readLiteral('0e-500').value, 0);
  const result = expression(`String a="${'x'.repeat(60_000)}"; String b=a+a;`);
  assert.equal(result.status, 'partial');
  assert.equal(result.diagnostics[0].code, 'EVAL_VALUE_LIMIT');
});
