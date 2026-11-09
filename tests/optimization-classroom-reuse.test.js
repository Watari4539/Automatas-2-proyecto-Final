import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeQuadruples, validateOptimization } from '../src/compiler/optimization/index.js';
import { annotation, readLiteral, symbolicValue, binaryValue, convertValue } from '../src/compiler/tree/values.js';
import { formatOptimizationTable } from '../src/ui/optimization/format.js';
import { formatOperand } from '../src/ui/quadruples/format.js';
import { analyzeProgram } from '../src/compiler/analysis.js';

const lit=text=>({kind:'literal',text});
const ref=number=>({kind:'register',number});
const sym=symbolId=>({kind:'symbol',symbolId});
const ext=text=>({kind:'external',text});
const main={kind:'main'};
function fixture() {
  const records=[];
  const value=o=>o.kind==='literal'?(o.type?o:readLiteral(o.text)):records[o.number-1].result;
  function add(left,operator,right,result=null) {
    const number=records.length+1;
    if (!result) result=['+','-','*','/'].includes(operator)?binaryValue(operator,value(left),value(right)):value(right);
    if (typeof result==='string') result=readLiteral(result);
    records.push({number,nodeId:`n${number}`,contextId:'c1',left,operator,right,result:{status:'available',...annotation(result)}});
  }
  return {add,records,value,input:()=>({status:'success',validation:{valid:true},records,closure:{classSymbolId:'ID1',entry:'PMAIN',target:ref(records.length)}})};
}
function firstCase(y=null) {
  const f=fixture(), a=f.add;
  a(lit('99'),'+',lit('1'));
  a(sym('ID6'),'=',ref(1));
  a(sym('ID3'),'=',lit("'A'"),'65');
  a(sym('ID4'),'=',ref(2));
  a(ref(4),'*',ref(3));
  a(lit('3'),'/',lit('2'));
  a(lit('6'),'*',lit('3'));
  a(ref(7),'-',ref(6));
  a(sym('ID8'),'=',ref(8));
  a(ext('IN'),'.',ext('nextLine()'),symbolicValue('String','x'));
  a(ref(10),'.',ext('length()'),y===null?symbolicValue('int','y'):readLiteral(String(y)));
  a(sym('ID7'),'=',ref(11));
  a(ref(12),'*',lit('18'));
  a(ref(13),'/',lit('5'));
  a(sym('ID9'),'=',lit('3.1416f'));
  a(ref(15),'+',ref(14));
  a(sym('ID10'),'=',ref(16));
  a(ref(17),'+',ref(9));
  a(ref(18),'-',ref(5));
  a(sym('ID2'),'RTN',ref(19),convertValue(f.value(ref(19)),'int','cast'));
  a(sym('ID1'),'.',ref(20));
  a(main,'SOUT',ref(21));
  return f.input();
}
function secondCase() {
  const f=fixture(),a=f.add;
  const scanner={type:'object',value:'Scanner',token:'ID',display:'Scanner'};
  // Object results have no scalar formatter.
  for(let i=0;i<2;i++) f.records.push({number:i+1,nodeId:`n${i+1}`,contextId:'c1',left:sym('ID3'),operator:'=',right:ext('new Scanner()'),result:{status:'available',...scanner}});
  a(ref(1),'.',ext('nextLine()'),symbolicValue('String','x'));
  a(ref(2),'.',ext('nextLine()'),symbolicValue('String','x'));
  a(ref(3),'.',ext('length()'),symbolicValue('int','y'));
  a(ref(4),'.',ext('length()'),symbolicValue('int','y'));
  a(sym('ID6'),'=',ref(5));
  a(sym('ID6'),'=',ref(6));
  a(sym('ID8'),'=',lit('3.1416f'));
  a(lit('18'),'/',lit('5'));
  a(ref(7),'*',ref(10));
  a(ref(8),'*',lit('3'));
  a(lit('3'),'/',lit('2'));
  a(ref(9),'+',ref(11));
  a(ref(12),'-',ref(13));
  a(sym('ID9'),'=',ref(14));
  a(sym('ID7'),'=',ref(15));
  a(ref(16),'+',ref(17));
  a(sym('ID4'),'RTN',ref(18),convertValue(f.value(ref(18)),'int','cast'));
  a(sym('ID2'),'.',ref(19));
  a(main,'SOUT',ref(20));
  return f.input();
}
const options1={constantAssignments:['q2','q3','q4','q9','q12','q15','q17']};
const options2={constantAssignments:['q7','q8','q9','q16','q17'],equivalentRecords:[['q1','q2'],['q3','q4'],['q7','q8']]};
const tuples=out=>out.records.map(r=>[r.number,formatOperand(r.left),r.operator,formatOperand(r.right)]);

