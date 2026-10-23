import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeProgram } from '../src/compiler/analysis.js';
import { requestAnalysis } from '../src/compiler/index.js';
const fixture = name => readFileSync(new URL(`../fixtures/${name}.java`, import.meta.url), 'utf8');
const wrap = body => `public class Demo { public static void main(String[] args) { ${body} } }`;

test('integración conserva tablas y genera Viernes con los mismos IDs y 13 operaciones', () => {
  const source = fixture('ArbolViernes');
  const result = analyzeProgram(source);
  const { treeAnalysis, quadrupleAnalysis, threeAddressAnalysis, ...tables } = result;
  assert.deepEqual(tables, requestAnalysis(source));
  assert.equal(treeAnalysis.status, 'success');
  assert.equal(treeAnalysis.layout.nodes[0].fullLabel, 'ID2\nPMAIN');
  assert.equal(treeAnalysis.layout.nodes.filter(n => n.operationNumber).length, 13);
  assert.deepEqual(result.errors, []);
  assert.ok(treeAnalysis.layout.nodes.some(n => n.valueLines.join(' ') === '12.0 VTD'));
  assert.deepEqual(structuredClone(result), result);
});

test('generación sucesiva usa solo la fuente actual y no mezcla símbolos', () => {
  const source = wrap("char a='A'; int b=35/10+a-(23+2)/5-10; System.out.println(b);");
  const result = analyzeProgram(source);
  assert.equal(result.treeAnalysis.status, 'success');
  assert.ok(result.treeAnalysis.layout.nodes.some(n => n.fullLabel === 'ID4=' && n.valueLines.join(' ') === '53 VTE'));
  const next = analyzeProgram(wrap('System.out.println(2+3);'));
  assert.equal(next.treeAnalysis.status, 'success');
  assert.ok(next.treeAnalysis.layout.nodes.some(n => n.valueLines.join(' ') === '5 VTE'));
  assert.ok(!next.treeAnalysis.layout.nodes.some(n => n.fullLabel === 'ID4='));
});

test('entrada vacía y límites no intentan dibujar un árbol', () => {
  assert.equal(analyzeProgram('').treeAnalysis.status, 'empty');
  const result = analyzeProgram('a'.repeat(100001));
  assert.equal(result.treeAnalysis.status, 'limit');
  assert.equal(result.treeAnalysis.layout, null);
});

test('errores léxicos y casos sin detonador conservan sus tablas', () => {
  for (const source of [wrap('int a=#;'), wrap('int a=1;')]) {
    const result = analyzeProgram(source);
    assert.equal(result.treeAnalysis.layout, null);
    assert.notEqual(result.treeAnalysis.status, 'failed');
    assert.ok(result.treeAnalysis.diagnostics.length);
    assert.ok(result.rows.length);
  }
});

test('evaluación parcial conserva el dibujo sin inventar el valor de una división por cero', () => {
  const result = analyzeProgram(wrap('System.out.println(1/0);'));
  assert.equal(result.treeAnalysis.status, 'partial');
  assert.ok(result.treeAnalysis.diagnostics.length);
  const division = result.treeAnalysis.layout.nodes.find(n => n.fullLabel === '/');
  assert.deepEqual(division.valueLines, []);
});

test('Viernes integra 15 cuádruplos validados sin renumerar las 13 operaciones del árbol', () => {
  const result = analyzeProgram(fixture('ArbolViernes'));
  const q = result.quadrupleAnalysis;
  assert.equal(q.status, 'success');
  assert.deepEqual(q.validation, { valid: true, complete: true, diagnostics: [] });
  assert.equal(q.records.length, 15);
  assert.equal(q.records[12].left.symbolId, 'ID3');
  assert.equal(q.records[14].result.display, '12.0');
  assert.equal(q.closure.classSymbolId, 'ID2');
  assert.equal(q.closure.target.number, 15);
  assert.equal(result.treeAnalysis.layout.nodes.filter(n => n.operationNumber).length, 13);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(structuredClone(result), result);
});

test('cuádruplos vacíos, bloqueados y limitados no conservan registros anteriores', () => {
  analyzeProgram(fixture('ArbolViernes'));
  for (const [source, expected] of [['', 'empty'], [wrap('int x=1;'), 'blocked'], [wrap('int x=#;'), 'blocked'], ['a'.repeat(100001), 'limit']]) {
    const result = analyzeProgram(source);
    assert.equal(result.quadrupleAnalysis.status, expected);
    assert.deepEqual(result.quadrupleAnalysis.records, []);
    assert.equal(result.quadrupleAnalysis.closure, null);
  }
});

test('cuádruplos parciales preservan pendientes sin afectar las tablas ni el dibujo', () => {
  const result = analyzeProgram(wrap('System.out.println(1/0);'));
  assert.equal(result.quadrupleAnalysis.status, 'partial');
  assert.equal(result.quadrupleAnalysis.validation.valid, true);
  assert.equal(result.quadrupleAnalysis.validation.complete, false);
  assert.ok(result.quadrupleAnalysis.records.every(r => r.result.status === 'pending'));
  assert.ok(result.treeAnalysis.layout);
  assert.ok(result.rows.length);
});

