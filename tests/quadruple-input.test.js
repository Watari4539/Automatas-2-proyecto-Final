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

test('rechaza referencias ocultas dentro de llamadas antes de optimizar',()=>{
 for (const call of ['f([1])','f([99])','f(g([1]))','f(2)']) {
   const r=analyzeQuadrupleInput(`1 (2, +, 3, 5)\n2 (Math, ., ${call}, 5)`);
   assert.match(r.inputError,/Línea 2:.*argumentos/);
   assert.equal(r.optimizationAnalysis,undefined);
 }
 assert.equal(analyzeQuadrupleInput('1 (Math, ., random(), 1.0)').optimizationAnalysis.status,'success');
});
test('no elimina definiciones usadas por ID ni acepta valores desconocidos',()=>{
 for(const s of ['1 (ID2, =, 2, 2)\n2 (ID2, +, 3, 5)','1 (ID99, +, 1, 123)','1 (x, +, 1, 123)','1 (ID2, RTN, ID99, 3)','1 (PMAIN, SOUT, desconocido, 3)']) {
   const r=analyzeQuadrupleInput(s);
   assert.match(r.inputError,/registro anterior/);
   assert.equal(r.optimizationAnalysis,undefined);
 }
 const valid=analyzeQuadrupleInput('1 (ID2, =, 2, 2)\n2 ([1], +, 3, 5)');
 assert.equal(valid.optimizationAnalysis.status,'success');
 assert.equal(valid.optimizationAnalysis.events.at(-1).replacement.value,5n);
});
test('admite mínimos enteros firmados sin admitir magnitudes fuera de rango',()=>{
 for(const [text,type] of [['-2147483648','int'],['-9223372036854775808L','long']]) {
   const r=analyzeQuadrupleInput(`1 (${text}, +, 0, ${text})`);
   assert.equal(r.inputError,undefined);
   assert.equal(r.optimizationAnalysis.events[0].replacement.type,type);
 }
 for(const text of ['-2147483649','-9223372036854775809L','2147483648','9223372036854775808L']) assert.ok(analyzeQuadrupleInput(`1 (${text}, +, 0, ${text})`).inputError);
});
