import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeQuadruples, validateOptimization } from '../src/compiler/optimization/index.js';
import { annotation, readLiteral, symbolicValue } from '../src/compiler/tree/values.js';
import { formatOptimizationTable } from '../src/ui/optimization/format.js';
import { formatRecord } from '../src/ui/quadruples/format.js';
import { analyzeProgram } from '../src/compiler/analysis.js';

const lit = text => ({kind:'literal', text});
const ref = number => ({kind:'register', number});
const sym = symbolId => ({kind:'symbol', symbolId});
const ext = text => ({kind:'external', text});
const call = (name, ...args) => ({kind:'externalCall', name, args});
const row = (number, left, operator, right, result) => ({number, nodeId:`n${number}`, contextId:'c1', left, operator, right,
  result:{status:'available', ...annotation(typeof result === 'string' ? readLiteral(result) : result)}});
const input = records => ({status:'success', validation:{valid:true}, records, closure:null});

function classroom() {
  return input([
    {...row(1, sym('ID3'), '=', ext('new Scanner()'), '0'), result:{status:'available', type:'object',value:'Scanner',display:'Scanner',token:'ID'}},
    row(2, sym('ID5'), '=', lit('1'), '1'),
    row(3, ref(1), '.', ext('nextLine()'), symbolicValue('String','x')),
    row(4, sym('ID4'), '=', ref(3), symbolicValue('String','x')),
    row(5, ref(2), '+', lit('1'), '2'),
    row(6, lit('7'), '*', lit('7'), '49'),
    row(7, ref(5), '*', lit('15'), '30'),
    row(8, lit('50'), '-', ref(6), '1'),
    row(9, ref(4), '.', call('substring',lit('0'),lit('4')), symbolicValue('String','y')),
    row(10, ref(7), '/', ref(8), '30'),
    row(11, ref(9), '.', ext('length()'), '4'),
    row(12, sym('ID7'), '=', ref(10), '30.0'),
    row(13, sym('ID8'), '=', ref(11), '4'),
    row(14, ref(12), '*', ref(13), '120.0'),
    row(15, sym('ID6'), 'RTN', ref(14), "'x'"),
    row(16, sym('ID1'), '.', ref(15), "'x'"),
    row(17, {kind:'main'}, 'SOUT', ref(16), "'x'"),
  ]);
}
const evidence = {constantAssignments:['q2','q4','q12','q13']};

test('ejemplo de clase: 17 originales, 7 finales, SE antes de FO y PCD en fila 13', () => {
  const source = classroom(), saved = structuredClone(source);
  const out = optimizeQuadruples(source,evidence);
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  const table = formatOptimizationTable(out);
  assert.deepEqual(table.map(r => r.optimization), ['—','PC','—','—','FOD','FO','FOD','FOD','—','SED','FO','PCD','PCD','FOD','—','—','—']);
  assert.deepEqual(out.events.map(e => e.affectedRecordIds), [['q5'],['q7'],['q8'],['q10'],['q10'],['q12'],['q13'],['q14'],['q14'],['q15']]);
  assert.deepEqual(table.map(r=>r.affected), ['3','5','4','9','7','8','10','10','11','12','13','14','14','15','16','17','—']);
  assert.deepEqual(out.records.map(formatRecord), [
    '1.- (ID3, =, new Scanner(), Scanner)',
    '2.- ([1], ., nextLine(), x)',
    '3.- (ID4, =, [2], x)',
    '4.- ([3], ., substring(0, 4), y)',
    "5.- (ID6, RTN, 120.0, 'x')",
    "6.- (ID1, ., [5], 'x')",
    "7.- (PMAIN, SOUT, [6], 'x')",
  ]);
  assert.equal(table[12].modified,'5.- (ID8, =, 4, 4) → ELIMINAR');
  assert.deepEqual(source,saved);
  const corrupted = structuredClone(out);
  corrupted.events.find(e=>e.recordId==='q13').technique='SE';
  assert.equal(validateOptimization(source,corrupted,evidence).valid,false);
});

test('length inferido exige substring con límites constantes, no su resultado anotado', () => {
  for (const [method, args] of [['substring',[lit('0'),ext('n')]], ['substring',[lit('0')]], ['substring',[lit('4'),lit('0')]], ['substring',[lit('-1'),lit('3')]], ['substring',[lit('0'),lit('4L')]], ['otro',[lit('0'),lit('4')]]]) {
    const source=classroom();
    source.records[8].right=call(method,...args);
    const out=optimizeQuadruples(source,evidence);
    assert.equal(out.status,'success');
    assert.ok(!out.events.some(e=>e.recordId==='q11'));
    assert.ok(!out.events.some(e=>e.recordId==='q13'));
  }
  const bad=classroom();
  bad.records[10].result={status:'available',...annotation(readLiteral('5'))};
  assert.equal(optimizeQuadruples(bad,evidence).status,'invalid');
});

test('flujo Java: substring simbólico conserva llamada, length es constante y llega al retorno', () => {
  const result=analyzeProgram(`public class Demo {
    public char valor(){
      String texto="ABCD"+Math.random();
      String parte=texto.substring(0,4);
      int n=parte.length();
      double v=30;
      return (char)(v*n);
    }
    public static void main(String[] args){System.out.println(new Demo().valor());}
  }`);
  const out=result.optimizationAnalysis;
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  assert.equal(out.validation.valid,true);
  assert.ok(out.events.some(e=>e.technique==='FO' && e.before.right.text==='length()'));
  assert.ok(out.records.some(r=>r.right.kind==='externalCall' && r.right.name==='substring'));
  assert.ok(out.records.some(r=>r.right.text==='random()'));
  const rtn=out.records.find(r=>r.operator==='RTN');
  assert.equal(rtn.right.text,'120.0');
  assert.equal(rtn.result.display,"'x'");
});

test('límites simplificados habilitan FOD de length con causa trazable', () => {
  const source=input([
    row(1,lit('2'),'+',lit('2'),'4'),
    row(2,ext('obj'),'.',ext('nextLine()'),symbolicValue('String','x')),
    row(3,ref(2),'.',call('substring',lit('0'),ref(1)),symbolicValue('String','y')),
    row(4,ref(3),'.',ext('length()'),'4'),
    row(5,{kind:'main'},'SOUT',ref(4),'4'),
  ]);
  const out=optimizeQuadruples(source);
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  assert.deepEqual(out.events.map(e=>[e.technique,e.derived,e.causedBy]),[['FO',false,[]],['FO',true,[1]]]);
  assert.equal(out.records.at(-1).right.text,'4');
});

test('validador rechaza cambiar SED a SE y FO cuando correspondía SE', () => {
  const source=classroom(), out=optimizeQuadruples(source,evidence);
  const changed=structuredClone(out);
  const event=changed.events.find(e=>e.recordId==='q10');
  event.derived=false; event.causedBy=[];
  assert.equal(validateOptimization(source,changed,evidence).valid,false);
  const folding=structuredClone(out);
  folding.events.find(e=>e.recordId==='q10').technique='FO';
  assert.equal(validateOptimization(source,folding,evidence).valid,false);
});
