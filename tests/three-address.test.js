import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { buildQuadruples } from '../src/compiler/quadruples/index.js';
import { buildThreeAddress } from '../src/compiler/three-address/index.js';
const wrap = body => `public class A {public static void main(String[] args){${body}}}`;
function input(source) {
  const built = buildProgramTree(source);
  assert.ok(built.tree, JSON.stringify(built.diagnostics));
  const tree = evaluateTree(built.tree).tree;
  return { tree, quads: buildQuadruples(tree) };
}
function generate(body) {
  const { tree, quads } = input(wrap(body));
  return buildThreeAddress(tree, quads);
}

test('asignar libera T1, reutiliza el ID y SOUT reserva otro temporal', () => {
  const r = generate('int x=2+2; System.out.println(x*3);');
  assert.equal(r.status, 'success');
  const [sum, assign, product, output] = r.instructions;
  assert.equal(sum.destination, 'T1');
  assert.deepEqual(assign.value, { kind: 'temporary', name: 'T1', producer: 1 });
  assert.equal(product.destination, 'T1');
  assert.deepEqual(product.left, { kind: 'symbol', symbolId: assign.symbolId, producer: 2 });
  assert.equal(output.destination, 'T2');
  assert.equal(output.operator, 'SOUT');
  assert.equal(output.origin.treeOperationNumber, null);
  assert.deepEqual(r.closure.target, { kind: 'temporary', name: 'T2', producer: 4 });
  assert.ok(r.memory.temporaries.every(slot => slot.producer === null));
});
test('destino se elige antes de liberar y siempre tiene prioridad el menor libre', () => {
  const r = generate('System.out.println((2+2)*(3+3));');
  assert.equal(r.status, 'success');
  assert.deepEqual(r.instructions.map(i => i.destination), ['T1', 'T2', 'T3', 'T1']);
  assert.equal(r.instructions[2].left.name, 'T1');
  assert.equal(r.instructions[2].right.name, 'T2');
});
test('asignaciones entre IDs y literales no ocupan temporales', () => {
  const r = generate('int a=2; int b=a; System.out.println(b);');
  assert.equal(r.status, 'success');
  assert.deepEqual(r.instructions.map(i => i.kind), ['assignment', 'assignment', 'operation']);
  assert.equal(r.instructions[1].value.kind, 'symbol');
  assert.equal(r.instructions[1].value.producer, 1);
  assert.equal(r.instructions[2].destination, 'T1');
});
test('RTN tiene identidad de método, conserva contexto y consume un temporal distinto', () => {
  const {tree, quads} = input('public class A {public int f(){return 2+3;} public static void main(String[] args){System.out.println(new A().f());}}');
  const r = buildThreeAddress(tree, quads);
  assert.equal(r.status, 'success');
  const rtn = r.instructions.find(i => i.operator === 'RTN');
  assert.equal(rtn.left.kind, 'symbolIdentity');
  assert.equal(rtn.right.name, 'T1');
  assert.equal(rtn.destination, 'T2');
  assert.ok(rtn.origin.contextId);
});
test('tres temporales ocupados bloquean sin sobrescribir ni fingir cierre', () => {
  const r = generate('System.out.println(((1+2)+(3+4))+((5+6)+(7+8)));');
  assert.equal(r.status, 'blocked');
  assert.equal(r.diagnostics[0].code, 'THREE_NO_SCHEDULE');
  assert.equal(r.instructions.length, 3);
  assert.equal(r.closure, null);
  assert.deepEqual(r.memory.temporaries.map(s => s.producer), [1, 2, 3]);
  assert.equal(r.diagnostics[0].origin.treeOperationNumber, 4);
  assert.ok(r.instructions.every(i => i.kind !== 'pending'));
});
test('copias de un mismo ID con igual valor y contexto conservan ambos productores', () => {
  const r = generate('int x=2; System.out.println(x+x);');
  assert.equal(r.status, 'success');
  const addition = r.instructions.find(i => i.operator === '+');
  assert.equal(addition.left.symbolId, addition.right.symbolId);
  assert.notEqual(addition.left.producer, addition.right.producer);
  assert.ok(r.memory.variables.every(v => v.remainingUses === 0));
});
test('argumentos de métodos externos participan en consumo y liberación', () => {
  const r = generate('System.out.println("ABCDE".substring(1+1,4));');
  assert.equal(r.status, 'success');
  const call = r.instructions.find(i => i.operator === '.');
  assert.equal(call.destination, 'T2');
  assert.deepEqual(call.right.args[0], { kind: 'temporary', name: 'T1', producer: 1 });
  assert.equal(r.instructions.at(-1).destination, 'T1');
});
test('CAST no acordado se rechaza antes de emitir instrucciones', () => {
  const r = generate('System.out.println("a"+(char)81);');
  assert.equal(r.status, 'unsupported');
  assert.deepEqual(r.instructions, []);
  assert.equal(r.diagnostics[0].code, 'THREE_OPERATOR_UNSUPPORTED');
});
test('valores sin evaluar conservan estado parcial sin inventar resultados', () => {
  const r = generate('System.out.println(1/0);');
  assert.equal(r.status, 'partial');
  assert.ok(r.closure);
  assert.equal(r.diagnostics[0].code, 'THREE_PARTIAL_VALUES');
});
test('entrada dañada se rechaza y generaciones sucesivas no comparten estado', () => {
  const {tree, quads} = input(wrap('System.out.println(2+3);'));
  const before = structuredClone({tree, quads});
  const a = buildThreeAddress(tree, quads);
  assert.deepEqual({tree, quads}, before);
  assert.deepEqual(buildThreeAddress(tree, quads), a);
  assert.deepEqual(structuredClone(a), a);
  quads.records[0].right.text = '999';
  assert.equal(buildThreeAddress(tree, quads).status, 'invalid');
  assert.equal(buildThreeAddress(null, null).status, 'invalid');
});