test('primera hoja: 22 originales a 12 finales, conversiones y valores desconocidos',()=>{
  const source=firstCase(), saved=structuredClone(source);
  const out=optimizeQuadruples(source,options1);
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  assert.deepEqual(formatOptimizationTable(out).map(r=>r.optimization),['FO','PCD','PC','PCD','FOD','FO','FO','FOD','PCD','—','—','—','—','—','PC','—','—','—','—','—','—','—']);
  assert.deepEqual(tuples(out),[
    [1,'IN','.','nextLine()'],[2,'[1]','.','length()'],[3,'ID7','=','[2]'],
    [4,'[3]','*','18'],[5,'[4]','/','5'],[6,'3.1416f','+','[5]'],[7,'ID10','=','[6]'],
    [8,'[7]','+','17'],[9,'[8]','-','6500'],[10,'ID2','RTN','[9]'],[11,'ID1','.','[10]'],[12,'PMAIN','SOUT','[11]'],
  ]);
  assert.equal(out.events.find(e=>e.recordId==='q3').replacement.value,65n);
  assert.equal(out.events.find(e=>e.recordId==='q15').replacement.type,'float');
  assert.equal(out.closure.target.number,12);
  assert.deepEqual(source,saved);
  // The handwritten 3y is not equivalent to (18*y)/5 with integer division.
  const concrete=firstCase(2);
  assert.equal(concrete.records[13].result.value,7n);
  assert.equal(concrete.records[19].result.value,-6472n);
  const concreteOut=optimizeQuadruples(concrete,options1);
  assert.equal(concreteOut.status,'success');
  assert.equal(concreteOut.records.length,12); // evaluated data is not proof of constancy
});

test('segunda hoja: RS y RSD en cadena, 21 originales a 13 finales',()=>{
  const source=secondCase(),saved=structuredClone(source);
  const out=optimizeQuadruples(source,options2);
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  assert.deepEqual(formatOptimizationTable(out).map(r=>r.optimization),['—','RS','—','RSD','—','RSD','—','RSD','PC','FO','—','RSD','FO','—','—','—','—','—','—','—','—']);
  assert.deepEqual(tuples(out),[
    [1,'ID3','=','new Scanner()'],[2,'[1]','.','nextLine()'],[3,'[2]','.','length()'],[4,'ID6','=','[3]'],
    [5,'[4]','*','3'],[6,'3.1416f','+','[5]'],[7,'[5]','-','1'],[8,'ID9','=','[6]'],[9,'ID7','=','[7]'],
    [10,'[8]','+','[9]'],[11,'ID4','RTN','[10]'],[12,'ID2','.','[11]'],[13,'PMAIN','SOUT','[12]'],
  ]);
  assert.equal(out.closure.target.number,13);
  assert.deepEqual(source,saved);
  assert.equal(validateOptimization(source,out,{constantAssignments:options2.constantAssignments}).valid,false);
  const bad=structuredClone(out);
  bad.events.find(e=>e.recordId==='q12').derived=false;
  bad.events.find(e=>e.recordId==='q12').causedBy=[];
  assert.equal(validateOptimization(source,bad,options2).valid,false);
});

test('sin evidencia de ramas repetidas no fusiona construcciones ni lecturas de Scanner',()=>{
  const out=optimizeQuadruples(secondCase(),{constantAssignments:options2.constantAssignments});
  assert.equal(out.status,'success');
  assert.ok(!out.events.some(e=>['q2','q4','q6','q8','q12'].includes(e.recordId)));
});

test('Java: reutiliza una inicialización aleatoria duplicada, conserva llamadas distintas',()=>{
  for (const [body,count] of [
    ['double a=Math.random();System.out.println(a+a);',1],
    ['System.out.println(Math.random()+Math.random());',2],
    ['double a=Math.random();double b=Math.random();System.out.println(a+b);',2],
  ]) {
    const result=analyzeProgram(`public class Demo {public static void main(String[] args){${body}}}`);
    const out=result.optimizationAnalysis;
    assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
    assert.equal(out.records.filter(r=>r.right.text==='random()').length,count);
  }
});

test('length repetido de la misma cadena desconocida se reutiliza, no se calcula',()=>{
  const r=analyzeProgram('public class Demo {public static void main(String[] args){String s="hola"+Math.random();System.out.println(s.length()+s.length());}}');
  const out=r.optimizationAnalysis;
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  assert.equal(out.records.filter(r=>r.right.text==='length()').length,1);
  assert.ok(out.events.some(e=>e.technique==='RS' && e.before.right.text==='length()'));
  assert.ok(!out.events.some(e=>e.technique==='FO' && e.before.right.text==='length()'));
});

test('llamadas al mismo método mantienen contextos separados',()=>{
  const r=analyzeProgram(`public class Demo {
    public double m(){double a=Math.random();return a+a;}
    public static void main(String[] args){System.out.println(new Demo().m()+new Demo().m());}
  }`);
  const out=r.optimizationAnalysis;
  assert.equal(out.status,'success',JSON.stringify(out.diagnostics));
  assert.equal(out.records.filter(r=>r.right.text==='random()').length,2);
  assert.equal(out.records.filter(r=>r.operator==='RTN').length,2);
});

test('RS distingue signo del cero, tipos y orden de operandos',()=>{
  const f=fixture(),a=f.add;
  a(ext('Math'),'.',ext('random()'),symbolicValue('double','x'));
  a(ref(1),'*',{kind:'literal',text:'0.0',type:'double',value:0});
  a(ref(1),'*',{kind:'literal',text:'-0.0',type:'double',value:-0});
  a(ref(1),'/',lit('2'));
  a(lit('2'),'/',ref(1));
  const out=optimizeQuadruples(f.input());
  assert.equal(out.status,'success');
  assert.ok(!out.events.some(e=>e.technique==='RS'));
});
