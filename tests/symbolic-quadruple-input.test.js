import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQuadrupleInput } from '../src/compiler/optimization/input.js';
import { equivalentSymbolicText } from '../src/compiler/optimization/symbolic-input.js';
const source = `1.(Math, . , random(), X.0)
2.(15, *, [1], 15X.0)
3.(“LOL” , . , length(), 3)
4.(2.0 ,+, 3, 5.0)
5.([2], / [3], 5X.0)
6.([4] , /, 1, 5.0)
7.(ID2, = ,[5], 5X.0)
8.(ID3, = ,[6], 5.0)
9.([7], / , [8], X.0)
10.(ID4, RTN, [9], X.0)
11.(ID1, . , [10], X.0)
12.(PMAIN, SOUT, [11], X.0)`;
test('ejemplo completo con X.0, coeficientes y notación de clase', () => {
 const r=analyzeQuadrupleInput(source);
 assert.equal(r.inputError,undefined);
 assert.equal(r.optimizationAnalysis.status,'success');
 assert.equal(r.optimizationAnalysis.validation.valid,true);
 assert.equal(r.quadrupleAnalysis.records.at(-1).result.display,'X.0');
 assert.equal(r.optimizationAnalysis.records.at(-1).result.display,'X.0');
 assert.deepEqual(r.optimizationAnalysis.records.filter(r=>['.','RTN','SOUT'].includes(r.operator)).map(r=>r.operator),['.','RTN','.','SOUT']);
 assert.ok(r.optimizationAnalysis.events.some(e=>e.technique==='FO'));
 assert.ok(!r.optimizationAnalysis.events.some(e=>e.recordId==='q7'));
});
test('se rechazan resultados falsos y llamadas de String con longitud incorrecta', () => {
 for(const bad of [source.replace('15X.0','16X.0'),source.replace('5X.0','6X.0'),source.replace('length(), 3','length(), 4')])
  assert.ok(analyzeQuadrupleInput(bad).inputError);
});
test('equivalencia acotada no ejecuta texto ni acepta expresiones arbitrarias', () => {
 assert.ok(equivalentSymbolicText('X.0','15x/3/5'));
 assert.ok(equivalentSymbolicText('5X.0+2','(15x/3)+2'));
 for(const text of ['globalThis.x=1','x;alert(1)','x/x','NaN','Infinity','X.01'])
  assert.equal(equivalentSymbolicText(text,'x'),false,text);
 assert.equal(equivalentSymbolicText('6X.0','15x/3'),false);
});
