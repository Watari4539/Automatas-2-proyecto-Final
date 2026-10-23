import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProgram } from '../src/compiler/analysis.js';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { buildQuadruples } from '../src/compiler/quadruples/index.js';
import { buildThreeAddress } from '../src/compiler/three-address/index.js';
import { collectConstantAssignments } from '../src/compiler/optimization/evidence.js';
const source = 'public class Facil { public double a(){ float v=33+2; double z=(99+10)/1; return z*3+v; } public static void main(String[] args){ System.out.println(new Facil().a()); } }';
test('Generar integra optimización sin cambiar cuádruplos ni tres direcciones', () => {
  const result = analyzeProgram(source);
  const tree = evaluateTree(buildProgramTree(source).tree).tree;
  const quads = buildQuadruples(tree);
  assert.deepEqual(result.quadrupleAnalysis,quads);
  assert.deepEqual(result.threeAddressAnalysis,buildThreeAddress(tree,quads));
  assert.equal(result.optimizationAnalysis.status,'success');
  assert.equal(result.optimizationAnalysis.validation.valid,true);
  assert.equal(result.optimizationAnalysis.records.length,3);
  assert.equal(result.optimizationAnalysis.records[0].right.text,'362.0');
  assert.equal(result.optimizationAnalysis.rows.length,quads.records.length);
  assert.doesNotThrow(()=>structuredClone(result));
});
test('evidencia de PC rechaza escrituras aunque no estén en el retorno desarrollado', () => {
  const tree = evaluateTree(buildProgramTree(source).tree).tree;
  const quads = buildQuadruples(tree);
  const proof = collectConstantAssignments(source,tree,quads);
  assert.equal(proof.length,2);
  // Append a method that writes the field: exercise the same identity resolver
  // without relying on evaluated values or the displayed output.
  const fieldSource = 'public class Demo { int x=2; public void cambio(){x++;} public static void main(String[] args){System.out.println(new Demo().valor());} public int valor(){return x;} }';
  const built=buildProgramTree(fieldSource);
  if (built.tree) {
    const evaluated=evaluateTree(built.tree).tree;
    assert.deepEqual(collectConstantAssignments(fieldSource,evaluated,buildQuadruples(evaluated)),[]);
  } else assert.notEqual(built.status,'success');
});
test('errores y código vacío no muestran optimización anterior', () => {
  assert.equal(analyzeProgram('').optimizationAnalysis.status,'empty');
  const bad=analyzeProgram('public class X { public static void main(String[] a){ System.out.println(noExiste); } }');
  assert.notEqual(bad.optimizationAnalysis.status,'success');
  assert.deepEqual(bad.optimizationAnalysis.records,[]);
});
