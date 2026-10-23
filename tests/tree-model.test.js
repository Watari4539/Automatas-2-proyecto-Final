import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis } from '../src/compiler/index.js';
import { createTreeBuilder } from '../src/compiler/tree/model.js';

test('reutiliza IDs reales, incluido package y nombres iguales de distinta identidad', () => {
  const { symbols } = requestAnalysis('package asesorías; public class Viernes { public double a(int x, String y){ return x; } public static void main(String[] a){} }');
  const builder = createTreeBuilder(symbols);
  const method = symbols.find(s => s.kind === 'method');
  const mainParameter = symbols.find(s => s.name === 'a' && s.kind === 'parameter');
  const left = builder.addNode({ kind: 'call', symbolId: method.id });
  const right = builder.addNode({ kind: 'reference', symbolId: mainParameter.id });
  const root = builder.addNode({ kind: 'entry', symbolId: 'ID2', children: [left, right] });
  const tree = builder.build(root);
  assert.equal(tree.nodes.find(n => n.id === root).symbolId, 'ID2');
  assert.notEqual(method.id, mainParameter.id);
  assert.deepEqual(tree.nodes.map(n => n.symbolId), [method.id, mainParameter.id, 'ID2']);
  assert.ok(tree.nodes.every(n => n.text === null));
  assert.throws(() => builder.addNode({ kind: 'reference', symbolId: 'ID999' }), /no pertenece/);
  assert.throws(() => builder.addNode({ kind: 'reference', symbolId: method.id, text: 'a' }), /sin texto/);
});

test('dos derivaciones tienen nodos distintos y conservan el mismo símbolo', () => {
  const source = 'int variable = 2;';
  const { symbols, rows } = requestAnalysis(source);
  const builder = createTreeBuilder(symbols);
  const location = rows.find(row => row.originalLexeme === 'variable');
  function occurrence() {
    const value = builder.addNode({ kind: 'literal', text: '2' });
    return builder.addNode({ kind: 'assignment', symbolId: 'ID1', source: location, children: [value] });
  }
  const left = occurrence();
  const right = occurrence();
  const root = builder.addNode({ kind: 'operator', text: '+', children: [left, right] });
  const tree = builder.build(root);
  assert.equal(tree.nodes.length, 5);
  const occurrences = tree.nodes.filter(n => n.symbolId === 'ID1');
  assert.notEqual(occurrences[0].id, occurrences[1].id);
  assert.notEqual(occurrences[0].children[0], occurrences[1].children[0]);
  assert.equal(source.slice(occurrences[0].source.start, occurrences[0].source.end), 'variable');
  assert.ok(tree.nodes.every(n => n.operationNumber === null && n.evaluation === null));
  assert.deepEqual(tree.nodes.at(-1).children, [left, right]);
});

test('impide ramas compartidas y nodos desconectados', () => {
  const builder = createTreeBuilder();
  const leaf = builder.addNode({ kind: 'literal', text: '2' });
  const root = builder.addNode({ kind: 'operator', text: '+', children: [leaf, leaf] });
  assert.throws(() => builder.build(root), /no se comparten/);
  assert.throws(() => builder.build(leaf), /sin conectar/);
  assert.throws(() => builder.build('node999'), /raíz/);
  assert.throws(() => builder.addNode({ kind: 'operator', text: '+', children: ['node999'] }), /ya creados/);
});

test('la instantánea viaja por structured clone sin compartir arrays ni posiciones con el constructor', () => {
  const builder = createTreeBuilder();
  const source = { start: 0, end: 2, line: 1, column: 1 };
  const leaf = builder.addNode({ kind: 'literal', text: '35', source });
  const children = [leaf];
  const root = builder.addNode({ kind: 'output', text: 'SOUT', children });
  source.start = 99;
  children.length = 0;
  const tree = builder.build(root);
  assert.deepEqual(structuredClone(tree), tree);
  tree.nodes[0].source.start = 10;
  tree.nodes[1].children.length = 0;
  const fresh = builder.build(root);
  assert.equal(fresh.nodes[0].source.start, 0);
  assert.deepEqual(fresh.nodes[1].children, [leaf]);
  // Las fases futuras pueden anotar la copia sin modificar el árbol de construcción.
  fresh.nodes[0].evaluation = { type: 'int', value: 35n, token: 'VTE' };
  assert.equal(structuredClone(fresh).nodes[0].evaluation.value, 35n);
});

test('admite distintos números de hijos sin fijar reglas aún pendientes', () => {
  const builder = createTreeBuilder();
  const children = ['1', '2', '3'].map(text => builder.addNode({ kind: 'literal', text }));
  const root = builder.addNode({ kind: 'call', text: 'externo()', children });
  assert.equal(builder.build(root).nodes.at(-1).children.length, 3);
  assert.throws(() => builder.addNode({ kind: 'literal', text: '1', source: { start: 1, end: 0, line: 1, column: 1 } }), /ubicación/);
});
