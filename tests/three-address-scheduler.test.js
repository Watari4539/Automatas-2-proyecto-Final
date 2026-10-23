import test from 'node:test';
import assert from 'node:assert/strict';
import {createMachine, schedule} from '../src/compiler/three-address/scheduler.js';
const lit = n => ({kind:'literal',text:String(n)});
const reg = n => ({kind:'register',number:n});
const sym = id => ({kind:'symbol',symbolId:id});
const record = (number, left, operator, right, value, contextId='ctx1') => ({number,left,operator,right,contextId,result:{status:'available',type:'int',value}});

test('una versión diferente de un ID espera a que se consuma la anterior', () => {
  const records = [record(1,sym('ID1'),'=',lit(2),2), record(2,sym('ID1'),'=',lit(3),3), record(3,reg(1),'+',lit(1),3),record(4,reg(2),'+',reg(3),6)];
  const machine = createMachine(records, reg(4));
  const plan = schedule(records,machine);
  assert.equal(plan.status,'success');
  assert.deepEqual(plan.order,[0,2,1,3]);
});
test('valores iguales en diferentes invocaciones no se fusionan', () => {
  const records = [record(1,sym('ID1'),'=',lit(2),2,'ctx1'),record(2,sym('ID1'),'=',lit(2),2,'ctx2'),record(3,reg(1),'+',reg(2),4)];
  const machine = createMachine(records,reg(3));
  assert.equal(schedule(records,machine).status,'blocked');
});
test('un resultado con dos consumidores permanece vivo hasta el último uso', () => {
  const records = [record(1,lit(1),'+',lit(2),3),record(2,reg(1),'+',lit(4),7),record(3,reg(1),'+',reg(2),10)];
  const machine = createMachine(records,reg(3)), state=machine.initial();
  machine.execute(state,0);
  machine.execute(state,1);
  assert.equal(machine.location(state,1).name,'T1');
  assert.equal(state.remaining[1],1);
  assert.equal(machine.execute(state,2),'T3');
  assert.equal(machine.location(state,1),undefined);
});
