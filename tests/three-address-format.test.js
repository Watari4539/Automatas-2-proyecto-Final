import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOperand, formatInstruction, formatClosure } from '../src/ui/three-address/format.js';

test('operaciones y retorno respetan la notación sin resultado ni numeración adicional', () => {
  assert.equal(formatInstruction({kind:'operation', destination:'T1', left:{kind:'literal',text:"'@'"}, operator:'/', right:{kind:'literal',text:'10'}}), "T1. ('@', /, 10)");
  assert.equal(formatInstruction({kind:'operation', destination:'T2', left:{kind:'symbolIdentity',symbolId:'ID2'}, operator:'RTN', right:{kind:'symbol',symbolId:'ID6'}}), 'T2. (ID2, RTN, ID6)');
});
test('asignaciones, pendientes y cierre conservan su formato propio', () => {
  assert.equal(formatInstruction({kind:'assignment',symbolId:'ID3',value:{kind:'temporary',name:'T1'}}), 'ID3 = T1');
  assert.equal(formatInstruction({kind:'pending',treeOperationNumber:4}), 'P4');
  assert.equal(formatClosure({classSymbolId:'ID1',target:{kind:'temporary',name:'T2'}}), 'ID1 PMAIN → T2');
  assert.equal(formatClosure(null), '');
});
test('argumentos externos y literales se conservan como texto', () => {
  assert.equal(formatOperand({kind:'externalCall',name:'substring',args:[{kind:'temporary',name:'T1'},{kind:'literal',text:'4'}]}), 'substring(T1, 4)');
  assert.equal(formatOperand({kind:'literal',text:'"<b>&texto</b>"'}), '"<b>&texto</b>"');
});
