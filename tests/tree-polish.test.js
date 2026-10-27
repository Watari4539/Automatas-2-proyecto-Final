import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';
import { analyzeProgram } from '../src/compiler/analysis.js';
const program=body=>`public class T {public static void main(String[] args){${body}}}`;
function checked(source,expected){
 const built=buildProgramTree(source); assert.equal(built.status,'success',JSON.stringify(built.diagnostics));
 const evaluated=evaluateTree(built.tree); assert.equal(evaluated.status,'success',JSON.stringify(evaluated.diagnostics));
 const result=analyzeProgram(source); assert.deepEqual(result.errors,[]);
 assert.equal(result.quadrupleAnalysis.records.at(-1).result.display,expected);
 const nodes=new Map(built.tree.nodes.map(n=>[n.id,n])); const reached=new Set();
 const walk=id=>{assert.ok(nodes.has(id));assert.ok(!reached.has(id),'cada aparición tiene identidad propia');reached.add(id);for(const child of nodes.get(id).children)walk(child);};walk(built.tree.rootId);
 assert.equal(reached.size,nodes.size);
 return built.tree;
}
test('casts de llamadas y accesos se aplican al resultado completo',()=>{
 for(const [expression,value] of [['(int)Math.random()','(int)(x)'],['(int)Math.random()*2','(int)(x)*2'],['(double)"ABC".length()','3.0'],['(int)(Math.random()*2)','(int)(x*2)']])checked(program(`System.out.println(${expression});`),value);
});
test('casts parciales y agrupados preservan alcance y anotación del ID',()=>{
 checked(program('int x=(int)2.9+3;System.out.println(x);'),'5');
 checked(program('double x=(int)2.9+3.5;System.out.println(x);'),'5.5');
 const tree=checked(program('int x=((int)(2.9+3.5));System.out.println(x);'),'6');
 assert.equal(tree.nodes.filter(n=>n.kind==='conversion').length,0);
 assert.equal(tree.nodes.filter(n=>n.castType==='int').length,1);
});
test('cast de llamada en return se anota en RTN, no como otra operación',()=>{
 const tree=checked('public class T {public int f(){return (int)Math.random();} public static void main(String[] args){System.out.println(new T().f());}}','(int)(x)');
 assert.equal(tree.nodes.filter(n=>n.kind==='conversion').length,0);
 assert.equal(tree.nodes.find(n=>n.kind==='return').castType,'int');
});
test('llamadas repetidas conservan argumentos y variables por contexto',()=>{
 checked('public class T {public int f(int x){int y=x+1;return y*2;} public static void main(String[] args){System.out.println(new T().f(2)+new T().f(8));}}','24');
});
test('precedencia y asociación: resultados calculados independientemente',()=>{
 let seed=53;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 function expression(depth){if(!depth){const v=1+rand()%7;return {s:String(v),v};}const a=expression(depth-1),b=expression(depth-1),op=['+','-','*'][rand()%3];return {s:`(${a.s}${op}${b.s})`,v:op==='+'?a.v+b.v:op==='-'?a.v-b.v:a.v*b.v};}
 for(let i=0;i<40;i++){const e=expression(1+i%3);checked(program(`System.out.println(${e.s});`),String(e.v));}
});
