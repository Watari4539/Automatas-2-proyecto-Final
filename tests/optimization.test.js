import { formatOptimizationTable } from '../src/ui/optimization/format.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeQuadruples } from '../src/compiler/optimization/index.js';
import { readLiteral, annotation } from '../src/compiler/tree/values.js';
import { formatRecord } from '../src/ui/quadruples/format.js';
const lit = text => ({ kind: 'literal', text });
const ref = number => ({ kind: 'register', number });
const sym = symbolId => ({ kind: 'symbol', symbolId });
const ext = text => ({ kind: 'external', text });
const row = (number, left, operator, right, result) => ({ number, nodeId: `n${number}`, contextId: 'c1', source: null, left, operator, right, result: { status: 'available', ...annotation(readLiteral(result)) } });
const input = records => ({ status: 'success', validation: { valid: true }, records, closure: { classSymbolId: 'ID1', entry: 'PMAIN', target: ref(records.length) } });

test('ejemplo aprobado: siete eliminaciones, tipos, derivados y cierre', () => {
  const original = input([
    row(1, lit('99'), '+', lit('10'), '109'),
    row(2, ref(1), '/', lit('1'), '109'),
    row(3, sym('ID4'), '=', ref(2), '109.0'),
    row(4, lit('33'), '+', lit('2'), '35'),
    row(5, sym('ID3'), '=', ref(4), '35.0f'),
    row(6, ref(3), '*', lit('3'), '327.0'),
    row(7, ref(6), '+', ref(5), '362.0'),
    row(8, sym('ID2'), 'RTN', ref(7), '362.0'),
    row(9, sym('ID1'), '.', ref(8), '362.0'),
    row(10, { kind: 'main' }, 'SOUT', ref(9), '362.0'),
  ]);
  const saved = structuredClone(original);
  const out = optimizeQuadruples(original, { constantAssignments: ['q3', 'q5'] });
  assert.equal(out.status, 'success');
  assert.deepEqual(out.events.map(e => e.technique + (e.derived ? 'D' : '')), ['FO', 'SE', 'PCD', 'FO', 'PCD', 'FOD', 'FOD']);
  assert.deepEqual(out.records.map(formatRecord), ['1.- (ID2, RTN, 362.0, 362.0)', '2.- (ID1, ., [1], 362.0)', '3.- (PMAIN, SOUT, [2], 362.0)']);
  assert.equal(out.closure.target.number, 3);
  assert.deepEqual(original, saved);
  assert.deepEqual(out.events[0].affectedRecordIds, ['q2']);
  assert.equal(out.events[4].replacement.type, 'float');
  const table = formatOptimizationTable(out);
  assert.equal(table.length, 10);
  assert.deepEqual(table.map(r => r.optimization), ['FO', 'SE', 'PCD', 'FO', 'PCD', 'FOD', 'FOD', '—', '—', '—']);
  assert.deepEqual(table.map(r => r.affected), ['2', '3', '6', '5', '7', '7', '8', '—', '—', '—']);
  assert.deepEqual(table.map(r => r.modified), [
    'ELIMINAR',
    '1.- (109, /, 1, 109) → ELIMINAR',
    '1.- (ID4, =, 109, 109.0) → ELIMINAR',
    '1.- (33, +, 2, 35) → ELIMINAR',
    '1.- (ID3, =, 35, 35.0f) → ELIMINAR',
    '1.- (109.0, *, 3, 327.0) → ELIMINAR',
    '1.- (327.0, +, 35.0f, 362.0) → ELIMINAR',
    '1.- (ID2, RTN, 362.0, 362.0)',
    '2.- (ID1, ., [1], 362.0)',
    '3.- (PMAIN, SOUT, [2], 362.0)',
  ]);
  assert.deepEqual(table.map(r => r.original), saved.records.map(formatRecord));
  out.rows[0].original.left.text = 'changed';
  assert.equal(out.originals[0].left.text, '99');
});

test('PC requiere evidencia y no convierte un resultado externo en constante', () => {
  const out = optimizeQuadruples(input([row(1, ext('Math'), '.', ext('random()'), '1.0'), row(2, sym('ID2'), '=', ref(1), '1.0'), row(3, sym('ID3'), '=', lit('2'), '2')] ), { constantAssignments: ['q2'] });
  assert.equal(out.records.length, 3);
});

test('RS conserva primera expresión con referencias estables y actualiza consumidores', () => {
  const out = optimizeQuadruples(input([
    row(1, ext('Math'), '.', ext('random()'), '1.0'),
    row(2, ref(1), '*', lit('2'), '2.0'), row(3, ref(1), '*', lit('2'), '2.0'),
    row(4, ref(2), '+', ref(3), '4.0') ]));
  assert.equal(out.events[0].technique, 'RS');
  assert.equal(out.records[2].right.number, 2);
  assert.equal(out.records[2].left.number, 2);
});

test('SE no elimina promoción de tipo, FO respeta división entera', () => {
  const out = optimizeQuadruples(input([row(1, lit('35'), '/', lit('10'), '3'), row(2, ref(1), '*', lit('1.0'), '3.0')]));
  assert.deepEqual(out.events.map(e => e.technique), ['FO', 'FO']);
  assert.equal(out.closure.target.type, 'double');
  assert.equal(out.closure.target.value, 3);
});

test('bloquea entrada parcial, limita tamaño y rechaza referencias hacia adelante', () => {
  assert.equal(optimizeQuadruples({status: 'partial'}).status, 'blocked');
  assert.equal(optimizeQuadruples(input([row(1, ref(2), '+', lit('1'), '2')])).status, 'invalid');
  assert.equal(optimizeQuadruples(input([row(1, lit('1'), '+', lit('1'), '2')]), {maxRecords: 0}).status, 'limit');
});

test('tabla muestra varios consumidores originales sin duplicados y el cierre', () => {
  const source = input([
    row(1, lit('2'), '+', lit('3'), '5'),
    row(2, sym('ID2'), 'RTN', ref(1), '5'),
    row(3, ref(1), '+', ref(1), '10'),
  ]);
  const out = optimizeQuadruples(source);
  const table = formatOptimizationTable(out);
  assert.equal(table[0].affected, '2, 3');
  assert.equal(table[2].affected, 'cierre');
  assert.equal(table[1].optimization, '—');
  assert.equal(table[1].modified, '1.- (ID2, RTN, 5, 5)');
  assert.equal(table[2].original, '3.- ([1], +, [1], 10)');
});

test('tabla conserva filas sin optimización y no expone resultados bloqueados', () => {
  const out = optimizeQuadruples(input([row(1, ext('Math'), '.', ext('random()'), '1.0')]));
  const table = formatOptimizationTable(out);
  assert.deepEqual(table[0], {
    original: '1.- (Math, ., random(), 1.0)', optimization: '—', affected: '—', modified: '1.- (Math, ., random(), 1.0)',
  });
  assert.deepEqual(formatOptimizationTable(optimizeQuadruples({status: 'partial'})), []);
});
