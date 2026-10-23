import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProgram } from '../src/compiler/analysis.js';
import { temporaryOccupancy, formatOccupancy } from '../src/ui/three-address/occupancy.js';
const generate = body => analyzeProgram(`public class Demo { public static void main(String[] args) { ${body} } }`).threeAddressAnalysis;
test('ocupación conserva Pn, libera asignaciones y consume el cierre sin cambiar instrucciones', () => {
  const data = generate('int a=1+2;int b=3+4;int c=5+6;int d=7+8;System.out.println((a+b)+(c+d));');
  const original = structuredClone(data);
  const state = temporaryOccupancy(data.instructions, data.closure);
  assert.deepEqual(state.rows.slice(0,6), [['T1'],['T1','T2'],['T1','T2','T3'],['T1','T2','T3'],['T2','T3'],['T1','T2','T3']]);
  assert.deepEqual(state.rows.at(-1), ['T1']);
  assert.deepEqual(state.closure, []);
  assert.deepEqual(data, original);
  assert.equal(formatOccupancy(state.rows[2]), 'todos');
  assert.equal(formatOccupancy(state.closure), 'ninguno');
});
test('RTN y SOUT liberan su entrada y ocupan su destino', () => {
  const data = analyzeProgram('public class Demo { public int m(){return 2+3;} public static void main(String[] args){System.out.println(new Demo().m());} }').threeAddressAnalysis;
  const state = temporaryOccupancy(data.instructions, data.closure);
  for (const [index,row] of data.instructions.entries()) if (['RTN','SOUT'].includes(row.operator)) assert.deepEqual(state.rows[index], [row.destination]);
});
test('conserva un productor con varios usos y lee temporales de argumentos externos', () => {
  const t = {kind:'temporary',name:'T1',producer:1};
  const data = [
    {kind:'operation',destination:'T1',origin:{quadrupleNumber:1}},
    {kind:'operation',destination:'T2',left:t,origin:{quadrupleNumber:2}},
    {kind:'operation',destination:'T3',right:{kind:'externalCall',args:[t]},origin:{quadrupleNumber:3}},
  ];
  assert.deepEqual(temporaryOccupancy(data, {target:{kind:'temporary',name:'T3',producer:3}}).rows, [['T1'],['T1'],['T3']]);
});
