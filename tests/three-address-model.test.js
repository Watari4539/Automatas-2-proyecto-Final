import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPORARIES, createOrigin, createOperand, createOperation, createAssignment, createPending, createClosure, createMemoryState, createEmptyResult } from '../src/compiler/three-address/model.js';
const origin = () => ({ quadrupleNumber: 7, nodeId: 'node12', treeOperationNumber: 4, contextId: 'context2', source: { start: 10, end: 11, line: 2, column: 3 } });
const literal = text => ({ kind: 'literal', text });
const temp = (name, producer = 1) => ({ kind: 'temporary', name, producer });

test('pendientes conservan número del árbol independiente de cuádruplos', () => {
  const p = createPending(origin());
  assert.equal(p.treeOperationNumber, 4);
  assert.equal(p.origin.quadrupleNumber, 7);
  assert.throws(() => createPending({ ...origin(), treeOperationNumber: null }));
  assert.equal(createOrigin({ ...origin(), treeOperationNumber: null }).treeOperationNumber, null);
});
test('solo hay tres temporales y se impide autorreferencia incluso en argumentos', () => {
  assert.deepEqual(TEMPORARIES, ['T1', 'T2', 'T3']);
  assert.throws(() => createOperand(temp('T4')));
  assert.throws(() => createOperation({ destination: 'T1', left: temp('T1'), operator: '+', right: literal('2'), origin: origin() }));
  assert.throws(() => createOperation({ destination: 'T1', left: literal('"ABC"'), operator: '.', right: { kind: 'externalCall', name: 'substring', args: [temp('T1')] }, origin: origin() }));
  const valid = createOperation({ destination: 'T2', left: literal('2'), operator: '+', right: temp('T1'), origin: origin() });
  assert.equal(valid.destination, 'T2');
  assert.equal(valid.right.producer, 1);
});
test('RTN y SOUT requieren un temporal distinto de su entrada', () => {
  for (const [left, operator] of [[{ kind: 'symbolIdentity', symbolId: 'ID2' }, 'RTN'], [{ kind: 'main' }, 'SOUT']]) {
    assert.equal(createOperation({ destination: 'T2', left, operator, right: temp('T1'), origin: origin() }).operator, operator);
    assert.throws(() => createOperation({ destination: 'T1', left, operator, right: temp('T1'), origin: origin() }));
  }
});
test('asignaciones conservan productores y cierre sin numeración adicional', () => {
  const a = createAssignment({ symbolId: 'ID3', value: { kind: 'symbol', symbolId: 'ID4', producer: 2 }, origin: origin() });
  assert.equal(a.value.producer, 2);
  assert.ok(!Object.hasOwn(a, 'destination'));
  const close = createClosure({ classSymbolId: 'ID1', target: temp('T2', 9) });
  assert.equal(close.entry, 'PMAIN');
  assert.ok(!Object.hasOwn(close, 'number'));
  assert.throws(() => createClosure({ classSymbolId: 'ID1', target: literal('2') }));
});
test('las identidades de productores y orígenes son obligatorias y válidas', () => {
  assert.throws(() => createOperand({ kind: 'symbol', symbolId: 'ID1' }));
  assert.throws(() => createOrigin({ ...origin(), quadrupleNumber: 0 }));
  assert.throws(() => createOrigin({ ...origin(), treeOperationNumber: 1.5 }));
  assert.throws(() => createAssignment({ symbolId: 'variable', value: literal('1'), origin: origin() }));
  assert.throws(() => createOperation({ destination: 'T1', left: literal('81'), operator: 'CAST', right: literal('char'), origin: origin() }));
});
test('datos independientes y transferibles; estado inicial sin memoria ocupada', () => {
  const input = origin();
  const instruction = createAssignment({ symbolId: 'ID1', value: literal('3'), origin: input });
  input.source.line = 99;
  assert.equal(instruction.origin.source.line, 2);
  assert.deepEqual(structuredClone(instruction), instruction);
  const a = createMemoryState(), b = createMemoryState();
  a.temporaries[0].producer = 8; a.pending.push(4);
  assert.equal(b.temporaries[0].producer, null);
  assert.deepEqual(b.pending, []);
  assert.deepEqual(structuredClone(b), b);
  const result = createEmptyResult();
  result.instructions.push(instruction);
  assert.deepEqual(createEmptyResult().instructions, []);
});
