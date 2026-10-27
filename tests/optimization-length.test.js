import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQuadrupleInput } from '../src/compiler/optimization/input.js';
import { analyzeProgram } from '../src/compiler/analysis.js';

test('FO elimina length de una cadena literal y sustituye sus referencias', () => {
 for (const [text, length] of [['LOL',3],['',0],['😀',2]]) {
  const r=analyzeQuadrupleInput(`1. ("${text}", ., length(), ${length})\n2. (PMAIN, SOUT, [1], ${length})`);
  assert.equal(r.inputError,undefined);
  const o=r.optimizationAnalysis;
  assert.equal(o.validation.valid,true);
  assert.equal(o.records.length,1);
  assert.equal(o.records[0].right.text,String(length));
  assert.equal(o.events[0].technique,'FO');
  assert.equal(o.events[0].derived,false);
  assert.deepEqual(o.events[0].affectedRecordIds,['q2']);
 }
});
test('PC habilita FOD de length y FO habilita FOD de cadena concatenada', () => {
 for (const expression of ['String s="LOL"; System.out.println(s.length());','System.out.println(("LO"+"L").length());']) {
  const r=analyzeProgram(`public class Demo {public static void main(String[] args){${expression}}}`);
  assert.equal(r.optimizationAnalysis.status,'success');
  assert.ok(r.optimizationAnalysis.events.some(e=>e.technique==='FO' && e.derived));
  assert.equal(r.optimizationAnalysis.records.at(-1).right.text,'3');
 }
});
test('length de cadena simbólica y Math.random siguen protegidos', () => {
 const r=analyzeProgram('public class Demo {public static void main(String[] args){String s="LOL"+Math.random();System.out.println(s.length());}}');
 assert.equal(r.optimizationAnalysis.status,'success');
 assert.equal(r.optimizationAnalysis.events.filter(e=>e.before.operator==='.').length,0);
});
