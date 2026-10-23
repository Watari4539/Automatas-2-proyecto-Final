import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOptimizationRows } from '../src/compiler/optimization/rows.js';
import { formatOptimizationRow } from '../src/ui/optimization/format.js';
const r = text => ({ number: 1, left: {kind: 'literal', text}, operator: '+', right: {kind: 'literal', text: '0'}, result: {status: 'available', display: '2'} });

test('preserva eventos intermedios ordenados en una sola fila y sin mutación', () => {
  const original = r('2');
  const event = {recordId: 'q1', technique: 'SE', derived: false, affectedRecordIds: [], affectsClosure: false, before: original};
  const output = {status: 'success', originals: [original], records: [], numberMap: {q1: null}, events: [
    {...event, sequence: 2, action: 'remove'},
    {...event, sequence: 1, action: 'replace', after: r('3')},
  ]};
  const saved = structuredClone(output);
  const rows = buildOptimizationRows(output);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].events.map(e => e.sequence), [1, 2]);
  const formatted = formatOptimizationRow(rows[0]);
  assert.equal(formatted.optimization, 'SE\nSE');
  assert.equal(formatted.modified, '1.- (2, +, 0, 2) → 1.- (3, +, 0, 2)\nELIMINAR');
  assert.deepEqual(output, saved);
});

test('rechaza afectados inexistentes y supervivientes sin registro final', () => {
  const base = {status: 'success', originals: [r('2')], records: [], numberMap: {q1: 1}, events: []};
  assert.throws(() => buildOptimizationRows(base), /final/);
  assert.throws(() => buildOptimizationRows({...base, events: [{recordId: 'q1', affectedRecordIds: ['q99']}]}), /desconocido/);
});
