# Árbol desde PMAIN: detonadores y llamadas

Estado: punto 4 implementado como API independiente en `src/compiler/tree/program.js`. Construye la estructura desde main para los casos escolares acordados. Aún no numera, evalúa ni dibuja; tampoco cambia las salidas de Generar.

## Acuerdos de esta etapa

- El usuario confirmó que no vendrán varios SOUT. No se implementa una distribución supuesta para múltiples detonadores.
- El cast del ejemplo se conserva como anotación junto al ID de la variable, sin crear un nodo adicional.
- Se mantienen los IDs existentes y las copias independientes de cada derivación.

## Uso

```js
import { buildProgramTree } from '../src/compiler/tree/program.js';

const result = buildProgramTree(source);
// result = { status, tree, diagnostics }
```

El contrato de estados es el mismo de [expresiones](arbol-de-expresiones.md): `success`, `unsupported`, `invalid` o `limit`. Un resultado no exitoso tiene `tree: null` y una incidencia localizada, en lugar de omitir ramas sin explicación. `success` significa estructura construida; no certifica que el código sea válido en la GLC ni semánticamente correcto.

Solo se admite una clase y un `public static void main(String[] ...)` reconocido por el analizador de símbolos. Main contiene declaraciones y un único detonador: SOUT o una llamada. Las declaraciones usadas se desarrollan cuando se necesitan; no se dibujan todas en orden textual.

## Estructura y resolución

La raíz es un nodo `entry` con el ID de la clase; su clase de nodo representa la etiqueta compuesta `IDn / PMAIN`. El package no se dibuja, pero conserva su efecto sobre la numeración de símbolos.

SOUT tiene un hijo para su expresión, o ninguno si la salida está vacía. Se reconocen `System.out.print` y `System.out.println` cuando System es externo, evitando confundir una variable del programador con el nombre de Java.

En `new Viernes().a(...)`, el punto conserva dos ramas: el constructor de la clase a la izquierda y la llamada al método a la derecha. El constructor se representa mediante `kind: constructor` y el ID de clase; su futura etiqueta podrá añadir `()`.

Una llamada del programador se resuelve usando el vínculo del analizador existente, no buscando únicamente su nombre. Del nodo del método se pasa a `RTN` y de ahí a la expresión. Se admiten métodos lineales con declaraciones y un único return final con valor. Las llamadas entre métodos, las llamadas anidadas como argumentos y los objetos locales creados con el constructor simple usan el mismo mecanismo.

Cada parámetro utilizado crea un nodo `reference` con su ID, cuyo hijo desarrolla el argumento en el contexto del llamador. Los argumentos no usados no generan ramas, conforme al ejemplo, pero quedan registrados en los metadatos de la llamada. Un argumento puede ser un literal, una variable, una expresión o una llamada soportada.

Las variables locales y los campos visibles se buscan por sus vínculos de identidad y ámbito. Las escrituras posteriores o los cuerpos con efectos que aún no tienen representación detienen la construcción; no se presume un valor actualizado.

## Contextos e identidad de las copias

Los nodos incorporan `contextId`. El árbol del programa añade `contexts`, una lista de registros sin referencias circulares:

| Campo | Contenido |
| --- | --- |
| `id` | Identidad interna del contexto. |
| `parentId` | Contexto del llamador, o null en main. |
| `methodSymbolId` | ID del método; null para main, que se representa con PMAIN. |
| `isMain` | Distingue el contexto de entrada. |
| `source` | Ubicación del nombre del método en esa llamada, o la declaración de main. |
| `arguments` | Parámetro por ID, contexto del llamador y rango original de su argumento. |

Dos llamadas escritas en sitios diferentes tienen contextos distintos, aunque invoquen el mismo método. Si una declaración que contiene una llamada se desarrolla dos veces por repetición de su variable, las ramas tienen nodos diferentes pero conservan el contexto de esa misma llamada. Esto permite distinguir repetición visual de una nueva llamada sin decidir todavía cómo evaluar valores no deterministas.

La detección de recursión sigue los métodos del contexto llamador. Por eso `f(f(1))` no se confunde con un método cuyo cuerpo vuelve a invocar a `f`: los argumentos se resuelven en el contexto anterior a la llamada exterior. Se interrumpen tanto la recursión directa como la indirecta.

## Cast y elementos externos

`castType` guarda el tipo de un cast junto al nodo `assignment`. Para el ejemplo, las dos copias de la variable llevan `castType: 'int'`. No se calcula el cast ni se asigna un número de operación.

Se admite esta anotación cuando el cast abarca todo el inicializador, como `(int)(Math.random()*2)` o `(int)2.5`. Un caso como `(int)2.5+3` requiere representar el cast solo sobre una parte de la expresión; se informa como pendiente en vez de aplicarlo incorrectamente a toda la asignación.

