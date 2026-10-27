import { wholePrimitiveCast } from './casts.js';
import { createTreeBuilder } from './model.js';
import { initializerRange } from './source-context.js';
import { stopTree } from './diagnostics.js';

const LEVELS = new Map([['+', 1], ['-', 1], ['*', 2], ['/', 2], ['.', 3]]);
const LITERALS = new Set(['VTE', 'VTD', 'VTF', 'VTC', 'VTS', 'VTB']);
export const EXPRESSION_NODE_LIMIT = 5_000;
export const EXPRESSION_DEPTH_LIMIT = 128;

export function expressionLimits({ maxNodes = EXPRESSION_NODE_LIMIT, maxDepth = EXPRESSION_DEPTH_LIMIT } = {}) {
  for (const [name, value, ceiling] of [
    ['maxNodes', maxNodes, EXPRESSION_NODE_LIMIT],
    ['maxDepth', maxDepth, EXPRESSION_DEPTH_LIMIT],
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
      throw new RangeError(`${name} debe ser un entero entre 1 y ${ceiling}.`);
    }
  }
  return { maxNodes, maxDepth };
}

/** Motor compartido: el programa aporta el contexto de llamadas mediante hooks. */
export function createExpressionEngine(context, { maxNodes, maxDepth }, hooks = {}) {
  const { tokens, model, bindings, table, idsByKey, writes } = context;
  const builder = createTreeBuilder(table.symbols);
  const active = new Set();
  let count = 0;

  function checkDepth(depth, at) {
    if (depth > maxDepth) stopTree('limit', 'TREE_EXPANSION_DEPTH', `El desarrollo supera ${maxDepth} niveles.`, at);
  }
  function addNode(node, frame = null) {
    if (count >= maxNodes) stopTree('limit', 'TREE_NODE_LIMIT', `El desarrollo supera ${maxNodes} nodos.`, node.source);
    count++;
    const symbol = context.symbolsById.get(node.symbolId);
    const type = symbol?.type ?? (node.kind === 'return' ? frame?.method.type : null);
    return builder.addNode({
      ...node, contextId: frame?.id ?? null,
      declaredType: type ? type.name + '[]'.repeat(type.dimensions ?? 0) : null,
      constantVariable: node.kind === 'assignment' && tokens[symbol?.declaration - 2]?.lexeme === 'final',
    });
  }
  function expand(symbol, occurrence, depth, useIndex, frame = null) {
    checkDepth(depth, occurrence);
    const identity = `${frame?.id ?? 'expression'}:${symbol.key}`;
    if (active.has(identity)) {
      stopTree('invalid', 'TREE_CIRCULAR_DEFINITION', 'La definición vuelve a depender de una variable que ya se está desarrollando.', occurrence);
    }
    const changed = (writes.get(symbol.key) ?? []).find(write =>
      symbol.kind === 'field' || (write.index > symbol.declaration && write.index < useIndex));
    if (changed) {
      stopTree('unsupported', 'TREE_REASSIGNMENT_PENDING', 'La variable tiene otra escritura; falta acordar qué asignación desarrollar.', changed);
    }
    active.add(identity);
    try {
      if (symbol.kind === 'parameter' && hooks.parameter) {
        return hooks.parameter(symbol, occurrence, depth, useIndex, frame);
      }
      let range = initializerRange(context, symbol);
      if (hooks.initializer) range = hooks.initializer(range);
      const child = expression(range.start, range.end, depth + 1, useIndex, frame);
      return addNode({ kind: 'assignment', symbolId: idsByKey.get(symbol.key), children: [child], source: occurrence, castType: range.castType ?? null }, frame);
    } finally {
      active.delete(identity);
    }
  }

  function expression(start, end, depth, useIndex, frame = null) {
    checkDepth(depth, tokens[start]);
    // Un grupo que abarca toda la subexpresión no divide sus operandos.
    while (tokens[start]?.lexeme === '(' && model.pairs.get(start) === end - 1) { start++; end--; }
    if (start >= end) stopTree('invalid', 'TREE_EXPECTED_EXPRESSION', 'Se esperaba una expresión con un valor u operandos.', tokens[start] ?? tokens[end - 1]);

    const cast = hooks.calls && wholePrimitiveCast(tokens, model.pairs, start, end);
    if (cast) {
      const child = expression(cast.start, cast.end, depth + 1, useIndex, frame);
      return addNode({ kind: 'conversion', text: cast.castType, children: [child], source: tokens[start] }, frame);
    }

    const custom = hooks.atom?.(start, end, depth, useIndex, frame);
    if (custom !== undefined && custom !== null) return custom;

    for (let index = start; index < end; index++) {
      const token = tokens[index];
      if (hooks.calls && token.lexeme === 'new' && tokens[index + 2]?.lexeme === '(') {
        index = model.pairs.get(index + 2);
        continue;
      }
      if (hooks.calls && token.lexeme === '(' && tokens[index + 1]?.token === 'TD' && tokens[index + 2]?.lexeme === ')') { index += 2; continue; }
      if (token.token === 'TD' || token.lexeme === 'new' || ['[', ']'].includes(token.lexeme)) {
        stopTree('unsupported', 'TREE_EXPRESSION_FORM_PENDING', 'Las conversiones, objetos y arreglos requieren reglas de una etapa posterior.', token);
      }
      if ((token.kind === 'identifier' || token.lexeme === 'String') && tokens[index + 1]?.lexeme === '(') {
        if (hooks.calls) { index = model.pairs.get(index + 1); continue; }
        stopTree('unsupported', 'TREE_CALL_PENDING', 'Las llamadas y sus parámetros se desarrollarán en la siguiente etapa.', token);
      }
      if (token.kind === 'symbol' && !LEVELS.has(token.lexeme) && !['(', ')'].includes(token.lexeme)) {
        stopTree('unsupported', 'TREE_OPERATOR_PENDING', `No se ha acordado el desarrollo de «${token.lexeme}» en expresiones del árbol.`, token);
      }
      if (['+', '-'].includes(token.lexeme) && (index === start || LEVELS.has(tokens[index - 1]?.lexeme) || tokens[index - 1]?.lexeme === '(')) {
        stopTree('unsupported', 'TREE_UNARY_PENDING', 'Los operadores unarios necesitan su propia regla de desarrollo.', token);
      }
    }

    let nesting = 0;
    let chosen = null;
    for (let index = end - 1; index >= start; index--) {
      const token = tokens[index];
      if (token.kind !== 'symbol') continue;
      if (token.lexeme === ')') {
        const open = model.pairs.get(index);
        if (hooks.calls && open > start && tokens[open - 1]?.kind === 'identifier') {
          index = open - 1; // Los argumentos pertenecen a la llamada, no al operador exterior.
          continue;
        }
        nesting++; continue;
      }
      if (token.lexeme === '(') { nesting--; continue; }
      const base = LEVELS.get(token.lexeme);
      // Cada par de paréntesis suma dos niveles, según la regla del curso.
      if (base !== undefined && (!chosen || base + 2 * nesting < chosen.level)) {
        chosen = { index, level: base + 2 * nesting, nesting };
      }
    }
    if (chosen) {
      const operator = tokens[chosen.index];
      if (chosen.nesting > 0) {
        stopTree('unsupported', 'TREE_PARENTHESES_RULE_PENDING', 'La prioridad seleccionaría un operador dentro de un grupo; falta la regla acordada para resolver este caso.', operator);
      }
      if (chosen.index === start || chosen.index === end - 1) {
        stopTree('invalid', 'TREE_MISSING_OPERAND', 'El operador binario necesita un operando a cada lado.', operator);
      }
      if (operator.lexeme === '.' && !hooks.calls) {
        // El contexto de objetos del programador pertenece al paso de llamadas.
        for (let index = start; index < end; index++) {
          const binding = bindings.get(index);
          if (binding?.symbol) stopTree('unsupported', 'TREE_OBJECT_CONTEXT_PENDING', 'Este acceso requiere resolver el contexto de un objeto del programador.', tokens[index]);
        }
      }
      const left = expression(start, chosen.index, depth + 1, useIndex, frame);
      const right = expression(chosen.index + 1, end, depth + 1, useIndex, frame);
      return addNode({ kind: 'operator', text: operator.lexeme, children: [left, right], source: operator }, frame);
    }

    const at = tokens[start];
    if (end - start !== 1) {
      stopTree('invalid', 'TREE_UNRECOGNIZED_EXPRESSION', 'Los elementos de esta expresión no forman un valor o una operación admitida.', at);
    }
    if (LITERALS.has(at.token)) return addNode({ kind: 'literal', text: at.lexeme, source: at }, frame);
    const binding = bindings.get(start);
    if (binding?.symbol) return expand(binding.symbol, at, depth + 1, useIndex, frame);
    if (binding?.external) return addNode({ kind: 'external', text: at.lexeme, source: at }, frame);
    if (at.kind === 'identifier') {
      stopTree('invalid', 'TREE_UNRESOLVED_REFERENCE', 'No se encontró una declaración inequívoca para esta referencia.', at);
    }
    stopTree('unsupported', 'TREE_VALUE_PENDING', 'Este elemento aún no tiene regla de desarrollo como valor del árbol.', at);
  }
  return { expression, expand, addNode, checkDepth, build: builder.build };
}
