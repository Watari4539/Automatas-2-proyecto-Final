import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis } from '../src/compiler/index.js';
import { GRAMMAR } from '../src/compiler/errors/grammar.js';

const wrap = body => `public class Ejemplo { public void revisar() { ${body} } }`;
const rows = source => requestAnalysis(source).errors;
const semantic = source => rows(source).filter(row => row.category === 'semantic');
const has = (source, code) => rows(source).some(row => row.code === code);

test('orden global léxico, sintáctico y semántico, luego línea dentro de cada grupo', () => {
  const source = `public class Ejemplo {
 public void revisar(char letra) {
  double total = "texto";
  int 2contador = 0;
  int vacio = ;
  desconocido = 3;
  int enorme = 2147483647 + 1;
  revisar(5);
 }
}`;
  const result = rows(source);
  assert.deepEqual(result.map(row => [row.category, row.line]), [
    ['lexical', 4], ['syntax', 5], ['semantic', 3], ['semantic', 6], ['semantic', 7], ['semantic', 8],
  ]);
  assert.equal(result.at(-1).code, 'ARGUMENT_TYPE');
});

test('programa válido según GLC, con main y retorno, no reporta errores', () => {
  const result = requestAnalysis('public class A { int x; public int sumar(int a, int b) { int total=a+b; return total; } public static void main(String[] args){ int n=1; System.out.print(n); } }');
  assert.deepEqual(result.errors, []);
  assert.equal(result.errorAnalysis.complete, true);
});
test('package opcional; si está presente se valida DPACKAGE', () => {
  assert.deepEqual(rows('public class A {}'), []);
  assert.deepEqual(rows('package ejemplo; public class A {}'), []);
  assert.ok(rows('package ejemplo public class A {}').some(e => e.rule === 'DPACKAGE'));
  assert.deepEqual(rows('package uno.dos; public class A {}'), []);
});
test('importaciones calificadas y comodines válidos', () => {
  assert.deepEqual(rows('import java.Scanner; public class A {}'), []);
  assert.deepEqual(rows('import java.util.Scanner; public class A {}'), []);
  assert.deepEqual(rows('import java.util.*; public class A {}'), []);
});
test('léxico: identificador numérico, número, cadena, carácter, comentario y símbolo', () => {
  assert.ok(has(wrap('int 2nombre=1;'), 'INVALID_IDENTIFIER'));
  assert.ok(has(wrap('double n=123.45.67;'), 'INVALID_NUMBER'));
  assert.ok(has('String s="hola\n;', 'UNCLOSED_LITERAL'));
  assert.ok(has(wrap("char c='ab';"), 'INVALID_CHARACTER'));
  assert.ok(has('/* sin cierre', 'UNCLOSED_COMMENT'));
  assert.ok(has(wrap('#;'), 'ILLEGAL_CHARACTER'));
  assert.ok(has(wrap('String s="\\q";'), 'INVALID_ESCAPE'));
});
test('comentarios y cadenas pueden contener símbolos sin ser errores léxicos', () => {
  const result = rows(wrap('/* # @ */ String texto="# @ // /*"; int $valor=1;'));
  assert.deepEqual(result, []);
});
test('una palabra mal escrita que es identificador no se clasifica como error léxico', () => {
  const result = rows('publik class A {}');
  assert.ok(result.some(e => e.category === 'syntax'));
  assert.ok(result.every(e => e.category !== 'lexical'));
});
test('operadores Java sin token acordado son avisos, no errores léxicos', () => {
  const result = requestAnalysis(wrap('int n=1; n+=2;'));
  assert.ok(result.errorAnalysis.notices.some(e => e.code === 'MISSING_TOKEN_RULE'));
  assert.ok(result.errors.every(e => e.category !== 'lexical'));
});
test('DEC exige expresión después del igual', () => {
  const result = rows(wrap('int x=;'));
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, 'DEC');
  assert.match(result[0].justification, /En base a la regla gramatical DEC, se esperaba una expresión EXP/);
});
test('ASIG exige expresión después del igual', () => {
  const result = rows(wrap('int x; x=;'));
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, 'ASIG');
});
test('punto y coma omitido: señala la línea anterior y continúa la siguiente instrucción', () => {
  const source = 'public class A {\npublic void f(){\nint x=1\ndouble d="texto";\n}\n}';
  const result = rows(source);
  assert.ok(result.some(e => e.category === 'syntax' && e.line === 3 && e.rule === 'DEC'));
  assert.ok(result.some(e => e.category === 'semantic' && e.line === 4));
});
test('llaves faltantes no generan falsos identificadores no declarados en todo el archivo', () => {
  const result = rows('public class A { public void f(){ int x=1; x=x+1;');
  assert.ok(result.some(e => e.rule === 'METODO'));
  assert.ok(result.some(e => e.rule === 'CLASE'));
  assert.ok(result.every(e => e.code !== 'UNDECLARED_NAME'));
});
test('clase sin modificador y métodos static son válidos', () => {
  assert.deepEqual(rows('class A {}'), []);
  assert.deepEqual(rows('public class A { public static void f(){} }'), []);
  assert.deepEqual(rows('public class A { public static void main(String[] args){} }'), []);
});
test('herencia y arreglos tienen cobertura parcial; listas se revisan', () => {
  assert.equal(requestAnalysis('public class A extends Object {}').errorAnalysis.complete, false);
  assert.deepEqual(rows(wrap('int[] datos;')), []);
  assert.deepEqual(rows(wrap('int a=1,b=a+2;')), []);
});
test('argumentos admiten expresiones', () => {
  const result = rows('public class A { public void f(int n){} public void g(){f(1+2);} }');
  assert.deepEqual(result, []);
});
test('controles no verificados quedan fuera de revisión y no fingen éxito completo', () => {
  for (const body of ['for(int i=0;i<3;i++){noExiste=1;}', 'while(true){noExiste=1;}', 'if(true){noExiste=1;}else{otro=2;}', 'do{noExiste=1;}while(true);', 'switch(1){case 1:noExiste=1;break;}']) {
    const result = requestAnalysis(wrap(body));
    assert.deepEqual(result.errors, [], body);
    assert.equal(result.errorAnalysis.complete, false, body);
    assert.ok(result.errorAnalysis.notices.some(e => e.code === 'UNREVIEWED_SYNTAX'));
  }
});
test('un bloque ignorado no evita revisar las instrucciones posteriores', () => {
  const result = semantic(wrap('while(true){noExiste=1;} double x="texto";'));
  assert.deepEqual(result.map(e => e.code), ['INCOMPATIBLE_ASSIGNMENT']);
});
test('asignaciones incompatibles', () => {
  for (const declaration of ['double x="texto";', 'int x=true;', 'boolean x=5;', 'String x=4;', 'float x=1.5;']) assert.ok(has(wrap(declaration), 'INCOMPATIBLE_ASSIGNMENT'), declaration);
});
test('conversiones numéricas válidas y constantes pequeñas no dan falsos errores', () => {
  assert.deepEqual(rows(wrap("int a=3; double b=a; long c=a; float f=1.5f; byte pequeno=127; char letra=65; int codigo='a';")), []);
});
test('referencias a variables inexistentes y a variables declaradas después', () => {
  assert.ok(has(wrap('noExiste=1;'), 'UNDECLARED_NAME'));
  assert.ok(has(wrap('int a=b; int b=1;'), 'UNDECLARED_NAME'));
  assert.equal(semantic(wrap('double a=noExiste+1;')).length, 1);
});
test('parámetros y locales de distintos métodos son entidades separadas', () => {
  const source = 'public class A { public void uno(int x){int n=x+1;} public void dos(String x){double n=x;} }';
  assert.deepEqual(semantic(source).map(e => e.code), ['INCOMPATIBLE_ASSIGNMENT']);
});
test('las variables locales de un método no se filtran a otro', () => {
  assert.ok(has('public class A {public void f(){int x=1;} public void g(){x=2;}}', 'UNDECLARED_NAME'));
});
test('un parámetro puede ocultar un campo con otro tipo', () => {
  assert.deepEqual(semantic('public class A {String x; public void f(int x){double d=x;}}'), []);
});
test('campos y métodos declarados después son accesibles', () => {
  assert.deepEqual(semantic('public class A {public int f(){return x;} int x; public int g(){return f();}}'), []);
});
test('operaciones entre tipos incompatibles', () => {
  assert.ok(has(wrap('int x=true+1;'), 'INVALID_OPERANDS'));
  assert.ok(has(wrap('double x="hola"*2;'), 'INVALID_OPERANDS'));
  assert.ok(has(wrap('boolean x=1<"hola";'), 'INVALID_OPERANDS'));
  assert.ok(has(wrap('int x=~true;'), 'INVALID_UNARY_OPERAND'));
});
test('operaciones válidas: promoción, concatenación, comparación y booleanos', () => {
  assert.deepEqual(rows(wrap('double x=1+2.5; String texto="valor="+x; boolean b=1<2; boolean c=b&true; boolean d=!c;')), []);
});
test('incrementar un literal es un error semántico', () => {
  assert.ok(has(wrap('int x=++1;'), 'NOT_ASSIGNABLE'));
});
test('int no puede enviarse a un parámetro char ni siquiera como literal pequeño', () => {
  const source = "public class A {public void f(char c){} public void g(){f(65); f('A');}}";
  const result = semantic(source);
  assert.equal(result.length, 1);
  assert.equal(result[0].code, 'ARGUMENT_TYPE');
  assert.match(result[0].justification, /char.*int/);
});
test('cantidad incorrecta de argumentos y métodos inexistentes', () => {
  assert.ok(has('public class A {public void f(int n){} public void g(){f();}}', 'ARGUMENT_COUNT'));
  assert.ok(has(wrap('noExiste();'), 'UNDECLARED_METHOD'));
});
test('las variables del cuerpo no modifican la lista de parámetros del método', () => {
  assert.deepEqual(semantic('public class A {public void f(int n){int a=1; double b=2;} public void g(){f(1);}}'), []);
});
test('sobrecargas por tipos y ampliación numérica', () => {
  assert.deepEqual(semantic('public class A {public void f(int n){} public void f(String s){} public void g(){f(1); f("a");}}'), []);
  assert.deepEqual(semantic('public class A {public void f(double n){} public void g(){int n=1; f(n);}}'), []);
});
test('retorno de tipo incompatible, void con valor y retorno faltante', () => {
  assert.ok(has('public class A {public double f(){return "texto";}}', 'INCOMPATIBLE_ASSIGNMENT'));
  assert.ok(has('public class A {public void f(){return 1;}}', 'VOID_RETURN_VALUE'));
  assert.ok(has('public class A {public int f(){return;}}', 'MISSING_RETURN_VALUE'));
  assert.ok(has('public class A {public int f(){int x=1;}}', 'MISSING_RETURN'));
});
test('duplicados en el mismo ámbito, incluidas las firmas', () => {
  assert.ok(has(wrap('int x=1; int x=2;'), 'DUPLICATE_DECLARATION'));
  assert.ok(has('public class A {public void f(int x){int x=1;}}', 'DUPLICATE_DECLARATION'));
  assert.ok(has('public class A {public void f(int x){} public void f(int y){}}', 'DUPLICATE_DECLARATION'));
});
test('desbordamiento comprobable de enteros, rango de byte y literal flotante', () => {
  assert.ok(has(wrap('int x=2147483647+1;'), 'NUMERIC_OVERFLOW'));
  assert.ok(has(wrap('long x=9223372036854775807L+1L;'), 'NUMERIC_OVERFLOW'));
  assert.ok(has(wrap('byte x=128;'), 'VALUE_OUT_OF_RANGE'));
  assert.ok(has(wrap('float x=3.5e38f;'), 'NUMERIC_OVERFLOW'));
  assert.deepEqual(rows(wrap('long x=2147483647L+1L;')), []);
});
test('no se adivina un desbordamiento que depende de valores en ejecución', () => {
  assert.deepEqual(rows('public class A {public int f(int x){return x+1;}}'), []);
});
test('división entera constante por cero', () => {
  assert.ok(has(wrap('int x=5/0;'), 'INTEGER_DIVISION_BY_ZERO'));
});
test('firmas conocidas de Java y desconocidas con cobertura explícita', () => {
  assert.ok(has(wrap('int x=Math.random();'), 'INCOMPATIBLE_ASSIGNMENT'));
  assert.deepEqual(rows(wrap('double x=Math.random(); System.out.print(x);')), []);
  const result = requestAnalysis(wrap('double x=Math.metodoDesconocido();'));
  assert.equal(result.errorAnalysis.complete, false);
  assert.ok(result.errorAnalysis.notices.some(e => e.code === 'UNREVIEWED_SEMANTICS'));
  assert.ok(result.errors.every(e => e.code !== 'INCOMPATIBLE_ASSIGNMENT'));
});
test('ninguna justificación llega a 50 palabras y toda sintáctica cita una regla existente', () => {
  const cases = [wrap('int 2mal=1; int x=; double d="a";'), 'class A extends B {static int x; void f(){int a,b; foo(2);}}', wrap('int n=2147483647+1; noExiste=4;')];
  for (const source of cases) for (const row of rows(source)) {
    assert.ok(row.justification.trim().split(/\s+/).length < 50, row.justification);
    if (row.category === 'syntax') {
      assert.ok(Object.hasOwn(GRAMMAR, row.rule));
      assert.ok(row.justification.startsWith(`En base a la regla gramatical ${row.rule}, se esperaba `));
    }
  }
});
test('recuperación no mezcla léxico, sintaxis y semántica de una sola expresión rota', () => {
  const result = rows(wrap('int x=; double d="texto";'));
  assert.equal(result.filter(e => e.category === 'syntax').length, 1);
  assert.equal(result.filter(e => e.category === 'semantic').length, 1);
});
test('análisis consecutivos no conservan errores anteriores', () => {
  rows(wrap('int x=;'));
  assert.deepEqual(rows(wrap('int x=1;')), []);
  assert.deepEqual(requestAnalysis('').errors, []);
  assert.deepEqual(requestAnalysis('// comentario').errors, []);
});
test('nombres que comienzan por número siguen siendo inválidos aunque contengan d o f', () => {
  assert.ok(has(wrap('int 2dato=1;'), 'INVALID_IDENTIFIER'));
  assert.ok(has(wrap('int 2float=1;'), 'INVALID_IDENTIFIER'));
});
test('enteros no decimales interpretan el bit de signo de Java', () => {
  assert.deepEqual(rows(wrap('int x=0xffffffff; long y=0xffffffffffffffffL;')), []);
});
test('una expresión muy larga devuelve cobertura parcial en vez de desbordar la pila', () => {
  const result = requestAnalysis(wrap(`int x=${Array(1000).fill('1').join('+')};`));
  assert.equal(result.errorAnalysis.complete, false);
  assert.ok(result.errorAnalysis.notices.some(n => n.message.includes('profundidad')));
});
test('identificadores homónimos de propiedades JavaScript no alteran el analizador', () => {
  assert.deepEqual(rows(wrap('int constructor=1; int toString=2; constructor=toString;')), []);
  assert.doesNotThrow(() => requestAnalysis('import constructor.*; public class A {}'));
  assert.ok(has('public class constructor { public void f(){constructor x; int n=x;} }', 'INCOMPATIBLE_ASSIGNMENT'));
});
test('una declaración de tipo propio cita DEC y solo una creación usa OBJ', () => {
  const result = rows('public class A {public void f(){A objeto=;}}');
  assert.equal(result[0].rule, 'DEC');
  assert.ok(rows(wrap('int n=new Ejemplo();')).some(row => row.code === 'INCOMPATIBLE_ASSIGNMENT'));
});