Los accesos externos conservan sus nombres. `Math.random()` se representa con punto, Math y una llamada externa `random()` sin hijos, igual que el dibujo. No se ejecuta ni se inventa un resultado. Las llamadas externas con argumentos requieren reglas adicionales y se informan como no soportadas.

## Referencia comprobada

`fixtures/ArbolViernes.java` conserva la transcripción normalizada de la referencia B: package en minúsculas, comillas de Java y el cierre faltante de println corregido. No cambia la GLC ni afirma que sus reglas actuales admitan todos los elementos del ejemplo.

Las pruebas verifican:

- Raíz ID2/PMAIN, pues package ocupa ID1.
- SOUT, punto, constructor ID2, método ID3 y RTN.
- Parámetro ID4 → variable ID8 → división `'@'/10`.
- Dos derivaciones completas de ID6, ambas con cast int y su acceso a random().
- El argumento de ID5 registrado sin añadir una rama de retorno que no lo usa.
- Conservación exacta de los símbolos del análisis original y transferencia por structured clone.

El árbol no tiene coordenadas. `operationNumber` y `evaluation` continúan en null.

## Límites actuales

Se informa sin árbol para múltiples detonadores, ausencia de detonador, control de flujo, múltiples retornos, métodos sin retorno con valor, constructores propios o con argumentos, varias clases, llamadas ambiguas y argumentos externos sin regla. Las sobrecargas solo se desarrollan si la resolución existente determina un único método.

Se mantienen los límites de fuente, profundidad y nodos de la etapa anterior para todo el desarrollo, incluidas las llamadas. No se ejecutan cuerpos Java, no se simulan objetos con estado mutable y no se añade una política de evaluación para random().

## Organización

- `program.js`: inicio en main, contexto de llamadas, parámetros, retornos, cast anotado y resultado serializable.
- `methods.js`: separación de argumentos y lectura de cuerpos lineales.
- `expression-engine.js`: motor común de operadores y expansión de variables, con extensiones para llamadas.
- `expressions.js`: API anterior para inicializadores aislados; mantiene su alcance y sus pruebas.
- `source-context.js`, `model.js`, `diagnostics.js`: preparación, datos e incidencias compartidos.

Las pruebas de esta etapa están en `tests/tree-program.test.js`. La [numeración por niveles](numeracion-del-arbol.md) ya está implementada como fase independiente del punto 5; los [valores y tipos](evaluacion-del-arbol.md) también están implementados como fase independiente del punto 6; distribución y vista, a los puntos 7 y 8.

## Ampliación: objetos locales, casts y String

El árbol conserva las referencias a instancias de la clase cuando se asignan a una variable local; el evaluador propaga la identidad del objeto hasta el acceso, sin intentar convertirla en un número o cadena. La anotación de esa asignación usa el ID de la clase y el token ID.

Los casts primitivos que abarcan un inicializador siguen anotándose junto al ID. Un cast dentro de otra expresión, como `(char)81` o `(char)(80+1)`, se representa mediante un nodo de conversión con un hijo y se numera como operación. El soporte de casts intermedios incluye operandos literales y grupos completos entre paréntesis; otras formas siguen sujetas al subconjunto reconocido.

Las llamadas externas `substring(inicio[, fin])` y `charAt(indice)` conservan sus argumentos como hijos del nodo de llamada. Los argumentos pueden contener expresiones; se evalúan antes del acceso con punto. Se utilizan índices UTF-16, fin exclusivo para substring, y se comprueban aridad, tipos e intervalos. Un índice inválido deja la evaluación parcial y un diagnóstico, sin inventar un resultado. No se ejecuta código Java externo.

La prueba integrada `fixtures/ArbolDos.java` produce `",CQM"` y 20 cuádruplos completos.

## Resolución de receptores agrupados y llamadas encadenadas

La resolución de nombres ahora deduce tipos de expresiones agrupadas, concatenaciones, operaciones aritméticas, casts primitivos, campos calificados y retornos de métodos propios. Esto permite identificar el receptor de `(a+c).length()` sin confundirlo con el detonador del programa. También se propagan los retornos conocidos de `String.length`, `String.substring` y `String.charAt` al resolver argumentos compuestos y sobrecargas por firma exacta.

La inferencia tiene un límite de profundidad y solo almacena resultados conocidos. Cuando falta un tipo, conserva la referencia sin resolver; no elige una clase ni una sobrecarga por suposición. El mensaje de llamada no resuelta identifica el método y pide revisar el receptor y los argumentos.

`fixtures/ArbolLunes.java` conserva el campo `a` y la variable local homónima con IDs distintos. Usa un objeto explícito en main (`obj.qwerty(obj.a)`), genera árbol y cuádruplos completos y produce `'R'`. Se mantiene el alcance de un detonador y cuerpos lineales: esta ampliación no interpreta ciclos ni múltiples caminos de ejecución.
