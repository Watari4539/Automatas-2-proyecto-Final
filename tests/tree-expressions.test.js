import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis } from '../src/compiler/index.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';

function generate(source, name, options) {
  const symbol = requestAnalysis(source).symbols.find(item => item.name === name);
  assert.ok(symbol, `Falta el símbolo ${name}`);
  return buildExpressionTree(source, symbol.id, options);
}

function shape(tree) {
  const nodes = new Map(tree.nodes.map(node => [node.id, node]));
  function read(id) {
    const node = nodes.get(id);
    const label = node.symbolId ? `${node.symbolId}${node.kind === 'assignment' ? '=' : ''}` : node.text;
    return node.children.length ? [label, ...node.children.map(read)] : label;
  }
  return read(tree.rootId);
}

test('referencia A: reproduce exactamente el subárbol acordado sin evaluar ni numerar', () => {
  const source = `public class Expresiones {
    public static void main(String[] args) {
      char a = 'A';
      int b = 35/10+a-(23+2)/5-10;
    }
  }`;
  const result = generate(source, 'b');
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(shape(result.tree), [
    'ID4=', ['-', ['-', ['+', ['/', '35', '10'], ['ID3=', "'A'"]], ['/', ['+', '23', '2'], '5']], '10'],
  ]);
  assert.equal(result.tree.nodes.length, 15);
  assert.ok(result.tree.nodes.every(node => node.operationNumber === null && node.evaluation === null));
  for (const node of result.tree.nodes) {
    assert.equal(source.slice(node.source.start, node.source.end), node.symbolId
      ? result.tree.symbols.find(symbol => symbol.id === node.symbolId).name : node.text);
  }
  assert.deepEqual(structuredClone(result.tree), result.tree);
});

test('busca de derecha a izquierda y respeta las prioridades confirmadas', () => {
  for (const [expression, expected] of [
    ['10-3-2', ['-', ['-', '10', '3'], '2']],
    ['8/4*2', ['*', ['/', '8', '4'], '2']],
    ['2+3*4', ['+', '2', ['*', '3', '4']]],
    ['(2+3)*4', ['*', ['+', '2', '3'], '4']],
    ['((2+3))', ['+', '2', '3']],
    ['2+(3*4)', ['+', '2', ['*', '3', '4']]],
  ]) {
    const result = generate(`int b=${expression};`, 'b');
    assert.equal(result.status, 'success', expression);
    assert.deepEqual(shape(result.tree), ['ID1=', expected], expression);
  }
});

test('cada par de paréntesis suma dos niveles y permite desarrollar los empates anteriores', () => {
  for (const [expression, expected] of [
    ['2*(3+4)', ['*', '2', ['+', '3', '4']]],
    ['((2*(3+4)))', ['*', '2', ['+', '3', '4']]],
    ['8/(3+1)', ['/', '8', ['+', '3', '1']]],
    ['2*(3+4*(5+6))', ['*', '2', ['+', '3', ['*', '4', ['+', '5', '6']]]]],
    ['(2+3)*(4-1)', ['*', ['+', '2', '3'], ['-', '4', '1']]],
  ]) {
    const result = generate(`int b=${expression};`, 'b');
    assert.equal(result.status, 'success', expression);
    assert.deepEqual(shape(result.tree), ['ID1=', expected], expression);
  }
});

test('copia toda la derivación cada vez que aparece una variable', () => {
  const result = generate('int a=2+3; int b=a*a;', 'b');
  assert.equal(result.status, 'success');
  assert.deepEqual(shape(result.tree), ['ID2=', ['*', ['ID1=', ['+', '2', '3']], ['ID1=', ['+', '2', '3']]]]);
  assert.equal(result.tree.nodes.length, 10);
  assert.equal(new Set(result.tree.nodes.map(n => n.id)).size, 10);
  assert.equal(result.tree.nodes.filter(n => n.symbolId === 'ID1').length, 2);
});

test('resuelve cada definición en su ámbito, sin confundir nombres iguales', () => {
  const source = `public class A {
    public void uno(){ int a=2; int b=a+1; }
    public void dos(){ int a=7; int b=a+3; }
  }`;
  const symbols = requestAnalysis(source).symbols;
  const bs = symbols.filter(s => s.name === 'b');
  const as = symbols.filter(s => s.name === 'a');
  for (let i = 0; i < 2; i++) {
    const result = buildExpressionTree(source, bs[i].id);
    assert.equal(result.status, 'success');
    assert.deepEqual(shape(result.tree), [bs[i].id + '=', ['+', [as[i].id + '=', i ? '7' : '2'], i ? '3' : '1']]);
  }
});

test('mantiene IDs desplazados por package y desarrolla campos visibles', () => {
  const source = 'package p; public class A { int a=2; public void f(){ int b=a+1; } }';
  const analysis = requestAnalysis(source);
  const result = generate(source, 'b');
  assert.equal(result.status, 'success');
  assert.deepEqual(result.tree.symbols, analysis.symbols);
  assert.deepEqual(shape(result.tree), ['ID5=', ['+', ['ID3=', '2'], '1']]);
});

