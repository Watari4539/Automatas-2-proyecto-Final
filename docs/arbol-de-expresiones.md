# Construcción de árboles de expresiones

Estado del punto 3: implementados los casos acordados, incluida la referencia A completa como estructura y la corrección de dos niveles por cada par de paréntesis. El punto 4 amplía este motor con una API distinta para el [árbol del programa](arbol-del-programa.md); los límites siguientes describen la API de inicializadores aislados.

## API independiente

```js
import { requestAnalysis } from '../src/compiler/index.js';
import { buildExpressionTree } from '../src/compiler/tree/expressions.js';

const source = "char a='A'; int b=35/10+a-(23+2)/5-10;";
const analysis = requestAnalysis(source);
const b = analysis.symbols.find(symbol => symbol.name === 'b');
const result = buildExpressionTree(source, b.id);
```

En este fragmento sin envoltura, `a` es ID1 y `b` es ID2. En la referencia A con clase y main, son ID3 e ID4. El constructor solicita un ID, no un nombre: el ejemplo busca por nombre únicamente porque este fragmento tiene una sola variable llamada `b`.

La función reconstruye el contexto con los mismos módulos de léxico, ámbitos, resolución y tabla de símbolos que usa `requestAnalysis`. El código fuente y el ID deben pertenecer al mismo análisis. No altera la tabla de símbolos ni la de errores, ni se conecta aún a Generar o al Worker.

Devuelve `{ status, tree, diagnostics }`:

| Estado | Significado |
| --- | --- |
| `success` | Se pudo construir la estructura solicitada. No certifica validez semántica ni evalúa valores. |
| `unsupported` | Se requiere una regla pendiente o una etapa posterior. |
| `invalid` | Una referencia no se resuelve, hay una definición circular o la entrada no permite construir la expresión. |
| `limit` | Se alcanzó un límite de fuente, profundidad o nodos. |

En éxito, `tree` sigue el [modelo interno](modelo-del-arbol.md) y `diagnostics` está vacío. En los demás estados, `tree` es `null` y se devuelve una incidencia con código, explicación y ubicación cuando está disponible. No se presenta un árbol incompleto como si estuviera terminado. Estas incidencias no son filas nuevas de la tabla de errores Java.

Tipos incorrectos de argumentos de la API y límites de configuración inválidos lanzan `TypeError` o `RangeError`, como errores de uso de la API.

## Alcance construido

- Una declaración individual de variable local o campo, seleccionada por su ID.
- Inicializador comprendido entre `=` y `;`, excluyéndolos del análisis de la expresión.
- Literales del catálogo: entero, double, float, carácter, cadena y booleano, conservando su lexema original.
- Operadores binarios `+`, `-`, `*`, `/` y accesos simples externos con `.` como `Math.PI`.
- Revisión de derecha a izquierda; niveles base 1, 2 y 3, respectivamente, más dos veces la profundidad de paréntesis.
- A igual nivel se conserva el primer operador encontrado desde la derecha.
- Desarrollo recursivo de ambos operandos. Los grupos que envuelven una subexpresión completa se abren para desarrollar su contenido.
- Expansión de variables desde sus declaraciones, utilizando las relaciones de identidad y ámbito existentes.
- Nodos de asignación con `symbolId` y sin nombre libre de programador.
- Una copia completa y con nodos nuevos por cada aparición de una variable.
- Ubicación de cada operador y literal en el código original. El nodo de asignación expandido desde un uso conserva la ubicación de ese uso; sus hijos apuntan al inicializador de la declaración.

La referencia A documentada produce 15 nodos. Sus valores, tokens de resultado y números de operación permanecen pendientes: `evaluation` y `operationNumber` son `null` en todos los nodos. No se añade PMAIN ni SOUT alrededor del subárbol en esta etapa.

## Paréntesis: fórmula corregida

El usuario corrigió la regla: `nivel efectivo = nivel base + 2 × profundidad de paréntesis`.

En `(23+2)/5`, `/` tiene nivel 2 y `+` nivel 3; la estructura de referencia se conserva. En `2*(3+4)`, `*` tiene nivel 2 y `+` nivel 3: se selecciona `*` y después se desarrolla `3+4` en su rama derecha. Con dos pares envolventes, `+` tiene nivel 5 y `*` nivel 6.

Los antiguos casos pendientes `2*(3+4)` y `8/(3+1)` ya se construyen. Se mantiene una protección para formas no contempladas que aún seleccionaran un operador dentro de un grupo (por ejemplo, combinaciones no acordadas de acceso con expresiones agrupadas): se informa `TREE_PARENTHESES_RULE_PENDING` sin cortar el grupo ni inventar una derivación.

## Límites y casos reservados

No se desarrollan todavía llamadas, parámetros que necesitan contexto de llamada, construcciones de objetos, accesos a objetos del programador, conversiones, arreglos, operadores unarios ni operadores fuera de los cinco acordados. Tampoco se suponen valores para variables sin inicializador.

Las referencias externas se conservan como nodos externos: `Math` y `PI` en `Math.PI`. Eso no afirma que conozcamos su valor. `Math.random()` se informa como llamada pendiente.

Para evitar usar una definición posiblemente obsoleta:

- Si una variable local de la derivación tiene una escritura detectada entre su declaración y la declaración solicitada, se devuelve `TREE_REASSIGNMENT_PENDING`.
- Para campos, cualquier escritura detectada fuera de su declaración deja el desarrollo pendiente, porque aún no existe contexto de ejecución de métodos.
- La detección incluye asignaciones, asignaciones compuestas e incrementos/decrementos, también las referencias simples entre paréntesis. Es una comprobación conservadora; no es análisis completo del flujo de Java.
- No se sigue todavía la historia de valores de dependencias intermedias. Puede bloquear casos cuyo valor sería determinable con ese análisis, en vez de elegir una asignación sin regla.

Se protege la expansión mediante un conjunto de símbolos activos para detectar ciclos. Los límites son 100 000 caracteres de entrada, 128 niveles de anidamiento de fuente, 128 niveles de desarrollo y 5 000 nodos. Los límites de desarrollo pueden reducirse mediante `{ maxDepth, maxNodes }`, pero no elevarse por encima de esos máximos. La repetición exponencial de definiciones se interrumpe con una incidencia, sin recortar silenciosamente el árbol.

Los defectos léxicos y las incidencias estructurales detectadas en la fuente impiden construir. Otros elementos no soportados solo se revisan cuando participan en la derivación solicitada. Esta API no reemplaza la GLC ni el análisis semántico existente.

## Organización y verificación

- `tree/source-context.js`: preparación con los analizadores existentes, mapeo de símbolos, escrituras e intervalos de inicializadores.
- `tree/expressions.js`: API pública `buildExpressionTree` para inicializadores aislados.
- `tree/expression-engine.js`: selección de operadores y expansión de definiciones, compartidas con el constructor de programas.
- `tree/diagnostics.js`: interrupciones de construcción con estado y ubicación.
- `tree/model.js`: representación final, independiente de cómo se generó.

`tests/tree-expressions.test.js` verifica la referencia A, asociatividad, prioridades confirmadas, paréntesis anidados con la fórmula corregida, copias independientes, ámbitos, IDs con package, literales y comentarios, accesos externos, ciclos, errores, reasignaciones, límites y transferencia mediante structured clone. Las pruebas comparan la estructura de hijos; no dependen de coordenadas ni del orden de creación de los IDs internos.
