import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgramTree} from '../src/compiler/tree/program.js';
import {evaluateTree} from '../src/compiler/tree/evaluation.js';
import {buildQuadruples} from '../src/compiler/quadruples/index.js';
import {buildThreeAddress, validateThreeAddress} from '../src/compiler/three-address/index.js';
const wrap = body => `public class A{public static void main(String[] args){${body}}}`;
function sample(body='int x=2+2;System.out.println(x*3);') {
  const tree=evaluateTree(buildProgramTree(wrap(body)).tree).tree;
  const quads=buildQuadruples(tree);
  const result=buildThreeAddress(tree,quads);
  return {tree,quads,result};
}
function reject(change, code, body) {
  const {tree,quads,result}=sample(body);
  assert.equal(result.status,'success');
  change(result);
  const checked=validateThreeAddress(tree,quads,result);
  assert.equal(checked.valid,false);
  assert.equal(checked.complete,false);
  if(code) assert.equal(checked.diagnostics[0].code,code);
}

test('valida generación automática, pendientes y alias sin mutar la entrada', () => {
  for(const body of ['int x=2+2;System.out.println(x*3);','int x=2;System.out.println(x+x);','System.out.println((1+2)+((3+4)*(5+6)));']) {
    const data=sample(body), before=structuredClone(data);
    assert.deepEqual(data.result.validation,{valid:true,complete:true,diagnostics:[]});
    assert.deepEqual(validateThreeAddress(data.tree,data.quads,data.result),data.result.validation);
    assert.deepEqual(data,before);
  }
});
test('rechaza temporal inexistente y prioridad incorrecta',()=>{
  for(const name of ['T4','T2']) reject(r=>{r.instructions[0].destination=name;},'THREE_TEMPORARY_PRIORITY');
});
test('rechaza destino que consume su propio contenido',()=>{
  reject(r=>{r.instructions.at(-1).destination=r.instructions.at(-1).right.name;},'THREE_SELF_REFERENCE');
});
test('rechaza productor, ID y literal falsificados aunque el valor parezca igual',()=>{
  reject(r=>{r.instructions[2].left.producer=1;},'THREE_OPERAND');
  reject(r=>{r.instructions[2].left.symbolId='ID999';},'THREE_OPERAND');
  reject(r=>{r.instructions[0].left.text='999';},'THREE_OPERAND');
  reject(r=>{r.instructions[1].symbolId='ID999';},'THREE_ASSIGNMENT');
});
test('rechaza operador, origen y contexto alterados',()=>{
  reject(r=>{r.instructions[0].operator='-';},'THREE_OPERATOR');
  reject(r=>{r.instructions[0].origin.nodeId='node999';},'THREE_ORIGIN');
  reject(r=>{r.instructions[0].origin.contextId='otro';},'THREE_ORIGIN');
  reject(r=>{r.instructions[0].origin.source.line++;},'THREE_ORIGIN');
});
test('rechaza operaciones omitidas, duplicadas y adelantadas sin dependencias',()=>{
  reject(r=>{r.instructions.pop();},'THREE_UNFINISHED');
  reject(r=>{r.instructions.splice(1,0,structuredClone(r.instructions[0]));},'THREE_DUPLICATE_OPERATION');
  reject(r=>{r.instructions.reverse();});
});
const deferred='System.out.println((1+2)+((3+4)*(5+6)));';
test('Pn usa el número del árbol y no se puede omitir ni duplicar',()=>{
  reject(r=>{r.instructions.find(i=>i.kind==='pending').treeOperationNumber=999;},'THREE_PENDING_NUMBER',deferred);
  reject(r=>{r.instructions=r.instructions.filter(i=>i.kind!=='pending');},'THREE_PENDING_ORDER',deferred);
  reject(r=>{const i=r.instructions.findIndex(i=>i.kind==='pending');r.instructions.splice(i,0,structuredClone(r.instructions[i]));},'THREE_PENDING_DUPLICATE',deferred);
});
test('rechaza pendientes después de terminar y pendientes sin retomar',()=>{
  reject(r=>{r.instructions.push({kind:'pending',treeOperationNumber:1,origin:structuredClone(r.instructions[0].origin)});},'THREE_PENDING_DUPLICATE');
  reject(r=>{r.instructions=r.instructions.slice(0,3);},'THREE_UNFINISHED',deferred);
});
test('cierre requiere resultado final disponible y clase correcta',()=>{
  reject(r=>{r.closure=null;},'THREE_CLOSURE');
  reject(r=>{r.closure.target.producer=1;},'THREE_CLOSURE');
  reject(r=>{r.closure.classSymbolId='ID999';},'THREE_CLOSURE');
});
test('rechaza memoria final alterada y estados falsos',()=>{
  reject(r=>{r.memory.temporaries[0].producer=1;},'THREE_MEMORY_STATE');
  reject(r=>{r.memory.completed.reverse();},'THREE_MEMORY_STATE');
  reject(r=>{r.status='partial';},'THREE_STATUS');
  reject(r=>{r.diagnostics.push({code:'inventado'});},'THREE_DIAGNOSTICS');
});
test('argumentos externos verifican referencias anidadas',()=>{
  reject(r=>{r.instructions.find(i=>i.operator==='.').right.args[0].producer=99;},'THREE_OPERAND','System.out.println("ABCDE".substring(1+1,4));');
});
test('partial conserva advertencia y no se certifica como completo',()=>{
  const {tree,quads,result}=sample('System.out.println(1/0);');
  assert.deepEqual(result.validation,{valid:true,complete:false,diagnostics:[]});
  result.status='success';
  assert.equal(validateThreeAddress(tree,quads,result).diagnostics[0].code,'THREE_STATUS');
});
test('salidas bloqueadas o mal formadas no obtienen un sello de validación',()=>{
  const {tree,quads,result}=sample('System.out.println(((1+2)+(3+4))+((5+6)+(7+8)));');
  assert.equal(result.status,'blocked');
  assert.equal(validateThreeAddress(tree,quads,result).diagnostics[0].code,'THREE_NOT_GENERATED');
  for(const bad of [null,{}, {version:1,instructions:null,diagnostics:[]}]) assert.equal(validateThreeAddress(tree,quads,bad).valid,false);
  assert.equal(validateThreeAddress(null,null,null).valid,false);
});
