# Generador independiente de cuádruplos (etapa 2)

Implementado en `src/compiler/quadruples/index.js`. Todavía no se conecta al Worker, Generar ni a una sección visual. La [etapa 3](validacion-de-cuadruplos.md) ya comprueba automáticamente las secuencias producidas.

## API

```js
import { buildQuadruples } from '../src/compiler/quadruples/index.js';
const quadruples = buildQuadruples(evaluatedTree);
```

Recibe el árbol semántico evaluado (incluidos símbolos, contextos y anotaciones), no la geometría del visor. No llama al evaluador, no interpreta código Java, no modifica el árbol ni renumera sus operaciones originales. Reutiliza la función de numeración sobre una copia para obtener niveles canónicos y validar la estructura, sin confiar en coordenadas o números antiguos.

Devuelve `{ version: 1, status, records, closure, diagnostics }`; las secuencias producidas incluyen además `validation`. Si esa comprobación falla, el estado pasa a `invalid`:

- `status`: `success`, `partial` si faltan resultados evaluados, o `unsupported` si aparece una clase de nodo sin formato acordado.
- `records`: registros con `number`, `left`, `operator`, `right`, `result`, `nodeId`, `contextId`, `source` y `level`.
- `closure`: `{ classSymbolId, entry: 'PMAIN', target }`, o null para subárboles de expresión sin raíz PMAIN.
- `diagnostics`: incidencias de la transformación, separadas de la tabla de errores de Java.

Operandos estructurados:

| Clase (`kind`) | Datos |
| --- | --- |
| `literal` | `text`, incluyendo delimitadores del literal original |
| `external` | `text`, por ejemplo Math o random() |
| `symbol` | `symbolId`, destino de asignación o método de RTN |
| `constructor` | `symbolId`, destinado a presentarse como IDn() |
| `main` | Sin campos adicionales, se presenta como PMAIN |
| `register` | `number`, destinado a presentarse como [n] |

Un resultado disponible tiene `status: 'available'` y una copia de la anotación existente: valor, tipo, token, display y constant. Un resultado ausente tiene `status: 'pending'` y campos value/type/token/display nulos. No se sustituye por cero ni se genera texto ficticio. Los enteros conservan BigInt: los datos se transfieren mediante structuredClone/Web Worker; no se promete serialización JSON directa.

## Producción por ocurrencia

El recorrido usa niveles completos de abajo hacia arriba y de izquierda a derecha. Cada nodo productor recibe un registro continuo propio; un mapa por ID interno de nodo resuelve las referencias. Las asignaciones de parámetros (`reference`) producen `=` como las variables. Las llamadas del programador propagan el operando de su retorno sin añadir otra fila. Los constructores y hojas suministran operandos, sin registros adicionales.

RTN usa `contextId → methodSymbolId`. SOUT toma el resultado ya anotado de su hijo, porque el árbol no anota valor propio en SOUT. La raíz crea el cierre, sin número. Las copias de un símbolo siguen teniendo registros distintos; no se usa un mapa de último registro por symbolId.

Entradas no evaluadas, grafos inválidos, identidades faltantes, aridades incorrectas o contextos de retorno faltantes lanzan TypeError. Los nodos estructuralmente válidos pero sin formato acordado devuelven `unsupported` sin publicar un prefijo como secuencia completa.

## Verificación

`tests/quadruples.test.js` compara la salida estructurada, mediante un formateador exclusivo de pruebas, con `fixtures/ArbolViernes.cuadruplos.txt`. Comprueba también identidad de copias, no mutación, transferibilidad, independencia del orden de almacenamiento, uso de valores anotados sin recalcular, subárboles sin cierre, cadenas que contienen comas y corchetes, resultados pendientes y rechazo de entradas incorrectas.

La referencia completa conserva 15 registros y `ID2 PMAIN -> [15]`. La prueba de presentación no introduce aún un formateador ni una vista en producción.
