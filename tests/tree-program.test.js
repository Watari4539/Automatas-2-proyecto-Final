import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { requestAnalysis } from '../src/compiler/index.js';

const friday = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
function simple(methods, main) {
  return `public class A { ${methods} public static void main(String[] args) { ${main} } }`;
}
function success(source, options) {
  const result = buildProgramTree(source, options);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.tree.symbols, requestAnalysis(source).symbols);
  return result.tree;
}
function shape(tree) {
  const nodes = new Map(tree.nodes.map(node => [node.id, node]));
  function read(id) {
    const node = nodes.get(id);
    const label = node.symbolId ?? node.text;
    return [node.kind, label, node.castType, ...node.children.map(read)];
  }
  return read(tree.rootId);
}
const n = (kind, label, ...children) => [kind, label, null, ...children];
const literal = value => n('literal', value);

test('Viernes: reproduce raíz, SOUT, objeto, método, retorno y ambas derivaciones', () => {
  const tree = success(friday);
  const variable = ['assignment', 'ID6', 'int',
    n('operator', '*', n('operator', '.', n('external', 'Math'), n('call', 'random()')), literal('2'))];
  assert.deepEqual(shape(tree), n('entry', 'ID2', n('output', 'SOUT', n('operator', '.',
    n('constructor', 'ID2'), n('call', 'ID3', n('return', 'RTN', n('operator', '+',
      n('operator', '*', n('reference', 'ID4', n('assignment', 'ID8', n('operator', '/', literal("'@'"), literal('10')))), variable),
      n('operator', '/', variable, literal('3')),
    ))),
  ))));
  assert.equal(tree.nodes.filter(node => node.symbolId === 'ID6').length, 2);
  assert.equal(tree.nodes.filter(node => node.text === 'random()').length, 2);
  assert.equal(tree.nodes.filter(node => node.symbolId === 'ID5').length, 0);
  assert.ok(tree.nodes.every(node => node.operationNumber === null && node.evaluation === null));
  assert.deepEqual(structuredClone(tree), tree);
});

test('los parámetros llevan al argumento en el contexto del llamador', () => {
  const tree = success(friday);
  const main = tree.contexts.find(context => context.isMain);
  const call = tree.contexts.find(context => !context.isMain);
  assert.equal(call.parentId, main.id);
  assert.equal(call.methodSymbolId, 'ID3');
  assert.deepEqual(call.arguments.map(argument => [argument.parameterSymbolId, friday.slice(argument.source.start, argument.source.end)]), [
    ['ID4', 'num'], ['ID5', '"URIANGATO"'],
  ]);
  for (const node of tree.nodes) {
    assert.ok(tree.contexts.some(context => context.id === node.contextId));
    assert.ok(node.source.start >= 0 && node.source.end <= friday.length);
  }
  assert.ok(tree.nodes.filter(node => node.symbolId === 'ID8').every(node => node.contextId === main.id));
  assert.ok(tree.nodes.filter(node => node.symbolId === 'ID4').every(node => node.contextId === call.id));
});

test('dos llamadas al mismo método conservan argumentos y contextos distintos', () => {
  const source = simple('public int f(int x){ return x*2; }', 'System.out.print(new A().f(3)+new A().f(7));');
  const tree = success(source);
  const calls = tree.contexts.filter(context => !context.isMain);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].id, calls[1].id);
  assert.deepEqual(calls.map(context => source.slice(context.arguments[0].source.start, context.arguments[0].source.end)), ['3', '7']);
  for (const [i, call] of calls.entries()) {
    const reference = tree.nodes.find(node => node.kind === 'reference' && node.contextId === call.id);
    const value = tree.nodes.find(node => node.id === reference.children[0]);
    assert.equal(value.text, i ? '7' : '3');
  }
});