test('generaciones sucesivas de cuádruplos reinician numeración e identidades', () => {
  analyzeProgram(fixture('ArbolViernes'));
  const q = analyzeProgram(wrap('System.out.println(2+3);')).quadrupleAnalysis;
  assert.deepEqual(q.records.map(r => r.number), [1, 2]);
  assert.equal(q.closure.classSymbolId, 'ID1');
  assert.equal(q.closure.target.number, 2);
  assert.equal(q.records[1].result.display, '5');
});


test('tres direcciones integra Viernes validado y transferible al Worker', () => {
  const result = analyzeProgram(fixture('ArbolViernes'));
  const t = result.threeAddressAnalysis;
  assert.equal(t.status, 'success');
  assert.equal(t.validation.valid, true);
  assert.equal(t.instructions.length, 15);
  assert.equal(t.closure.classSymbolId, 'ID2');
  assert.equal(t.closure.target.name, 'T1');
  assert.deepEqual(structuredClone(result), result);
});
test('tres direcciones limpia generaciones y respeta estados vacíos y bloqueados', () => {
  analyzeProgram(fixture('ArbolViernes'));
  for (const [source, status] of [['', 'empty'], [wrap('int x=1;'), 'blocked'], ['a'.repeat(100001), 'limit']]) {
    const t = analyzeProgram(source).threeAddressAnalysis;
    assert.equal(t.status, status);
    assert.deepEqual(t.instructions, []);
    assert.equal(t.closure, null);
  }
  const t = analyzeProgram(wrap('System.out.println(2+3);')).threeAddressAnalysis;
  assert.equal(t.instructions.length, 2);
  assert.equal(t.instructions[0].destination, 'T1');
  assert.equal(t.closure.classSymbolId, 'ID1');
});
test('tres direcciones conserva pendientes, avisos y las demás salidas', () => {
  const pending = analyzeProgram(wrap('int a=1+2;int b=3+4;int c=5+6;int d=7+8;System.out.println((a+b)+(c+d));')).threeAddressAnalysis;
  assert.equal(pending.validation.valid, true);
  assert.ok(pending.instructions.some(i => i.kind === 'pending' && i.treeOperationNumber === 4));
  for (const [expression, status] of [['1/0', 'partial'], ['(char)81', 'unsupported'], ['((1+2)+(3+4))+((5+6)+(7+8))', 'blocked']]) {
    const result = analyzeProgram(wrap(`System.out.println(${expression});`));
    assert.equal(result.threeAddressAnalysis.status, status);
    assert.ok(result.treeAnalysis.layout);
    assert.equal(result.quadrupleAnalysis.validation.valid, true);
    assert.ok(result.rows.length);
  }
});

test('cast del retorno se anota en RTN y genera tres direcciones sin CAST adicional', () => {
  const source = `package dos;
public class Lunes {
 public char m(double a, int b, char c) {
  float d = (float)(a/b);
  int e = c + 1;
  return (char)(d+e);
 }
 public static void main(String[] args) {
  System.out.println(new Lunes().m(15, 7, 'd'));
 }
}`;
  const result = analyzeProgram(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.treeAnalysis.status, 'success');
  const nodes = result.treeAnalysis.layout.nodes;
  const rtn = nodes.find(n => n.fullLabel === 'RTN (char)');
  assert.ok(rtn);
  assert.deepEqual(rtn.valueLines, ["'g'", 'VTC']);
  assert.ok(!nodes.some(n => n.fullLabel === '(char)'));
  const q = result.quadrupleAnalysis;
  assert.equal(q.validation.valid, true);
  assert.ok(!q.records.some(r => r.operator === 'CAST'));
  assert.equal(q.records.find(r => r.operator === 'RTN').result.display, "'g'");
  assert.equal(result.threeAddressAnalysis.status, 'success');
  assert.equal(result.threeAddressAnalysis.validation.valid, true);
  assert.equal(result.threeAddressAnalysis.instructions.filter(i => i.operator === 'RTN').length, 1);
});

test('solo el cast de toda la expresión se une a RTN', () => {
  const program = expression => `public class Demo {
 public double m() { return ${expression}; }
 public static void main(String[] args) { System.out.println(new Demo().m()); }
}`;
  const grouped = analyzeProgram(program('((int)(3.8+1))'));
  assert.ok(grouped.treeAnalysis.layout.nodes.some(n => n.fullLabel === 'RTN (int)'));
  assert.equal(grouped.quadrupleAnalysis.records.find(r => r.operator === 'RTN').result.display, '4.0');
  const inner = analyzeProgram(program('(int)3.8+1.5'));
  assert.ok(inner.treeAnalysis.layout.nodes.some(n => n.fullLabel === '(int)'));
  assert.ok(inner.treeAnalysis.layout.nodes.some(n => n.fullLabel === 'RTN'));
  assert.equal(inner.quadrupleAnalysis.records.find(r => r.operator === 'RTN').result.display, '4.5');
});