test('no separa operadores dentro de literales y conserva los lexemas originales', () => {
  for (const value of ['"a+(b)/c;"', "'+'", '3.5f', '3.5', 'true']) {
    const result = generate(`String x=${value};`, 'x');
    // La construcción estructural no certifica los tipos: eso es otra fase.
    assert.equal(result.status, 'success');
    assert.deepEqual(shape(result.tree), ['ID1=', value]);
  }
  const result = generate('int b=2 /* + 99 */ + // * 3\n 4;', 'b');
  assert.deepEqual(shape(result.tree), ['ID1=', ['+', '2', '4']]);
});

test('acceso simple de Java conserva nombres externos y el punto binario', () => {
  const result = generate('double b=Math.PI*2;', 'b');
  assert.equal(result.status, 'success');
  assert.deepEqual(shape(result.tree), ['ID1=', ['*', ['.', 'Math', 'PI'], '2']]);
  assert.ok(result.tree.nodes.filter(n => n.kind === 'external').every(n => n.symbolId === null));
});

test('bloquea ciclos, referencias sin resolver y expresiones incompletas con ubicación', () => {
  for (const [source, name, code] of [
    ['int b=b;', 'b', 'TREE_CIRCULAR_DEFINITION'],
    ['public class A { int a=b; int b=a; }', 'a', 'TREE_CIRCULAR_DEFINITION'],
    ['int b=noExiste+2;', 'b', 'TREE_UNRESOLVED_REFERENCE'],
    ['int b=;', 'b', 'TREE_EXPECTED_EXPRESSION'],
    ['int b=2+;', 'b', 'TREE_MISSING_OPERAND'],
    ['int b=2 3;', 'b', 'TREE_UNRECOGNIZED_EXPRESSION'],
  ]) {
    const result = generate(source, name);
    assert.equal(result.status, 'invalid', source);
    assert.equal(result.tree, null);
    assert.equal(result.diagnostics[0].code, code, source);
    assert.ok(result.diagnostics[0].source.line >= 1);
  }
});

test('los casos no acordados se reportan sin árbol parcial ni supuestos', () => {
  for (const [source, name, code] of [
    ['int b=-2;', 'b', 'TREE_UNARY_PENDING'],
    ['int b=2%1;', 'b', 'TREE_OPERATOR_PENDING'],
    ['int b=(int)2.5;', 'b', 'TREE_EXPRESSION_FORM_PENDING'],
    ['double b=Math.random();', 'b', 'TREE_CALL_PENDING'],
    ['int a; int b=a;', 'b', 'TREE_NO_INITIALIZER'],
    ['int a=1; a=2; int b=a;', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['int a=1; a++; int b=a;', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['int a=1; ++a; int b=a;', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['int a=1; a+=2; int b=a;', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['int a=1; ++(a); int b=a;', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['int a=1; (a)=2; int b=a;', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['public class A { int a=1; public void f(){ ++this.a; int b=a; } }', 'b', 'TREE_REASSIGNMENT_PENDING'],
    ['public class A { public int f(int a){ int b=a; return b; } }', 'b', 'TREE_NEEDS_CALL_CONTEXT'],
    ['int a=1,b=2;', 'a', 'TREE_DECLARATION_FORM'],
    ['int a=1,b=2;', 'b', 'TREE_DECLARATION_FORM'],
  ]) {
    const result = generate(source, name);
    assert.equal(result.status, 'unsupported', source);
    assert.equal(result.tree, null);
    assert.equal(result.diagnostics[0].code, code, source);
  }
});

test('una escritura posterior local no cambia el árbol de una declaración anterior', () => {
  const result = generate('int a=1; int b=a+2; a=3;', 'b');
  assert.equal(result.status, 'success');
  assert.deepEqual(shape(result.tree), ['ID2=', ['+', ['ID1=', '1'], '2']]);
});

test('limita expansión repetida, cadenas profundas y fuente excesiva', () => {
  assert.equal(generate('int a=1; int b=a+a;', 'b', { maxNodes: 3 }).status, 'limit');
  let source = 'int v0=1;';
  for (let i = 1; i <= 15; i++) source += `int v${i}=v${i - 1}+v${i - 1};`;
  const result = generate(source, 'v15');
  assert.equal(result.status, 'limit');
  assert.equal(result.diagnostics[0].code, 'TREE_NODE_LIMIT');
  assert.equal(result.tree, null);
  assert.equal(generate('int a=1; int b=a;', 'b', { maxDepth: 1 }).diagnostics[0].code, 'TREE_EXPANSION_DEPTH');
  assert.equal(buildExpressionTree(' '.repeat(100_001), 'ID1').diagnostics[0].code, 'TREE_SOURCE_LIMIT');
  assert.equal(buildExpressionTree(`int x=${'('.repeat(129)}1${')'.repeat(129)};`, 'ID1').status, 'limit');
});

test('entradas inválidas y léxico defectuoso producen incidencias de construcción', () => {
  assert.equal(buildExpressionTree('int b=1;', 'ID99').diagnostics[0].code, 'TREE_UNKNOWN_SYMBOL');
  assert.equal(buildExpressionTree('int b="hola;', 'ID1').diagnostics[0].code, 'TREE_LEXICAL_ERROR');
  assert.equal(buildExpressionTree('int b=(1+2;', 'ID1').status, 'invalid');
  assert.throws(() => buildExpressionTree(null, 'ID1'), TypeError);
  assert.throws(() => buildExpressionTree('int b=1;', 'ID1', { maxNodes: 0 }), RangeError);
});
