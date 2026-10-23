import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { buildQuadruples } from '../src/compiler/quadruples/index.js';
const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const program = source => evaluateTree(buildProgramTree(source).tree).tree;
const viernes = () => program(fixture('ArbolViernes.java'));
const wrap = body => `public class Demo { public static void main(String[] args) { ${body} } }`;
// Test-only rendering of the contract; the production UI belongs to a later stage.
function operand(o) {
  switch (o.kind) {
    case 'register': return `[${o.number}]`;
    case 'symbol': return o.symbolId;
    case 'constructor': return `${o.symbolId}()`;
    case 'main': return 'PMAIN';
    default: return o.text;
  }
}
function render(data) {
  const lines = data.records.map(r => `${r.number}.- (${operand(r.left)}, ${r.operator}, ${operand(r.right)}, ${r.result.display})`);
  if (data.closure) lines.push(`${data.closure.classSymbolId} PMAIN -> ${operand(data.closure.target)}`);
  return lines.join('\n') + '\n';
}

test('Viernes coincide exactamente con los 15 registros y el cierre acordados', () => {
  const result = buildQuadruples(viernes());
  assert.equal(result.status, 'success');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(render(result), fixture('ArbolViernes.cuadruplos.txt'));
  const assignments = result.records.filter(r => r.left.symbolId === 'ID6');
  assert.equal(assignments.length, 2);
  assert.notEqual(assignments[0].nodeId, assignments[1].nodeId);
  assert.deepEqual(assignments.map(r => r.right.number), [5, 6]);
  assert.equal(result.records[12].left.symbolId, 'ID3');
  assert.equal(result.records[14].result.display, '12.0');
});

test('no muta el árbol ni sus valores; registros serializables por structuredClone', () => {
  const tree = viernes(), before = structuredClone(tree);
  const result = buildQuadruples(tree);
  assert.deepEqual(tree, before);
  assert.deepEqual(structuredClone(result), result);
  result.records[0].result.value = 999n;
  assert.deepEqual(tree, before);
});

test('ordena por niveles independientemente del almacenamiento y números previos', () => {
  const tree = viernes(), expected = buildQuadruples(tree);
  tree.nodes.reverse();
  tree.nodes.forEach(n => { n.operationNumber = 999; n.level = 99; });
  assert.deepEqual(buildQuadruples(tree), expected);
  for (const record of expected.records) {
    for (const operand of [record.left, record.right]) if (operand.kind === 'register') assert.ok(operand.number < record.number);
  }
});

test('reutiliza el resultado anotado sin recalcular una operación', () => {
  const tree = program(wrap('System.out.println(2+3);'));
  tree.nodes.find(n => n.kind === 'operator').evaluation = { type: 'int', value: 77n, token: 'VTE', display: '77', constant: false };
  const result = buildQuadruples(tree);
  assert.equal(result.records[0].result.display, '77');
  assert.equal(result.records[1].result.display, '77');
});

test('subárbol de expresión conserva tipos y no inventa un cierre PMAIN', () => {
  const tree = evaluateTree(buildExpressionTree("char a='A'; int b=35/10+a-(23+2)/5-10;", 'ID2').tree).tree;
  const result = buildQuadruples(tree);
  assert.equal(result.records.length, 8);
  assert.equal(result.records[1].result.display, "'A'");
  assert.equal(result.records.at(-1).result.display, '53');
  assert.equal(result.closure, null);
});

test('salida literal mantiene comillas y no confunde texto con registros', () => {
  const result = buildQuadruples(program(wrap('System.out.println("[1], hola");')));
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0].right, { kind: 'literal', text: '"[1], hola"' });
  assert.equal(result.records[0].result.display, '"[1], hola"');
});

test('evaluación incompleta conserva registros pendientes sin fabricar resultados', () => {
  const result = buildQuadruples(program(wrap('System.out.println(1/0);')));
  assert.equal(result.status, 'partial');
  assert.equal(result.records.length, 2);
  assert.ok(result.records.every(r => r.result.status === 'pending' && r.result.value === null));
  assert.equal(result.closure.target.number, 2);
});

test('rechaza entrada sin evaluar, grafo roto y contexto faltante de retorno', () => {
  assert.throws(() => buildQuadruples(buildProgramTree(fixture('ArbolViernes.java')).tree), /evaluado/);
  const tree = viernes();
  tree.contexts = [];
  assert.throws(() => buildQuadruples(tree), /ID/);
  tree.nodes.find(n => n.id === tree.rootId).children = [tree.rootId];
  assert.throws(() => buildQuadruples(tree), /ciclo/);
});
