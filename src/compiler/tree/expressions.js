import { prepareExpressionSource } from './source-context.js';
import { TreeConstructionError, stopTree } from './diagnostics.js';
import { createExpressionEngine, expressionLimits } from './expression-engine.js';
export { EXPRESSION_NODE_LIMIT, EXPRESSION_DEPTH_LIMIT } from './expression-engine.js';

/** Construye un inicializador aislado, sin contexto de llamadas ni evaluación. */
export function buildExpressionTree(source, symbolId, options = {}) {
  const limits = expressionLimits(options);
  if (typeof symbolId !== 'string') throw new TypeError('Se requiere el ID de la variable.');
  try {
    const context = prepareExpressionSource(source);
    const target = context.symbolsById.get(symbolId);
    if (!target) stopTree('invalid', 'TREE_UNKNOWN_SYMBOL', 'El ID solicitado no existe en la tabla de símbolos de este código.');
    if (!['local', 'field'].includes(target.kind)) {
      stopTree('unsupported', 'TREE_TARGET_KIND', 'Esta etapa desarrolla declaraciones de variables locales o campos.', context.tokens[target.declaration]);
    }
    const engine = createExpressionEngine(context, limits);
    const root = engine.expand(target, context.tokens[target.declaration], 0, target.declaration);
    return { status: 'success', tree: engine.build(root), diagnostics: [] };
  } catch (error) {
    if (!(error instanceof TreeConstructionError)) throw error;
    return { status: error.status, tree: null, diagnostics: [error.diagnostic] };
  }
}
