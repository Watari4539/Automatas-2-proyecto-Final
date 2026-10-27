import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis } from '../src/compiler/index.js';
const run = body => requestAnalysis(`public class A { public void f(){ ${body} } }`);

test('comparaciones y operadores lógicos válidos no generan falsos errores sintácticos',()=>{
 for (const body of [
  'boolean b=1<=2;', 'boolean b=2>=1;', 'boolean b=1!=2;',
  'boolean b=true&&false;', 'boolean b=true||false;',
  'boolean b=true^false;', 'int b=1^2;',
  'boolean b=1+2<=3 && 4!=5 || false;',
  'boolean b=!true==false;',
 ]) assert.deepEqual(run(body).errors,[],body);
});
test('operadores nuevos conservan errores de tipos reales',()=>{
 for (const body of ['boolean b=1&&2;', 'boolean b="a"<=2;', 'boolean b=true!=2;', 'int b=1.0^2;', 'int b=true||false;']) {
  assert.ok(run(body).errors.some(e=>e.category==='semantic'),body);
  assert.ok(!run(body).errors.some(e=>e.category==='syntax'),body);
 }
});
test('casts constantes y caracteres mantienen información para estrechamiento y división por cero',()=>{
 for(const body of ['char c=(char)65+1;', 'byte b=(byte)1+1;', "char c='A'+1;", 'byte b=(int)2.9;']) assert.deepEqual(run(body).errors,[],body);
 assert.ok(run('byte b=(int)128.0;').errors.some(e=>e.code==='VALUE_OUT_OF_RANGE'));
 assert.ok(run('int x=1/(int)0.5;').errors.some(e=>e.code==='INTEGER_DIVISION_BY_ZERO'));
 assert.ok(run("int x=1/('A'-65);").errors.some(e=>e.code==='INTEGER_DIVISION_BY_ZERO'));
});
test('distingue resultados flotantes no finitos de literales inválidos y división entera',()=>{
 for(const body of ['double x=1.0/0.0;', 'double x=0.0/0.0;', 'double x=1e308*10;']) assert.deepEqual(run(body).errors,[],body);
 assert.ok(run('double x=1e999;').errors.some(e=>e.code==='NUMERIC_OVERFLOW'));
 assert.ok(run('int x=1/0;').errors.some(e=>e.code==='INTEGER_DIVISION_BY_ZERO'));
 assert.ok(run('int x=2147483647+1;').errors.some(e=>e.code==='NUMERIC_OVERFLOW'));
});
test('detecta uso local en propio inicializador sin confundir campos ni declaraciones previas',()=>{
 assert.ok(run('int x=x+1;').errors.some(e=>e.code==='UNINITIALIZED_LOCAL'));
 assert.deepEqual(run('int x=2;int y=x+1;').errors,[]);
 assert.deepEqual(requestAnalysis('public class A {int x=this.x+1;}').errors,[]);
});
test('diagnósticos mantienen categorías, fragmentos y explicaciones cortas',()=>{
 const r=run('int 2x=0; int y=; int z=z+1; boolean b=1&&2;');
 const order={lexical:0,syntax:1,semantic:2};
 for(let i=0;i<r.errors.length;i++){
  const e=r.errors[i]; assert.ok(e.error.length>0); assert.ok(e.justification.trim().split(/\s+/).length<50);
  if(i) assert.ok(order[r.errors[i-1].category]<=order[e.category]);
 }
});
test('lecturas locales sin inicialización en flujo lineal y asignación previa',()=>{
 assert.ok(run('int x;System.out.println(x);').errors.some(e=>e.code==='UNINITIALIZED_LOCAL'));
 assert.ok(run('int x;x=x+1;').errors.some(e=>e.code==='UNINITIALIZED_LOCAL'));
 assert.deepEqual(run('int x;x=2;System.out.println(x);').errors,[]);
 assert.deepEqual(requestAnalysis('public class A { int x; public void f(){System.out.println(x);} }').errors,[]);
});