test('refuerzo: casts, signos, agrupación, expresiones anidadas y posfijos', () => {
  assert.deepEqual(rows(wrap('int n=(int)(Math.random()*2); byte b=-1; int minimo=-2147483648; int x=(n); n++; --n; System.out.println("n="+(x+1));')), []);
  assert.deepEqual(rows('class A { static final int n=2; static int f(int x){return x;} public static void main(String[] args){System.out.println(f(f(n+1))); return;} }'), []);
});
test('refuerzo conserva errores reales en casts, argumentos y expresiones', () => {
  assert.ok(has(wrap('int n=(int)true;'), 'INVALID_CAST'));
  assert.ok(has(wrap('int n=-2147483649;'), 'NUMERIC_OVERFLOW'));
  assert.ok(rows(wrap('int n=(1+);')).some(e => e.category === 'syntax'));
  assert.ok(rows(wrap('System.out.println(1,);')).some(e => e.category === 'syntax'));
  assert.ok(rows(wrap('1+2;')).some(e => e.category === 'syntax'));
  assert.ok(rows(wrap('System.out.println(1)')).some(e => e.category === 'syntax'));
  assert.ok(has(wrap('int a=1,b="texto";'), 'INCOMPATIBLE_ASSIGNMENT'));
});
test('null se admite para referencias y arreglos, pero no para primitivos', () => {
  assert.deepEqual(rows(wrap('String s=null; int[] datos=null; int[] otros=new int[3];')), []);
  assert.ok(has(wrap('int n=null;'), 'INCOMPATIBLE_ASSIGNMENT'));
});

