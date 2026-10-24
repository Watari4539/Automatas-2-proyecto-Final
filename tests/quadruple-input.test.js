import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQuadrupleInput } from '../src/compiler/optimization/input.js';
const source=`1.- (99, +, 10, 109)
2.- ([1], /, 1, 109)
3.- (ID4, =, [2], 109.0)
4.- (33, +, 2, 35)
5.- (ID3, =, [4], 35.0f)
6.- ([3], *, 3, 327.0)
7.- ([6], +, [5], 362.0)
8.- (ID2, RTN, [7], 362.0)
9.- (ID1, ., [8], 362.0)
10.- (PMAIN, SOUT, [9], 362.0)
ID1 PMAIN → [10]`;
test('entrada directa reproduce ejemplo y preserva cierre',()=>{
 const out=analyzeQuadrupleInput(source);
 assert.equal(out.inputError,undefined);
 assert.equal(out.optimizationAnalysis.records.length,3);
 assert.equal(out.optimizationAnalysis.records[0].right.text,'362.0');
 assert.equal(out.optimizationAnalysis.closure.target.number,3);
});
test('comas en cadenas, valores negativos y cierre opcional',()=>{
 assert.equal(analyzeQuadrupleInput('1 ("a,b", +, "c", "a,bc")').optimizationAnalysis.records.length,0);
 assert.equal(analyzeQuadrupleInput('1. (-2, +, 1, -1)').optimizationAnalysis.closure,null);
});
test('errores útiles y reasignaciones conservadoras',()=>{
 for(const source of ['1 (2, +, 3, 6)','1 ([2], +, 1, 4)','2 (1, +, 2, 3)','1 (2, +, 3)','1 (2, +, 3, x)']) assert.match(analyzeQuadrupleInput(source).inputError,/Línea 1/);
 const out=analyzeQuadrupleInput('1 (ID2, =, 2, 2)\n2 (ID2, =, 3, 3)');
 assert.equal(out.optimizationAnalysis.records.length,2);
});
