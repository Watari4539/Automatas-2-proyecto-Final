import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestAnalysis, MAX_SOURCE_LENGTH } from '../src/compiler/index.js';

function analyze(source) {
  const result = requestAnalysis(source);
  assert.equal(result.status, 'success', JSON.stringify(result.diagnostics, null, 2));
  return result;
}
const occurrences = (result, name) => result.rows.filter(row => row.originalLexeme === name);

test('ejemplo completo del usuario: identidades y sustitución', () => {
  const source = readFileSync(new URL('../fixtures/Ejemplo.java', import.meta.url), 'utf8');
  const result = analyze(source);
  assert.deepEqual(result.symbols.map(s => [s.id, s.name]), [
    ['ID1', 'Ejemplo'], ['ID2', 'mostrarProcesos'], ['ID3', 'limite'],
    ['ID4', 'contadorBase'], ['ID5', 'deltaPaso'], ['ID6', 'valorTemporal'],
    ['ID7', 'resultadoParcial'], ['ID8', 'indiceCiclo'], ['ID9', 'estadoFinal'], ['ID10', 'args'],
  ]);
  assert.deepEqual(occurrences(result, 'contadorBase').map(r => [r.id, r.lexeme, r.token]), [['ID4', 'contadorBase', 'ID'], ['', 'ID4', 'ID']]);
  assert.deepEqual(occurrences(result, 'mostrarProcesos').map(r => r.lexeme), ['mostrarProcesos', 'ID2']);
  assert.equal(occurrences(result, 'main')[0].token, 'PMAIN');
  for (const name of ['System', 'out', 'println']) {
    for (const row of occurrences(result, name)) assert.deepEqual([row.id, row.lexeme, row.token], ['', name, 'ID']);
  }
});
test('cada uso conserva el enlace a las posiciones del código original', () => {
  const source = 'int x=1; x=x+2;';
  const result = analyze(source);
  for (const row of result.rows) assert.equal(source.slice(row.start, row.end), row.originalLexeme);
  assert.deepEqual(occurrences(result, 'x').map(r => r.lexeme), ['x', 'ID1', 'ID1']);
});
test('nombres iguales en métodos distintos tienen IDs distintos', () => {
  const result = analyze('class A { void uno(int x){ x=x+1; } void dos(int x){ x=x+2; } }');
  const xs = occurrences(result, 'x');
  assert.notEqual(xs[0].symbolId, xs[3].symbolId);
  assert.deepEqual(xs.map(r => r.symbolId), ['ID3', 'ID3', 'ID3', 'ID5', 'ID5', 'ID5']);
});
test('campo y parámetro: this desambigua la referencia', () => {
  const result = analyze('class A { int valor; void poner(int valor){ this.valor=valor; } }');
  const rows = occurrences(result, 'valor');
  assert.deepEqual(rows.map(r => r.symbolId), ['ID2', 'ID4', 'ID2', 'ID4']);
});
test('campo y variable local: el uso anterior a la declaración resuelve el campo', () => {
  const result = analyze('class A { int x; void f(){ x=1; int x=2; x=3; this.x=4; } }');
  assert.deepEqual(occurrences(result, 'x').map(r => r.symbolId), ['ID2', 'ID2', 'ID4', 'ID4', 'ID2']);
});
test('bloques hermanos admiten variables distintas con el mismo nombre', () => {
  const result = analyze('class A { void f(){ { int x=1; x++; } { int x=2; x++; } } }');
  assert.deepEqual(occurrences(result, 'x').map(r => r.symbolId), ['ID3', 'ID3', 'ID4', 'ID4']);
});
test('dos ciclos for no comparten su variable, aun sin llaves', () => {
  const result = analyze('class A { void f(){ for(int i=0;i<3;i++) System.out.print(i); for(int i=0;i<2;i++){System.out.print(i);} } }');
  assert.deepEqual(occurrences(result, 'i').map(r => r.symbolId), ['ID3', 'ID3', 'ID3', 'ID3', 'ID4', 'ID4', 'ID4', 'ID4']);
});
test('la variable de for no se filtra después del ciclo', () => {
  const result = requestAnalysis('class A { void f(){ for(int i=0;i<2;i++){} i=4; } }');
  assert.equal(result.status, 'incomplete');
  assert.equal(occurrences(result, 'i').at(-1).symbolId, null);
});
test('for mejorado enlaza variable y arreglo', () => {
  const result = analyze('class A { void f(int[] valores){ for(int valor:valores){System.out.print(valor);} } }');
  assert.equal(occurrences(result, 'valor')[0].symbolId, occurrences(result, 'valor')[1].symbolId);
});
test('método y campo pueden usarse antes de declararse', () => {
  const result = analyze('class A { void f(){ g(); x=1; } int x; void g(){} }');
  assert.deepEqual(occurrences(result, 'g').map(r => [r.id, r.lexeme]), [['ID3', 'g'], ['', 'ID3']]);
  assert.deepEqual(occurrences(result, 'x').map(r => r.symbolId), ['ID4', 'ID4']);
});
test('varias declaraciones, inicializadores, arreglos y comas internas', () => {
  const result = analyze('class A { void f(){ int a=1,b=Math.max(a,2),c; int[] xs={a,b}; c=xs[0]; System.out.print(xs.length); } }');
  assert.deepEqual(result.symbols.map(s => s.name), ['A', 'f', 'a', 'b', 'c', 'xs']);
  assert.equal(occurrences(result, 'length')[0].id, '');
});
test('Math es externo; una variable llamada Math puede ocultarlo', () => {
  const result = analyze('class A { void f(){ double x=Math.random(); int Math=1; Math++; } }');
  const rows = occurrences(result, 'Math');
  assert.equal(rows[0].symbolId, null);
  assert.ok(rows[1].symbolId);
  assert.equal(rows[1].symbolId, rows[2].symbolId);
});
test('importación explícita y miembros del objeto externo', () => {
  const result = analyze('import java.util.Scanner; class A { void f(){ Scanner lector=new Scanner(System.in); int n=lector.nextInt(); lector.close(); } }');
  assert.deepEqual(result.symbols.map(s => s.name), ['A', 'f', 'lector', 'n']);
  for (const row of occurrences(result, 'Scanner')) assert.equal(row.id, '');
});
test('package es del programador y los segmentos son unidades separadas', () => {
  const result = analyze('package escuela.proyecto; class A {}');
  assert.deepEqual(result.symbols.map(s => s.name), ['escuela', 'proyecto', 'A']);
});
test('miembros de objetos propios y retorno de método', () => {
  const result = analyze('class A { int x; A obtener(){return this;} void f(){ A a=new A(); a.x=1; obtener().x=2; } }');
  assert.deepEqual(occurrences(result, 'x').map(r => r.symbolId), ['ID2', 'ID2', 'ID2']);
});
test('métodos sobrecargados por cantidad y tipos literales exactos', () => {
  const result = analyze('class A { void f(int x){} void f(String x){} void f(){} void g(){ f(1); f("a"); f(); } }');
  const rows = occurrences(result, 'f');
  assert.deepEqual(rows.map(r => r.symbolId), ['ID2', 'ID4', 'ID6', 'ID2', 'ID4', 'ID6']);
});
test('sobrecarga ambigua no elige un ID arbitrario', () => {
  const result = requestAnalysis('class A { void f(int x){} void f(double x){} void g(){ f(Math.random()); } }');
  assert.ok(result.diagnostics.some(d => d.code === 'AMBIGUOUS_NAME'));
  assert.equal(occurrences(result, 'f').at(-1).symbolId, null);
});
test('main ordinario tiene ID; solo la firma principal tiene PMAIN', () => {
  const result = analyze('class A { void main(int n){} public static void main(String args[]) { main(1); } }');
  assert.deepEqual(occurrences(result, 'main').map(r => r.token), ['ID', 'PMAIN', 'ID']);
  assert.equal(occurrences(result, 'main')[0].symbolId, occurrences(result, 'main')[2].symbolId);
});
test('método llamado main sin public no se considera principal', () => {
  const result = analyze('class A { static void main(String[] args){} }');
  assert.equal(occurrences(result, 'main')[0].token, 'ID');
});
test('catch tiene su propio parámetro y ámbito', () => {
  const result = analyze('class A { void f(){ try {System.out.print(1);} catch(Exception e){System.out.print(e);} } }');
  assert.equal(occurrences(result, 'e')[0].symbolId, occurrences(result, 'e')[1].symbolId);
});
test('identificadores desconocidos no se hacen pasar por Java', () => {
  const result = requestAnalysis('class A { void f(){ desconocido=2; MAth.random(); } }');
  assert.equal(result.status, 'incomplete');
  assert.equal(occurrences(result, 'desconocido')[0].symbolId, null);
  assert.ok(result.diagnostics.some(d => d.message.includes('MAth')));
});
test('duplicados locales dentro del mismo ámbito se notifican', () => {
  const result = requestAnalysis('class A { void f(int n){int n=1;} }');
  assert.ok(result.diagnostics.some(d => d.code === 'DUPLICATE_DECLARATION' || d.code === 'OVERLAPPING_LOCAL'));
});
test('errores de delimitadores y reglas faltantes no rompen el análisis', () => {
  assert.equal(requestAnalysis('class A {').status, 'incomplete');
  assert.equal(requestAnalysis('class A { boolean f(int x){return x>=1;} }').status, 'incomplete');
});
test('estado vacío, solo comentarios y límite de entrada', () => {
  assert.equal(requestAnalysis('   ').status, 'empty');
  assert.equal(analyze('// hola').rows.length, 0);
  assert.equal(requestAnalysis(' '.repeat(MAX_SOURCE_LENGTH) + 'a').diagnostics[0].code, 'SOURCE_LIMIT');
  assert.equal(requestAnalysis('{'.repeat(161)).diagnostics[0].code, 'DEPTH_LIMIT');
  assert.throws(() => requestAnalysis(null), TypeError);
});
test('los IDs se reinician en cada generación', () => {
  analyze('int otro=1;');
  assert.equal(analyze('int nuevo=2;').symbols[0].id, 'ID1');
});
test('importaciones con asterisco de paquetes conocidos resuelven tipos Java', () => {
  const result = analyze('import java.util.*; class A { void f(){ Scanner lector=new Scanner(System.in); lector.close(); } }');
  assert.deepEqual(result.symbols.map(s => s.name), ['A', 'f', 'lector']);
});
test('String calificado también reconoce la firma principal', () => {
  const result = analyze('class A { public static void main(java.lang.String[] args){} }');
  assert.equal(occurrences(result, 'main')[0].token, 'PMAIN');
});
test('referencia calificada a una clase del propio package', () => {
  const result = analyze('package escuela.proyecto; class A { void f(){ escuela.proyecto.A objeto=new escuela.proyecto.A(); } }');
  for (const name of ['escuela', 'proyecto', 'A']) {
    const rows = occurrences(result, name);
    assert.ok(rows.length > 1);
    assert.ok(rows.every(r => r.symbolId === rows[0].symbolId));
  }
});
test('for con if y else sin llaves conserva el ámbito en ambas ramas', () => {
  const result = analyze('class A { void f(){ for(int i=0;i<3;i++) if(i==1) System.out.print(i); else System.out.print(i); } }');
  assert.equal(new Set(occurrences(result, 'i').map(r => r.symbolId)).size, 1);
});
test('una clase del programador llamada Math tiene prioridad sobre Java', () => {
  const result = analyze('class Math { static int random(){return 1;} void f(){int n=Math.random();} }');
  assert.ok(occurrences(result, 'Math').every(r => r.symbolId === 'ID1'));
  assert.ok(occurrences(result, 'random').every(r => r.symbolId === 'ID2'));
});
test('nombres parecidos a IDs generados no colisionan con identidades internas', () => {
  const result = analyze('int ID1=1; int valor=ID1; valor=ID1;');
  assert.equal(result.symbols.length, 2);
  assert.ok(occurrences(result, 'ID1').every(r => r.symbolId === 'ID1'));
  assert.ok(occurrences(result, 'valor').every(r => r.symbolId === 'ID2'));
});
test('la expresión de for-each conserva el ámbito exterior', () => {
  const result = analyze('class A { int[] x; void f(){ for(int x:x){System.out.print(x);} } }');
  assert.deepEqual(occurrences(result, 'x').map(r => r.symbolId), ['ID2', 'ID4', 'ID2', 'ID4']);
});
