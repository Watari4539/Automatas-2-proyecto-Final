import { wholePrimitiveCast } from './casts.js';
import { prepareExpressionSource } from './source-context.js';
import { createExpressionEngine, expressionLimits } from './expression-engine.js';
import { argumentRanges, readMethodStatements } from './methods.js';
import { TreeConstructionError, stopTree } from './diagnostics.js';

/** Árbol académico de una clase y un detonador principal; sin ejecutar ni evaluar Java. */
export function buildProgramTree(source, options = {}) {
  const limits = expressionLimits(options);
  try {
    const context = prepareExpressionSource(source);
    const { tokens, model, bindings, idsByKey } = context;
    const classes = model.symbols.filter(symbol => symbol.kind === 'class');
    if (classes.length !== 1) stopTree('unsupported', 'TREE_SINGLE_CLASS', 'El árbol requiere una sola clase.');
    const mainMethods = model.symbols.filter(symbol => symbol.isMain);
    if (mainMethods.length !== 1) stopTree('invalid', 'TREE_MAIN_REQUIRED', 'Se requiere un único public static void main(String[] ...).');
    const main = mainMethods[0];
    const classSymbol = classes[0];
    const frames = new Map();
    const bodies = new Map();
    const mainFrame = { id: 'context1', method: main, parent: null, arguments: new Map(), ancestry: [main.key], callAt: tokens[main.declaration] };
    frames.set('main', mainFrame);
    let engine;

    function body(method) {
      if (!bodies.has(method.key)) bodies.set(method.key, readMethodStatements(context, method));
      return bodies.get(method.key);
    }
    function invocation(method, args, at, caller, depth) {
      engine.checkDepth(depth, at);
      if (!caller) stopTree('unsupported', 'TREE_CALL_CONTEXT', 'No hay contexto para esta llamada.', at);
      if (caller.ancestry.includes(method.key)) {
        stopTree('unsupported', 'TREE_RECURSION', 'La llamada es recursiva; no se expandirá indefinidamente.', at);
      }
      if (method.params.length !== args.length) stopTree('invalid', 'TREE_ARGUMENT_COUNT', 'La cantidad de argumentos no corresponde al método.', at);
      const key = `${caller.id}:${at.index}`;
      if (!frames.has(key)) {
        frames.set(key, {
          id: `context${frames.size + 1}`, method, parent: caller, callAt: at,
          ancestry: [...caller.ancestry, method.key],
          arguments: new Map(method.params.map((parameter, index) => [parameter.key, { ...args[index], caller, useIndex: at.index }])),
        });
      }
      const frame = frames.get(key);
      const statements = body(method);
      const triggers = statements.filter(statement => statement.kind !== 'declaration');
      if (triggers.length !== 1 || triggers[0].kind !== 'return' || statements.at(-1) !== triggers[0]) {
        stopTree('unsupported', 'TREE_METHOD_TRIGGER', 'El método llamado debe terminar en un único return, precedido solo por declaraciones.', tokens[method.declaration]);
      }
      const trigger = triggers[0];
      if (trigger.start + 1 === trigger.end) stopTree('unsupported', 'TREE_RETURN_VALUE', 'Se necesita un return con expresión para desarrollar esta llamada.', tokens[trigger.start]);
      let start = trigger.start + 1, end = trigger.end, castType = null;
      while (tokens[start]?.lexeme === '(' && model.pairs.get(start) === end - 1) { start++; end--; }
      const cast = wholePrimitiveCast(tokens, model.pairs, start, end);
      if (cast) { start = cast.start; end = cast.end; castType = cast.castType; }
      const value = engine.expression(start, end, depth + 2, trigger.start, frame);
      const rtn = engine.addNode({ kind: 'return', text: 'RTN', children: [value], castType, source: tokens[trigger.start] }, frame);
      return engine.addNode({ kind: 'call', symbolId: idsByKey.get(method.key), children: [rtn], source: at }, frame);
    }

    const hooks = {
      calls: true,
      initializer(range) {
        return wholePrimitiveCast(tokens, model.pairs, range.start, range.end) ?? range;
      },
      parameter(symbol, at, depth, useIndex, frame) {
        const argument = frame?.arguments.get(symbol.key);
        if (!argument) stopTree('unsupported', 'TREE_PARAMETER_CONTEXT', 'No se dispone del argumento de este parámetro.', at);
        const value = engine.expression(argument.start, argument.end, depth + 1, argument.useIndex, argument.caller);
        return engine.addNode({ kind: 'reference', symbolId: idsByKey.get(symbol.key), children: [value], source: at }, frame);
      },
      atom(start, end, depth, useIndex, frame) {
        const at = tokens[start];
        if (at.lexeme === 'new' && tokens[start + 2]?.lexeme === '(' && model.pairs.get(start + 2) === end - 1) {
          const target = bindings.get(start + 1)?.symbol;
          if (target !== classSymbol || end !== start + 4) {
            stopTree('unsupported', 'TREE_CONSTRUCTOR_PENDING', 'Se admite crear la misma clase sin argumentos.', at);
          }
          if (model.symbols.some(symbol => symbol.constructor === true)) {
            stopTree('unsupported', 'TREE_CONSTRUCTOR_BODY', 'Los constructores con cuerpo propio aún requieren reglas de desarrollo.', at);
          }
          return engine.addNode({ kind: 'constructor', symbolId: idsByKey.get(target.key), source: tokens[start + 1] }, frame);
        }
        if (at.kind === 'identifier' && tokens[start + 1]?.lexeme === '(' && model.pairs.get(start + 1) === end - 1) {
          const args = argumentRanges(context, start + 1, end - 1);
          const binding = bindings.get(start);
          if (binding?.symbol?.kind === 'method' && !binding.symbol.isMain && !binding.symbol.constructor) {
            return invocation(binding.symbol, args, at, frame, depth);
          }
          if (binding?.external) {
            if (args.length && !['substring', 'charAt'].includes(at.lexeme)) stopTree('unsupported', 'TREE_EXTERNAL_ARGUMENTS', 'Esta llamada externa con argumentos todavía no tiene una regla de evaluación.', at);
            const children = args.map(arg => engine.expression(arg.start, arg.end, depth + 1, useIndex, frame));
            return engine.addNode({ kind: 'call', text: `${at.lexeme}()`, children, source: at }, frame);
          }
          stopTree('invalid', 'TREE_UNRESOLVED_CALL', `No se pudo resolver la llamada «${at.lexeme}»: revisa el tipo del receptor y la firma de sus argumentos.`, at);
        }
        return null;
      },
    };
    engine = createExpressionEngine(context, limits, hooks);
    const triggers = body(main).filter(statement => statement.kind !== 'declaration');
    if (triggers.length !== 1 || !['output', 'call'].includes(triggers[0].kind)) {
      stopTree('unsupported', 'TREE_MAIN_TRIGGER', 'El caso escolar requiere un único SOUT o una llamada como detonador de main.', tokens[main.declaration]);
    }
    const trigger = triggers[0];
    let child;
    if (trigger.kind === 'output') {
      const children = trigger.argument
        ? [engine.expression(trigger.argument.start, trigger.argument.end, 2, trigger.start, mainFrame)] : [];
      child = engine.addNode({ kind: 'output', text: 'SOUT', children, source: tokens[trigger.start] }, mainFrame);
    } else child = engine.expression(trigger.start, trigger.end, 1, trigger.start, mainFrame);
    const root = engine.addNode({ kind: 'entry', symbolId: idsByKey.get(classSymbol.key), children: [child], source: tokens[classSymbol.declaration] }, mainFrame);
    const tree = engine.build(root);
    tree.contexts = [...frames.values()].map(frame => ({
      id: frame.id,
      parentId: frame.parent?.id ?? null,
      methodSymbolId: idsByKey.get(frame.method.key) ?? null,
      isMain: frame.method.isMain === true,
      source: location(frame.callAt),
      arguments: frame.method.params.filter(parameter => frame.arguments.has(parameter.key)).map(parameter => {
        const argument = frame.arguments.get(parameter.key);
        return {
          parameterSymbolId: idsByKey.get(parameter.key),
          callerContextId: argument.caller.id,
          source: { ...location(tokens[argument.start]), end: tokens[argument.end - 1].end },
        };
      }),
    }));
    return { status: 'success', tree, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof TreeConstructionError)) throw error;
    return { status: error.status, tree: null, diagnostics: [error.diagnostic] };
  }
}

function location(at) {
  return { start: at.start, end: at.end, line: at.line, column: at.column };
}
