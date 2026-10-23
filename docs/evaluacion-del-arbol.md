# Evaluación de valores y tipos

Estado: punto 6 implementado en `src/compiler/tree/evaluation.js` y `values.js`. Funciona sobre los árboles construidos en etapas anteriores. La vista y su integración con Generar siguen pendientes.

## Regla escolar de Math.random

El usuario indicó expresamente: **«que dé siempre 1»**. En este proyecto `Math.random()` produce siempre el double `1.0`, token `VTD`. Se aplica tanto a copias de una inicialización como a llamadas distintas. No se usa ningún generador aleatorio ni se pretende reproducir la distribución de Java.

## API y resultado

```js
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { evaluateTree } from '../src/compiler/tree/evaluation.js';

const built = buildProgramTree(source);
if (built.status === 'success') {
  const evaluated = evaluateTree(built.tree);
  // { status: 'success' | 'partial', tree, diagnostics }
}
```

También acepta el árbol de `buildExpressionTree`, numerado o sin numerar. Recalcula la numeración canónica sobre una copia y descarta evaluaciones antiguas. No modifica la entrada ni ejecuta código fuente.

Cada nodo con valor obtiene `evaluation`:

| Campo | Contenido |
| --- | --- |
| `type` | Tipo concreto: byte, short, int, long, float, double, char, boolean o String. |
| `value` | Valor interno: BigInt para enteros, Number para float/double, string para char/String y boolean para boolean. |
| `token` | VTE, VTF, VTD, VTC, VTS o VTB. |
| `display` | Representación destinada a la futura vista. |
| `constant` | Indica si el valor procede de una expresión constante admisible, para conversiones implícitas limitadas. No significa solo que se conozca su valor. |

Por ejemplo, `3` usa VTE; `3.0`, VTD; `3.0f`, VTF; `'A'`, VTC; `"texto"`, VTS. Long conserva su tipo interno y usa VTE, pues el catálogo del curso no define un token separado para long.

Los nodos llevan ahora `declaredType` y `constantVariable`, obtenidos durante la construcción. Permiten convertir asignaciones, parámetros y retornos sin adivinar tipos a partir de sus valores. Los símbolos y sus IDs no se vuelven a enumerar.

El árbol incorpora un resumen `evaluation` con `complete`, `evaluatedOperationOrder` y `randomPolicy: 'fixed-one'`. Su orden de operaciones exitosas coincide con `numbering.operationOrder` cuando no hay fallos.

## Recorrido

Se procesa cada nivel completo, desde abajo hacia arriba y de izquierda a derecha. Las operaciones conservan los números del punto 5. También se propagan valores a través de nodos sin número, como referencias de parámetros y llamadas, para que sus padres tengan disponibles los operandos. SOUT y la raíz no reciben un valor anotado como si fueran operaciones numéricas.

Las ramas repetidas se evalúan individualmente. La regla fija de random garantiza resultados consistentes en sus copias. Cada llamada mantiene sus parámetros y su contexto. No se ejecuta un programa Java: se interpretan exclusivamente nodos del subconjunto construido.

## Reglas de valores

- La división integral trunca hacia cero antes de convertir el resultado al tipo de la variable. `double b=35/10` recibe `3.0`; `35.0/10` produce `3.5`.
- La promoción numérica usa int, long, float o double según los operandos; char aporta su unidad UTF-16.
- Float se redondea a binary32 en las operaciones; los enteros se conservan con BigInt para no perder precisión en long.
- La concatenación se aplica cuando `+` tiene un operando String. Las comillas y el sufijo visual f no forman parte del contenido concatenado.
- Asignaciones y retornos aplican conversiones compatibles con su tipo declarado. Los parámetros no permiten el estrechamiento implícito de un literal int a char.
- Los casts anotados se aplican antes de la asignación. Las conversiones flotantes a enteros truncan, y los casts integrales conservan los bits correspondientes.
- Los errores de rango de literales y la división integral entre cero impiden obtener un valor. Las operaciones flotantes pueden producir Infinity o NaN.

La referencia técnica para promociones y casts es el [capítulo 5 de la especificación de Java](https://docs.oracle.com/javase/specs/jls/se25/html/jls-5.html), y para la división, [JLS 15.17.2](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.17.2).

Se conserva la política académica existente de señalar desbordamientos en operaciones enteras mediante `EVAL_OVERFLOW`, en lugar de presentar el resultado envuelto del Java ordinario. Esto es distinto de un cast explícito, que sí aplica su conversión.

## Accesos

Se evalúan Math.random con la regla escolar, Math.PI, Math.E y String.length() sin argumentos. Un acceso a un método del programador propaga el resultado ya convertido por RTN. Los constructores son referencias internas que permiten resolver ese acceso, sin inventar un token de valor para un objeto.

Otros accesos externos, operaciones con objetos como valores y asignaciones de objetos se notifican como pendientes si requieren una representación todavía no acordada. No se fabrican valores ni se llama a servicios externos.

## Resultados parciales

Una incidencia devuelve `status: 'partial'`, conserva el árbol numerado y los resultados independientes calculados, y deja `evaluation: null` en el nodo fallido y sus dependientes. Cada diagnóstico incluye `code`, `message`, `nodeId`, `operationNumber` y `source`.

Una división entre cero no provoca una fila nueva por cada padre bloqueado. Las incidencias se mantienen separadas de la tabla de errores existente hasta acordar la integración de salidas.

Se limitan las cadenas calculadas a 100 000 caracteres. La fuente y la construcción conservan sus límites previos. Los grafos mal formados se rechazan antes de evaluar mediante las comprobaciones de numeración.

## Referencias verificadas

En el ejemplo de `b`, las ocho operaciones tienen estos valores y tokens:

```text
1: 3 VTE       2: 'A' VTC    3: 25 VTE    4: 68 VTE
5: 5 VTE       6: 63 VTE     7: 53 VTE    8: 53 VTE
```

En Viernes, `'@'/10` da 6; ambos accesos a random dan 1.0; sus multiplicaciones por 2 dan 2.0; los casts dan 2; `6*2` da 12 y `2/3` da 0. La suma produce `12 / VTE`, RTN convierte a `12.0 / VTD` y el acceso al método conserva ese resultado.

## Alcance de formato y pruebas

El formato es académico: comillas escapadas, punto decimal visible en valores finitos double/float y sufijo f para float. No se promete reproducir byte por byte Double.toString o Float.toString para todas las magnitudes, especialmente su notación científica. El parseo decimal flotante usa Number y Math.fround; no implementa un conversor decimal arbitrario completo de Java. Se conserva la limitación del lexer sobre el preprocesamiento Unicode global.

Las expresiones constantes reconocidas incluyen literales, operaciones soportadas y variables con `final` inmediatamente antes de un tipo simple. Conocer el valor de una variable ordinaria no la convierte en una constante del lenguaje.

`tests/tree-evaluation.test.js` verifica ambos ejemplos completos, promociones, redondeo float, precisión long, concatenación, escapes, casts, parámetros y retornos, constantes, errores localizados, casos IEEE, límites y reproducibilidad. La evaluación deja las estructuras listas para la distribución visual del punto 7.
