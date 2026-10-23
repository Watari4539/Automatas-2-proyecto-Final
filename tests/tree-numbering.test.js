import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTreeBuilder } from '../src/compiler/tree/model.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { numberTreeOperations } from '../src/compiler/tree/numbering.js';

function reference() {
  const result = buildExpressionTree("char a='A'; int b=35/10+a-(23+2)/5-10;", 'ID2');
  assert.equal(result.status, 'success');
  return result.tree;
}

test('el ejemplo b coincide con las ocho operaciones y los seis niveles del dibujo', () => {
  const result = numberTreeOperations(reference());
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  assert.deepEqual(result.numbering.operationOrder.map(id => {
    const node = nodes.get(id);
    return [node.operationNumber, node.symbolId ?? node.text, node.level];
  }), [
    [1, '/', 2], [2, 'ID1', 2], [3, '+', 2],
    [4, '+', 3], [5, '/', 3], [6, '-', 4], [7, '-', 5], [8, 'ID2', 6],
  ]);
  assert.equal(result.numbering.operationCount, 8);
  assert.deepEqual(result.numbering.levels.map(row => row.nodeIds.length), [5, 4, 2, 2, 1, 1]);
  assert.ok(result.nodes.filter(node => node.kind === 'literal').every(node => node.operationNumber === null));
  const root = nodes.get(result.rootId);
  assert.deepEqual([root.depth, root.level, root.levelIndex], [0, 6, 0]);
  assert.equal(nodes.get(root.children[0]).level, 5);
});

test('termina el nivel inferior de ambas ramas antes de ascender por la rama izquierda', () => {
  const result = numberTreeOperations(reference());
  const operators = result.nodes.filter(node => node.kind === 'operator' && node.text === '+');
  const lower = operators.find(node => node.level === 2);
  const upperLeft = operators.find(node => node.level === 3);
  assert.equal(lower.operationNumber, 3);
  assert.equal(upperLeft.operationNumber, 4);
});

test('el orden lo definen los hijos y la profundidad, no el array ni los IDs internos', () => {
  const tree = reference();
  const expected = numberTreeOperations(tree);
  tree.nodes.reverse();
  const actual = numberTreeOperations(tree);
  assert.deepEqual(actual.numbering, expected.numbering);
  const ids = new Map(tree.nodes.map((node, index) => [node.id, `arbitrario-${100 - index}`]));
  tree.rootId = ids.get(tree.rootId);
  for (const node of tree.nodes) {
    node.id = ids.get(node.id);
    node.children = node.children.map(id => ids.get(id));
  }
  assert.deepEqual(numberTreeOperations(tree).numbering.operationOrder, expected.numbering.operationOrder.map(id => ids.get(id)));
});

test('los valores en alturas distintas no se alinean artificialmente en el nivel inferior', () => {
  const result = numberTreeOperations(reference());
  const fives = result.nodes.filter(node => node.text === '5');
  const tens = result.nodes.filter(node => node.text === '10');
  assert.equal(fives[0].level, 2);
  assert.deepEqual(tens.map(node => node.level).sort((a, b) => a - b), [1, 4]);
});

test('no modifica la entrada y recalcular produce el mismo resultado sin acumular números', () => {
  const tree = reference();
  tree.nodes[0].evaluation = { type: 'int', value: 35n, token: 'VTE' };
  const original = structuredClone(tree);
  const result = numberTreeOperations(tree);
  assert.deepEqual(tree, original);
  assert.deepEqual(numberTreeOperations(result), result);
  assert.deepEqual(result.nodes[0].evaluation, tree.nodes[0].evaluation);
  result.nodes[0].evaluation.value = 99n;
  assert.equal(tree.nodes[0].evaluation.value, 35n);
});

test('un literal aislado tiene un nivel y ninguna operación', () => {
  const builder = createTreeBuilder();
  const root = builder.addNode({ kind: 'literal', text: '1' });
  const result = numberTreeOperations(builder.build(root));
  assert.equal(result.numbering.operationCount, 0);
  assert.deepEqual(result.numbering.operationOrder, []);
  assert.deepEqual([result.nodes[0].depth, result.nodes[0].level, result.nodes[0].operationNumber], [0, 1, null]);
});

test('rechaza grafos rotos o compartidos antes de numerarlos', () => {
  const tree = reference();
  const root = tree.nodes.find(node => node.id === tree.rootId);
  root.children.push(root.children[0]);
  assert.throws(() => numberTreeOperations(tree), /compartida/);
  root.children = [tree.rootId];
  assert.throws(() => numberTreeOperations(tree), /ciclo/);
  root.children = ['inexistente'];
  assert.throws(() => numberTreeOperations(tree), /hijo/);
  root.children = [];
  assert.throws(() => numberTreeOperations(tree), /desconectados/);
  assert.throws(() => numberTreeOperations({ nodes: [], rootId: null }), TypeError);
});

test('Viernes numera también RTN y conserva llamadas, contextos, casts e IDs', () => {
  const source = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
  const tree = buildProgramTree(source).tree;
  const result = numberTreeOperations(tree);
  assert.deepEqual(result.contexts, tree.contexts);
  assert.deepEqual(result.symbols, tree.symbols);
  const copies = result.nodes.filter(node => node.symbolId === 'ID6');
  assert.equal(copies.length, 2);
  assert.ok(copies.every(node => node.castType === 'int' && node.operationNumber > 0));
  assert.notEqual(copies[0].operationNumber, copies[1].operationNumber);
  assert.ok(result.nodes.filter(node => !['assignment', 'operator', 'return'].includes(node.kind)).every(node => node.operationNumber === null));
  assert.ok(result.nodes.filter(node => node.kind === 'return').every(node => node.operationNumber > 0));
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  assert.deepEqual(result.numbering.operationOrder.map(id => {
    const node = nodes.get(id);
    return [node.operationNumber, node.symbolId ?? node.text, node.level];
  }), [
    [1, '/', 2], [2, '.', 2], [3, '.', 2],
    [4, 'ID8', 3], [5, '*', 3], [6, '*', 3],
    [7, 'ID6', 4], [8, 'ID6', 4], [9, '*', 5], [10, '/', 5],
    [11, '+', 6], [12, 'RTN', 7], [13, '.', 9],
  ]);
  for (const node of result.nodes) {
    for (const id of node.children) assert.equal(nodes.get(id).depth, node.depth + 1);
  }
});

test('RTN se numera después de su expresión y SOUT no consume un número', () => {
  const builder = createTreeBuilder();
  const left = builder.addNode({ kind: 'literal', text: '1' });
  const right = builder.addNode({ kind: 'literal', text: '2' });
  const sum = builder.addNode({ kind: 'operator', text: '+', children: [left, right] });
  const rtn = builder.addNode({ kind: 'return', text: 'RTN', children: [sum] });
  const root = builder.addNode({ kind: 'output', text: 'SOUT', children: [rtn] });
  const tree = builder.build(root);
  tree.nodes.forEach(node => { node.operationNumber = 999; });
  const result = numberTreeOperations(tree);
  assert.deepEqual(result.numbering.operationOrder, [sum, rtn]);
  assert.deepEqual(result.nodes.map(node => node.operationNumber), [null, null, 1, 2, null]);
});