test('un campo de instancia no es accesible directamente desde main ni otro método static', () => {
  for (const method of ['public static void main(String[] args)', 'public static void probar()']) {
    const source = `public class Lunes { int a='F'; public char qwerty(int numero){return (char)numero;} ${method}{System.out.println(new Lunes().qwerty(a));} }`;
    const result = rows(source);
    assert.equal(result.length, 1);
    assert.equal(result[0].code, 'INSTANCE_FIELD_IN_STATIC_CONTEXT');
    assert.equal(result[0].category, 'semantic');
  }
});
test('campos static, parámetros y locales homónimos sí son accesibles', () => {
  for (const source of [
    'class A { static int a=1,b=2; static void f(){System.out.println(a+b);} }',
    'class A { int a=1; static void f(int a){System.out.println(a);} }',
    'class A { int a=1; static void f(){int a=2; System.out.println(a);} }',
    'class A { int a=1; void f(){System.out.println(a);} }',
    'class A { int a=1; static void f(){A obj=new A(); System.out.println(obj.a);} }',
    'class A { static int a=1; static void f(){System.out.println(A.a);} }',
  ]) assert.deepEqual(rows(source), [], source);
});
test('acceso por clase y escritura sin objeto también requieren campo static', () => {
  assert.ok(has('class A { int a=1; static void f(){System.out.println(A.a);} }', 'INSTANCE_FIELD_IN_STATIC_CONTEXT'));
  assert.ok(has('class A { int a=1; static void f(){a=2;} }', 'INSTANCE_FIELD_IN_STATIC_CONTEXT'));
});
