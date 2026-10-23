import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { buildQuadruples } from '../src/compiler/quadruples/index.js';
import { formatOperand, formatRecord, formatClosure } from '../src/ui/quadruples/format.js';

test('formato de producción coincide con la referencia completa de Viernes', () => {
  const source = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
  const data = buildQuadruples(evaluateTree(buildProgramTree(source).tree).tree);
  const actual = [...data.records.map(formatRecord), formatClosure(data.closure)].join('\n') + '\n';
  assert.equal(actual, readFileSync(new URL('../fixtures/ArbolViernes.cuadruplos.txt', import.meta.url), 'utf8'));
});

test('literal con comas, corchetes y HTML conserva su texto sin interpretarlo', () => {
  const text = '"[1], <img src=x>, hola"';
  assert.equal(formatOperand({ kind: 'literal', text }), text);
  assert.throws(() => formatOperand({ kind: 'desconocido' }), TypeError);
});

test('pendientes explícitos y números globales se conservan al formatear', () => {
  const row = { number: 101, left: { kind: 'register', number: 99 }, operator: '+', right: { kind: 'literal', text: '1' }, result: { status: 'pending', display: null } };
  assert.equal(formatRecord(row), '101.- ([99], +, 1, Pendiente)');
  assert.equal(formatClosure(null), '');
});