function numericReplay(result) {
  const cells = new Map();
  const read = operand => operand.kind === 'literal' ? Number(operand.text)
    : operand.kind === 'symbol' ? cells.get(operand.symbolId)
    : operand.kind === 'temporary' ? cells.get(operand.name) : null;
  for (const instruction of result.instructions) {
    if (instruction.kind === 'pending') continue;
    if (instruction.kind === 'assignment') { cells.set(instruction.symbolId, read(instruction.value)); continue; }
    for (const input of [instruction.left, instruction.right]) if (input.kind === 'temporary') assert.notEqual(input.name, instruction.destination);
    const a = read(instruction.left), b = read(instruction.right);
    let value;
    switch (instruction.operator) {
      case '+': value = a + b; break;
      case '*': value = a * b; break;
      case 'SOUT': value = b; break;
      default: assert.fail('Operación no incluida en esta prueba numérica');
    }
    assert.ok(Number.isFinite(value));
    cells.set(instruction.destination, value);
  }
  return read(result.closure.target);
}

test('P4 permite guardar un resultado en un ID y retomar la operación saltada', () => {
  const r = generate('int a=1+2;int b=3+4;int c=5+6;int d=7+8;System.out.println((a+b)+(c+d));');
  assert.equal(r.status, 'success');
  assert.equal(r.planning.reordered, true);
  assert.deepEqual(r.instructions.filter(i => i.kind === 'pending').map(i => i.treeOperationNumber), [4]);
  const pendingAt = r.instructions.findIndex(i => i.kind === 'pending');
  assert.equal(r.instructions[pendingAt + 1].kind, 'assignment');
  assert.equal(r.instructions[pendingAt + 2].origin.treeOperationNumber, 4);
  assert.equal(r.instructions[pendingAt + 2].destination, 'T1');
  assert.equal(numericReplay(r), 36);
  assert.deepEqual(r.memory.pending, []);
});

test('retrocede desde un callejón sin salida y emite solo pendientes del plan elegido', () => {
  const r = generate('System.out.println((1+2)+((3+4)*(5+6)));');
  assert.equal(r.status, 'success');
  assert.deepEqual(r.memory.completed, [1,2,4,3,5,6]);
  assert.deepEqual(r.instructions.filter(i => i.kind === 'pending').map(i => i.treeOperationNumber), [3]);
  assert.equal(numericReplay(r), 80);
  assert.equal(new Set(r.memory.completed).size, r.memory.completed.length);
});

test('límite de búsqueda se diferencia de imposibilidad y no crea un cierre', () => {
  const {tree, quads} = input(wrap('System.out.println((1+2)+((3+4)*(5+6)));'));
  for (const options of [{ maxStates: 1 }, { maxSteps: 1 }, { maxSearchRecords: 1 }]) {
    const r = buildThreeAddress(tree, quads, options);
    assert.equal(r.status, 'limit');
    assert.equal(r.diagnostics[0].code, 'THREE_SEARCH_LIMIT');
    assert.equal(r.closure, null);
    assert.ok(r.instructions.every(i => i.kind !== 'pending'));
  }
  assert.throws(() => buildThreeAddress(tree, quads, {maxStates: 0}), RangeError);
});

test('no cambia el orden ni imprime Pn cuando la secuencia original cabe', () => {
  const r = generate('int a=2+2;System.out.println(a*3);');
  assert.equal(r.planning.reordered, false);
  assert.equal(r.planning.states, 0);
  assert.ok(r.instructions.every(i => i.kind !== 'pending'));
});
