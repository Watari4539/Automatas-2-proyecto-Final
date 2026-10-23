import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { buildQuadruples, validateQuadruples } from '../src/compiler/quadruples/index.js';
const source = readFileSync(new URL('../fixtures/ArbolViernes.java', import.meta.url), 'utf8');
const tree = evaluateTree(buildProgramTree(source).tree).tree;
const original = buildQuadruples(tree);

for (const [name, mutate, code] of [
  ['registro faltante', q => q.records.splice(3, 1), 'QUAD_RECORD_COUNT'],
  ['registro extra', q => q.records.push(structuredClone(q.records[0])), 'QUAD_RECORD_COUNT'],
  ['numeración duplicada', q => { q.records[1].number = 1; }, 'QUAD_NUMBERING'],
  ['referencia futura', q => { q.records[3].right.number = 5; }, 'QUAD_REFERENCE'],
  ['autorreferencia', q => { q.records[3].right.number = 4; }, 'QUAD_REFERENCE'],
  ['referencia inexistente', q => { q.records[3].right.number = 100; }, 'QUAD_REFERENCE'],
  ['referencia no entera', q => { q.records[3].right.number = 1.5; }, 'QUAD_REFERENCE'],
  ['copia equivocada con el mismo valor', q => { q.records[8].right.number = 5; }, 'QUAD_PRODUCER'],
  ['ID inexistente', q => { q.records[3].left.symbolId = 'ID999'; }, 'QUAD_UNKNOWN_SYMBOL'],
  ['ID existente pero incorrecto', q => { q.records[3].left.symbolId = 'ID4'; }, 'QUAD_PRODUCER'],
  ['método incorrecto en RTN', q => { q.records[12].left.symbolId = 'ID4'; }, 'QUAD_PRODUCER'],
  ['operador modificado', q => { q.records[0].operator = '*'; }, 'QUAD_OPERATOR'],
  ['operandos intercambiados', q => { [q.records[0].left, q.records[0].right] = [q.records[0].right, q.records[0].left]; }, 'QUAD_PRODUCER'],
  ['valor incorrecto', q => { q.records[0].result.value = 7n; }, 'QUAD_RESULT'],
  ['tipo incorrecto', q => { q.records[0].result.type = 'double'; }, 'QUAD_RESULT'],
  ['token incorrecto', q => { q.records[0].result.token = 'VTD'; }, 'QUAD_RESULT'],
  ['formato incorrecto', q => { q.records[0].result.display = '6.0'; }, 'QUAD_RESULT'],
  ['origen de otra ocurrencia', q => { q.records[8].nodeId = q.records[7].nodeId; }, 'QUAD_ORIGIN'],
  ['contexto cambiado', q => { q.records[12].contextId = 'context1'; }, 'QUAD_ORIGIN'],
  ['clase incorrecta del cierre', q => { q.closure.classSymbolId = 'ID1'; }, 'QUAD_CLOSURE'],
  ['cierre hacia otro registro', q => { q.closure.target.number = 14; }, 'QUAD_CLOSURE'],
  ['cierre numerado', q => { q.closure.number = 16; }, 'QUAD_CLOSURE'],
  ['estado parcial sin pendientes', q => { q.status = 'partial'; }, 'QUAD_STATUS'],
  ['registro nulo', q => { q.records[0] = null; }, 'QUAD_INVALID_RECORD'],
  ['operando nulo', q => { q.records[0].left = null; }, 'QUAD_OPERAND'],
]) {
  test(`detecta ${name}`, () => {
    const changed = structuredClone(original);
    mutate(changed);
    const validation = validateQuadruples(tree, changed);
    assert.equal(validation.valid, false);
    assert.equal(validation.complete, false);
    assert.ok(validation.diagnostics.some(d => d.code === code), JSON.stringify(validation.diagnostics));
  });
}

test('validación automática y explícita coinciden y no modifican las entradas', () => {
  const beforeTree = structuredClone(tree), beforeData = structuredClone(original);
  const result = validateQuadruples(tree, original);
  assert.deepEqual(result, { valid: true, complete: true, diagnostics: [] });
  assert.deepEqual(original.validation, result);
  assert.deepEqual(tree, beforeTree);
  assert.deepEqual(original, beforeData);
});

test('pendiente legítimo es válido pero incompleto; resultados y avisos inventados fallan', () => {
  const partialTree = evaluateTree(buildProgramTree('public class Demo { public static void main(String[] args) { System.out.println(1/0); } }').tree).tree;
  const q = buildQuadruples(partialTree);
  assert.deepEqual(q.validation, { valid: true, complete: false, diagnostics: [] });
  q.records[0].result.value = 0n;
  assert.ok(validateQuadruples(partialTree, q).diagnostics.some(d => d.code === 'QUAD_PENDING_RESULT'));
  q.records[0].result.value = null;
  q.diagnostics = [];
  assert.ok(validateQuadruples(partialTree, q).diagnostics.some(d => d.code === 'QUAD_DIAGNOSTICS'));
  q.status = 'success';
  assert.ok(validateQuadruples(partialTree, q).diagnostics.some(d => d.code === 'QUAD_STATUS'));
});

test('subárbol sin PMAIN se valida sin cierre', () => {
  const t = evaluateTree(buildExpressionTree('int a=1+2;', 'ID1').tree).tree;
  const q = buildQuadruples(t);
  assert.equal(q.validation.valid, true);
  q.closure = original.closure;
  assert.ok(validateQuadruples(t, q).diagnostics.some(d => d.code === 'QUAD_CLOSURE'));
});

test('texto con corchetes no se interpreta como referencia', () => {
  const t = evaluateTree(buildProgramTree('public class Demo { public static void main(String[] args) { System.out.println("[999], RTN"); } }').tree).tree;
  assert.equal(buildQuadruples(t).validation.valid, true);
});

test('entradas incompletas y metadatos inválidos producen diagnósticos sin lanzar', () => {
  for (const q of [null, {}, { version: 1, records: null }, { ...original, version: 5 }]) assert.equal(validateQuadruples(tree, q).valid, false);
  assert.equal(validateQuadruples(null, original).valid, false);
  const broken = structuredClone(tree);
  broken.symbols = null;
  assert.equal(validateQuadruples(broken, original).valid, false);
  broken.symbols = tree.symbols;
  broken.contexts = [];
  assert.ok(validateQuadruples(broken, original).diagnostics.some(d => d.code === 'QUAD_RETURN_CONTEXT'));
});
