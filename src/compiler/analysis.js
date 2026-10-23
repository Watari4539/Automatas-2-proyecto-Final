import { optimizeQuadruples } from './optimization/index.js';
import { collectConstantAssignments } from './optimization/evidence.js';
import { createEmptyOptimizationResult } from './optimization/model.js';
import { requestAnalysis } from './index.js';
import { buildProgramTree } from './tree/program.js';
import { evaluateTree } from './tree/evaluation.js';
import { buildQuadruples } from './quadruples/index.js';
import { buildThreeAddress } from './three-address/index.js';
import { createEmptyResult } from './three-address/model.js';
import { layoutTree } from '../ui/tree/layout.js';

/** Complete worker pipeline. Tree failures never discard the existing tables. */
export function analyzeProgram(source) {
  const result = requestAnalysis(source);
  result.treeAnalysis = { status: 'empty', layout: null, diagnostics: [] };
  result.quadrupleAnalysis = { status: 'empty', records: [], closure: null, diagnostics: [] };
  result.threeAddressAnalysis = createEmptyResult();
  result.optimizationAnalysis = { ...createEmptyOptimizationResult(), status: source.trim() ? 'blocked' : 'empty' };
  const threeUnavailable = (status, message) => ({ ...createEmptyResult(), status, diagnostics: [{ message }] });
  const unavailable = (status, message) => ({ status, records: [], closure: null, diagnostics: [{ message }] });
  if (!source.trim()) return result;
  if (result.diagnostics.some(item => ['SOURCE_LIMIT', 'DEPTH_LIMIT'].includes(item.code))) {
    result.treeAnalysis = { status: 'limit', layout: null, diagnostics: [{ message: 'El código supera los límites de análisis del proyecto.' }] };
    result.quadrupleAnalysis = unavailable('limit', 'El código supera los límites de análisis del proyecto.');
    result.threeAddressAnalysis = threeUnavailable('limit', 'El código supera los límites de análisis del proyecto.');
    return result;
  }
  try {
    const built = buildProgramTree(source);
    if (!built.tree) {
      result.treeAnalysis = { status: built.status, layout: null, diagnostics: built.diagnostics };
      result.quadrupleAnalysis = unavailable('blocked', 'No se pueden generar cuádruplos sin un árbol compatible. Consulta los avisos del árbol.');
      result.threeAddressAnalysis = threeUnavailable('blocked', 'No se pueden generar tres direcciones sin un árbol compatible. Consulta los avisos del árbol.');
      return result;
    }
    // Both pipelines must reference exactly the same symbol identities.
    const symbols = new Map(result.symbols.map(symbol => [symbol.id, symbol]));
    if (built.tree.symbols.some(symbol => {
      const expected = symbols.get(symbol.id);
      return !expected || expected.name !== symbol.name || expected.declaration !== symbol.declaration;
    })) throw new Error('Las identidades del árbol no coinciden con las tablas.');
    const evaluated = evaluateTree(built.tree);
    try {
      result.treeAnalysis = { status: evaluated.status, layout: layoutTree(evaluated.tree), diagnostics: evaluated.diagnostics };
    } catch {
      result.treeAnalysis = { status: 'failed', layout: null, diagnostics: [{ message: 'No se pudo distribuir el árbol en el plano.' }] };
    }
    try {
      result.quadrupleAnalysis = buildQuadruples(evaluated.tree);
    } catch {
      result.quadrupleAnalysis = unavailable('failed', 'No se pudieron generar los cuádruplos. Las tablas y el árbol siguen disponibles.');
    }
    try {
      if (result.quadrupleAnalysis.status === 'success' && !result.errors.length) {
        const constantAssignments = collectConstantAssignments(source, evaluated.tree, result.quadrupleAnalysis);
        result.optimizationAnalysis = optimizeQuadruples(result.quadrupleAnalysis, { constantAssignments });
      }
    } catch {
      result.optimizationAnalysis = { ...createEmptyOptimizationResult(), status: 'invalid', diagnostics: [{ message: 'No se pudo completar la optimización. Los cuádruplos originales siguen disponibles.' }] };
    }
    try {
      result.threeAddressAnalysis = result.quadrupleAnalysis.validation?.valid
        ? buildThreeAddress(evaluated.tree, result.quadrupleAnalysis)
        : threeUnavailable('blocked', 'No se pueden generar tres direcciones sin cuádruplos validados.');
    } catch {
      result.threeAddressAnalysis = threeUnavailable('failed', 'No se pudieron generar tres direcciones. Las demás salidas siguen disponibles.');
    }
  } catch {
    result.threeAddressAnalysis = threeUnavailable('blocked', 'No se pueden generar tres direcciones sin un árbol evaluado.');
    result.treeAnalysis = { status: 'failed', layout: null, diagnostics: [{ code: 'TREE_INTERNAL', message: 'No se pudo generar el árbol. Las tablas siguen disponibles.' }] };
    result.quadrupleAnalysis = unavailable('blocked', 'No se pueden generar cuádruplos sin un árbol evaluado.');
  }
  return result;
}