test('sigue llamadas entre métodos y parámetros que se pasan a otros parámetros', () => {
  const tree = success(simple(`
    int base=10;
    public int f(int x){ return g(x+1); }
    public int g(int x){ int local=base*2; return x+local; }
  `, 'int num=3; System.out.print(new A().f(num));'));
  assert.equal(tree.contexts.length, 3);
  const names = id => tree.symbols.find(symbol => symbol.id === id)?.name;
  assert.deepEqual(tree.contexts.filter(c => !c.isMain).map(c => names(c.methodSymbolId)), ['f', 'g']);
  assert.equal(tree.contexts[2].parentId, tree.contexts[1].id);
  assert.ok(tree.nodes.some(node => node.kind === 'assignment' && names(node.symbolId) === 'base'));
  assert.ok(tree.nodes.some(node => node.kind === 'assignment' && names(node.symbolId) === 'num'));
  const parameters = tree.nodes.filter(node => node.kind === 'reference');
  assert.equal(parameters.length, 2);
  assert.notEqual(parameters[0].symbolId, parameters[1].symbolId);
});

test('f(f(1)) es anidamiento de argumentos, no recursión del método', () => {
  const tree = success(simple('public int f(int x){ return x+1; }', 'System.out.print(new A().f(new A().f(1)));'));
  assert.equal(tree.contexts.length, 3);
  assert.ok(tree.contexts.slice(1).every(context => context.parentId === tree.contexts[0].id));
  assert.equal(tree.nodes.filter(node => node.kind === 'return').length, 2);
});

test('copiar una definición copia nodos y conserva la identidad de su contexto de llamada', () => {
  const tree = success(simple('public int f(int x){ return x+1; }', 'int num=new A().f(3); System.out.print(num+num);'));
  assert.equal(tree.contexts.length, 2);
  const calls = tree.nodes.filter(node => node.kind === 'call');
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].id, calls[1].id);
  assert.equal(calls[0].contextId, calls[1].contextId);
  assert.notEqual(calls[0].children[0], calls[1].children[0]);
});

test('un objeto local puede ser receptor y el constructor conserva el ID de clase', () => {
  const tree = success(simple('public int f(){ return 2; }', 'A objeto=new A(); System.out.println(objeto.f());'));
  assert.equal(tree.nodes.filter(node => node.kind === 'constructor').length, 1);
  assert.equal(tree.nodes.find(node => node.kind === 'constructor').symbolId, 'ID1');
  assert.ok(tree.nodes.some(node => node.kind === 'assignment' && tree.symbols.find(s => s.id === node.symbolId)?.name === 'objeto'));
});

test('el único detonador también puede ser una llamada directa', () => {
  const tree = success(simple('public int f(){ return 2; }', 'new A().f();'));
  assert.equal(tree.nodes.filter(node => node.kind === 'output').length, 0);
  assert.equal(tree.nodes.filter(node => node.kind === 'return').length, 1);
});

test('SOUT acepta expresión aritmética, concatenación y salida vacía', () => {
  for (const output of ['System.out.print(2*(3+4));', 'System.out.println("Hola "+3);', 'System.out.println();']) {
    const tree = success(simple('', output));
    assert.equal(tree.nodes.filter(node => node.kind === 'output').length, 1);
  }
});

test('los operadores en argumentos no se convierten en operadores exteriores a la llamada', () => {
  const tree = success(simple('public int f(int x, int y){ return x*y; }', 'System.out.print(new A().f(1+2,3+4)/5);'));
  const map = new Map(tree.nodes.map(node => [node.id, node]));
  const output = tree.nodes.find(node => node.kind === 'output');
  assert.equal(map.get(output.children[0]).text, '/');
  assert.equal(tree.nodes.filter(node => node.text === '+').length, 2);
});

test('cast anotado junto al ID: no crea un nodo de conversión ni pierde la multiplicación', () => {
  const tree = success(friday);
  assert.equal(tree.nodes.filter(node => node.castType === 'int').length, 2);
  assert.equal(tree.nodes.filter(node => node.kind === 'conversion').length, 0);
  const result = buildProgramTree(simple('', 'int x=(int)2.5+3; System.out.print(x);'));
  assert.equal(result.status, 'unsupported');
  assert.equal(result.diagnostics[0].code, 'TREE_CAST_SCOPE');
});

