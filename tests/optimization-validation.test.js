import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeQuadruples, validateOptimization } from '../src/compiler/optimization/index.js';
import { readLiteral, binaryValue, annotation } from '../src/compiler/tree/values.js';
const lit = text => ({kind: 'literal', text});
const ref = number => ({kind: 'register', number});
const ext = text => ({kind: 'external', text});
const row = (number, left, operator, right, result) => ({number, nodeId: `n${number}`, contextId: 'c', left, operator, right, result: {status: 'available', ...annotation(typeof result === 'string' ? readLiteral(result) : result)}});
const input = records => ({status: 'success', validation: {valid: true}, records, closure: {classSymbolId: 'ID1', entry: 'PMAIN', target: ref(records.length)}});
const sample = () => input([row(1,lit('2'),'+',lit('3'),'5'), row(2,{kind:'main'},'SOUT',ref(1),'5')]);

test('detecta manipulación de salida, originales, mapa, tabla, historial y cierre', () => {
  const source = sample(), out = optimizeQuadruples(source);
  assert.equal(out.validation.valid, true);
  for (const corrupt of [
    o => {o.records[0].right = ref(99);},
    o => {o.originals[0].operator = '-';},
    o => {o.numberMap.q2 = 2;},
    o => {o.rows[0].events = [];},
    o => {o.events[0].replacement.value = 6n;},
    o => {o.events[0].affectedRecordIds = [];},
    o => {o.events[0].before.number = 3;},
    o => {o.closure.target = ref(2);},
    o => {o.events[0].derived = true; o.events[0].causedBy = [99];},
  ]) {
    const changed = structuredClone(out); corrupt(changed);
    assert.equal(validateOptimization(source, changed).valid, false);
  }
});

test('equivalencia tipada de operaciones constantes, flotantes, char y cadenas', () => {
  for (const [a,b] of [['35','10'],['2.5','3'],['2.5f','3'],["'A'",'2'],['"hola"','"0"']]) {
    for (const op of (a.startsWith('"') ? ['+'] : ['+','-','*','/'])) {
      const result = binaryValue(op, readLiteral(a), readLiteral(b));
      const source = input([row(1,lit(a),op,lit(b),result)]);
      const out = optimizeQuadruples(source);
      assert.equal(out.status,'success', `${a} ${op} ${b}`);
      assert.equal(out.validation.valid,true);
      assert.equal(out.closure.target.type,result.type);
      assert.ok(Object.is(out.closure.target.value,result.value));
    }
  }
});

test('muchas cadenas de dependencias conservan el resultado y terminan sin referencias colgantes', () => {
  for (let seed = 1; seed <= 30; seed++) {
    let value = readLiteral(String(seed)); const records = [];
    for (let i = 1; i <= 12; i++) {
      const op = i % 2 ? '+' : '-';
      const right = readLiteral(String(i));
      value = binaryValue(op,value,right);
      records.push(row(i,i === 1 ? lit(String(seed)) : ref(i-1),op,lit(String(i)),value));
    }
    const out = optimizeQuadruples(input(records));
    assert.equal(out.status,'success');
    assert.equal(out.events.length,12);
    assert.equal(out.records.length,0);
    assert.equal(out.closure.target.value,value.value);
  }
});

test('no aplica identidades de números a strings ni elimina promociones', () => {
  const out = optimizeQuadruples(input([row(1,lit('"x"'),'+',lit('0'),'"x0"')]));
  assert.equal(out.events[0].technique,'FO');
  assert.equal(out.closure.target.value,'x0');
  const promoted = optimizeQuadruples(input([row(1,lit('2'),'*',lit('1.0'),'2.0')]));
  assert.equal(promoted.events[0].technique,'FO');
  assert.equal(promoted.closure.target.type,'double');
});

test('preserva llamadas repetidas, operadores desconocidos y ámbitos distintos', () => {
  const source = input([
    row(1,ext('Math'),'.',ext('random()'),'1.0'),
    row(2,ext('Math'),'.',ext('random()'),'1.0'),
    row(3,ref(1),'*',lit('2'),'2.0'),
    {...row(4,ref(1),'*',lit('2'),'2.0'), contextId:'otro'},
    row(5,lit('8'),'%',lit('3'),'2'),
  ]);
  const out = optimizeQuadruples(source);
  assert.equal(out.records.length,5);
  assert.equal(out.events.length,0);
});

test('propaga en argumentos anidados sin eliminar el acceso externo', () => {
  const out = optimizeQuadruples(input([
    row(1,lit('2'),'+',lit('3'),'5'),
    row(2,ext('obj'),'.',{kind:'externalCall', name:'f',args:[ref(1)]},'5'),
  ]));
  assert.equal(out.validation.valid,true);
  assert.equal(out.records[0].right.args[0].text,'5');
});

test('rechaza metadatos numéricos contradictorios y entradas mal formadas', () => {
  assert.equal(optimizeQuadruples(input([row(1,lit('2'),'+',lit('3'),'6')])).status,'invalid');
  assert.equal(optimizeQuadruples({status:'success',validation:{valid:true}}).status,'invalid');
  assert.equal(optimizeQuadruples(sample(),{maxRecords:NaN}).status,'invalid');
  assert.equal(validateOptimization(null,null).valid,false);
});
