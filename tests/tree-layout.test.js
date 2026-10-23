import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutTree } from '../src/ui/tree/layout.js';
import { createTreeBuilder } from '../src/compiler/tree/model.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';

function checkGeometry(layout) {
  const byId = new Map(layout.nodes.map(node => [node.id, node]));
  const rows = new Map();
  for (const node of layout.nodes) {
    const b = node.bounds;
    assert.ok(b.x >= -1e-8 && b.y >= 0);
    assert.ok(b.x + b.width <= layout.bounds.width + 1e-8);
    assert.ok(b.y + b.height <= layout.bounds.height + 1e-8);
    const row = rows.get(node.depth) ?? [];
    if (row.length) {
      const previous = row.at(-1);
      assert.equal(previous.y, node.y);
      assert.ok(previous.bounds.x + previous.bounds.width + layout.config.siblingGap <= b.x + 1e-8);
    }
    row.push(node);
    rows.set(node.depth, row);
  }
  for (const edge of layout.edges) {
    const parent = byId.get(edge.from), child = byId.get(edge.to);
    assert.equal(child.depth, parent.depth + 1);
    assert.ok(parent.bounds.y + parent.bounds.height + layout.config.levelGap <= child.bounds.y + 1e-8);
    assert.deepEqual(edge.points[0], { x: parent.x, y: parent.y + parent.radius });
    assert.deepEqual(edge.points.at(-1), { x: child.x, y: child.y - child.radius });
    // Routed segments may touch their own circle, never enter another reserved box.
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1], z = edge.points[i];
      for (const node of layout.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        const b = node.bounds;
        const overlaps = a.x === z.x
          ? a.x > b.x && a.x < b.x + b.width && Math.max(a.y, z.y) > b.y && Math.min(a.y, z.y) < b.y + b.height
          : a.y > b.y && a.y < b.y + b.height && Math.max(a.x, z.x) > b.x && Math.min(a.x, z.x) < b.x + b.width;
        assert.equal(overlaps, false);
      }
    }
  }
  for (const parent of layout.nodes) {
    const children = layout.edges.filter(edge => edge.from === parent.id).map(edge => byId.get(edge.to));
    if (children.length) assert.ok(Math.abs(parent.x - (children[0].x + children.at(-1).x) / 2) < 1e-8);
  }
}

function expression() {
  return evaluateTree(buildExpressionTree("char a='A'; int b=35/10+a-(23+2)/5-10;", 'ID2').tree).tree;
}

test('expresión: conserva niveles, orden y valores, sin colisiones', () => {
  const tree = expression();
  const snapshot = structuredClone(tree);
  const layout = layoutTree(tree);
  checkGeometry(layout);
  assert.deepEqual(tree, snapshot);
  const operations = layout.nodes.filter(node => node.operationNumber).sort((a, b) => a.operationNumber - b.operationNumber);
  assert.deepEqual(operations.map(node => node.valueLines), [['3', 'VTE'], ["'A'", 'VTC'], ['25', 'VTE'], ['68', 'VTE'], ['5', 'VTE'], ['63', 'VTE'], ['53', 'VTE'], ['53', 'VTE']]);
  assert.equal(layout.nodes.find(node => node.id === tree.rootId).fullLabel, 'ID2=');
});

test('Viernes: IDs, cast, PMAIN y las dos derivaciones independientes', () => {
  const source = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
  const tree = evaluateTree(buildProgramTree(source).tree).tree;
  const layout = layoutTree(tree);
  checkGeometry(layout);
  assert.equal(layout.nodes[0].fullLabel, 'ID2\nPMAIN');
  const copies = layout.nodes.filter(node => node.fullLabel === 'ID6= (int)');
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0].x, copies[1].x);
  assert.ok(layout.nodes.some(node => node.fullLabel === 'ID2()'));
  assert.ok(layout.nodes.every(node => !/Viernes|variable/.test(node.fullLabel)));
  assert.equal(layout.nodes.filter(node => node.operationNumber).length, 13);
});

test('determinista, transferible y sin depender del orden de creación', () => {
  const tree = expression();
  const a = layoutTree(tree);
  tree.nodes.reverse();
  assert.deepEqual(layoutTree(tree), a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test('texto extenso conserva contenido, amplía espacios y admite evaluación pendiente', () => {
  const builder = createTreeBuilder();
  const text = '"' + 'á🙂'.repeat(90) + '"';
  const left = builder.addNode({ kind: 'literal', text });
  const right = builder.addNode({ kind: 'literal', text: '1' });
  const root = builder.addNode({ kind: 'operator', text: '+', children: [left, right] });
  const tree = builder.build(root);
  tree.nodes.find(node => node.id === root).evaluation = { display: text, token: 'VTS' };
  const layout = layoutTree(tree);
  checkGeometry(layout);
  assert.equal(layout.nodes.find(node => node.id === left).labelLines.join(''), text);
  assert.equal(layout.nodes[0].valueLines.slice(0, -1).join(''), text);
  assert.ok(layout.nodes[0].bounds.height > 100);
  assert.equal(layout.nodes.find(node => node.id === right).value, null);
});

test('nodo aislado y cadena larga sin recursión ni hojas forzadas al fondo', () => {
  const builder = createTreeBuilder();
  let root = builder.addNode({ kind: 'literal', text: '1' });
  checkGeometry(layoutTree(builder.build(root)));
  for (let i = 0; i < 300; i++) root = builder.addNode({ kind: 'return', text: 'RTN', children: [root] });
  const layout = layoutTree(builder.build(root));
  assert.equal(new Set(layout.nodes.map(node => node.x)).size, 1);
  assert.equal(layout.nodes.length, 301);
  assert.ok(layout.nodes.every(node => Number.isFinite(node.y)));
});

test('ramas desiguales y anchas mantienen separación en cada profundidad', () => {
  const builder = createTreeBuilder();
  let sequence = 0;
  function branch(depth) {
    const text = String(++sequence).repeat(sequence % 17 + 1);
    if (!depth || sequence % 5 === 0) return builder.addNode({ kind: 'literal', text });
    const children = [branch(depth - 1), branch(depth - 1)];
    return builder.addNode({ kind: 'operator', text: '+', children });
  }
  const root = branch(7);
  checkGeometry(layoutTree(builder.build(root)));
});

test('rechaza opciones y grafos inválidos', () => {
  for (const options of [{ siblingGap: -1 }, { levelGap: NaN }, { maxLineLength: 1.5 }, { padding: Infinity }, { typo: 1 }]) {
    assert.throws(() => layoutTree(expression(), options), TypeError);
  }
  const tree = expression();
  tree.nodes.find(node => node.id === tree.rootId).children.push(tree.rootId);
  assert.throws(() => layoutTree(tree), /ciclo/);
});

test('leyenda conserva IDs y nombres una sola vez, solo para símbolos usados por el árbol', () => {
  const source = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
  const layout = layoutTree(evaluateTree(buildProgramTree(source).tree).tree);
  assert.deepEqual(layout.symbols, [
    { id: 'ID2', name: 'Viernes' },
    { id: 'ID3', name: 'a' },
    { id: 'ID4', name: 'x' },
    { id: 'ID6', name: 'variable' },
    { id: 'ID8', name: 'num' },
  ]);
});