test('las llamadas recursivas directas e indirectas se interrumpen', () => {
  for (const methods of [
    'public int f(int x){return f(x);}',
    'public int f(int x){return g(x);} public int g(int x){return f(x);}',
  ]) {
    const result = buildProgramTree(simple(methods, 'System.out.print(new A().f(1));'));
    assert.equal(result.status, 'unsupported');
    assert.equal(result.tree, null);
    assert.equal(result.diagnostics[0].code, 'TREE_RECURSION');
  }
});

test('no supone estructuras para múltiples detonadores ni control de flujo', () => {
  for (const [source, code] of [
    [simple('', 'System.out.print(1); System.out.print(2);'), 'TREE_MAIN_TRIGGER'],
    [simple('', 'int x=1;'), 'TREE_MAIN_TRIGGER'],
    [simple('', 'if(true){ System.out.print(1); }'), 'TREE_CONTROL_FLOW_PENDING'],
    [simple('public int f(){ return 1; return 2; }', 'System.out.print(new A().f());'), 'TREE_METHOD_TRIGGER'],
    [simple('public int f(){ System.out.print(1); return 2; }', 'System.out.print(new A().f());'), 'TREE_METHOD_TRIGGER'],
  ]) {
    const result = buildProgramTree(source);
    assert.equal(result.status, 'unsupported', JSON.stringify(result));
    assert.equal(result.diagnostics[0].code, code);
    assert.equal(result.tree, null);
  }
});

test('no ignora escrituras a parámetros, variables o campos', () => {
  for (const source of [
    simple('public int f(int x){ x=3; return x; }', 'System.out.print(new A().f(1));'),
    simple('', 'int x=1; x=2; System.out.print(x);'),
    simple('int x=1; public int f(){ x=2; return x; }', 'System.out.print(new A().f());'),
  ]) assert.notEqual(buildProgramTree(source).status, 'success');
});

test('no ejecuta ni desarrolla cuerpos de constructores ni argumentos externos no acordados', () => {
  for (const [source, code] of [
    [simple('public A(){ } public int f(){ return 1; }', 'System.out.print(new A().f());'), 'TREE_CONSTRUCTOR_BODY'],
    [simple('', 'System.out.print(Math.abs(2));'), 'TREE_EXTERNAL_ARGUMENTS'],
  ]) {
    const result = buildProgramTree(source);
    assert.equal(result.status, 'unsupported');
    assert.equal(result.diagnostics[0].code, code);
  }
});

test('nombres y firmas no resueltos no se sustituyen por un método supuesto', () => {
  for (const source of [
    simple('', 'System.out.print(noExiste());'),
    simple('public int f(int x){return x;}', 'System.out.print(new A().f());'),
  ]) {
    const result = buildProgramTree(source);
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0].code, 'TREE_UNRESOLVED_CALL');
  }
});

test('las sobrecargas resueltas por la tabla conservan sus IDs de método', () => {
  const tree = success(simple('public int f(int x){return x;} public int f(char x){return x+1;}', "System.out.print(new A().f(2)+new A().f('A'));"));
  const methods = tree.contexts.filter(context => !context.isMain).map(context => context.methodSymbolId);
  assert.equal(methods.length, 2);
  assert.notEqual(methods[0], methods[1]);
  assert.ok(methods.every(id => tree.symbols.find(symbol => symbol.id === id)?.name === 'f'));
});

test('exige una clase y un main reconocible antes de construir', () => {
  for (const [source, code] of [
    ['public class A {}', 'TREE_MAIN_REQUIRED'],
    ['public class A {public void main(){}}', 'TREE_MAIN_REQUIRED'],
    [simple('', 'System.out.print(1);') + ' class B {}', 'TREE_SINGLE_CLASS'],
  ]) {
    const result = buildProgramTree(source);
    assert.equal(result.tree, null);
    assert.equal(result.diagnostics[0].code, code);
  }
});

test('respeta los límites globales de nodos y profundidad durante llamadas', () => {
  assert.equal(buildProgramTree(friday, { maxNodes: 5 }).status, 'limit');
  assert.equal(buildProgramTree(friday, { maxDepth: 3 }).status, 'limit');
  assert.throws(() => buildProgramTree(friday, { maxNodes: 0 }), RangeError);
});
