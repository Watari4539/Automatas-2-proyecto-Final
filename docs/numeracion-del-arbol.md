# Niveles y numeración de operaciones

Estado: punto 5 implementado en `src/compiler/tree/numbering.js`. Recibe un árbol ya construido y devuelve una copia numerada; no evalúa valores ni calcula coordenadas.

## Regla confirmada

Se recorren niveles completos de abajo hacia arriba y, dentro de cada nivel, de izquierda a derecha. El contador comienza en 1 y continúa entre niveles.

El usuario confirmó que, además de operadores y asignaciones, **solo los return** se numeran entre los nodos estructurales consultados. La clasificación actual es:

| Nodo | ¿Recibe número? |
| --- | --- |
| Operador (`+`, `-`, `*`, `/`, `.`) | Sí |
| Asignación a un ID | Sí, por cada aparición |
| `RTN` | Sí |
| `SOUT`, PMAIN/clase, llamada y constructor | No |
| Literal, elemento externo y referencia de parámetro | No |
| Cast anotado junto a un ID | No añade una operación separada |

Las referencias de parámetros conservan su clase `reference`: no se convierten en asignaciones. Los nodos de asignación ya existentes sí se numeran, aunque sean copias de la misma definición y compartan `symbolId`.

## Uso

```js
import { buildProgramTree } from '../src/compiler/tree/program.js';
import { numberTreeOperations } from '../src/compiler/tree/numbering.js';

const result = buildProgramTree(source);
if (result.status === 'success') {
  const numberedTree = numberTreeOperations(result.tree);
}
```

También acepta el árbol de `buildExpressionTree`. Los constructores conservan su responsabilidad: producen la estructura sin numerar; esta función aplica la fase siguiente explícitamente. No cambia las tablas ni se conecta aún a Generar.

## Datos añadidos

| Campo del nodo | Convención |
| --- | --- |
| `depth` | Profundidad desde la raíz, que tiene 0. |
| `level` | Nivel desde abajo, comenzando en 1 para la fila más profunda de todo el árbol. |
| `levelIndex` | Posición de izquierda a derecha en esa fila, desde 0, incluyendo los nodos que no son operaciones. |
| `operationNumber` | Número continuo de operación, o null. |

`level = profundidad máxima del árbol - depth + 1`. Las hojas que terminan antes permanecen en su altura; no se empujan todas al nivel inferior. Un nivel sin operaciones tampoco consume números.

El árbol incorpora `numbering`:

- `operationKinds`: clases numeradas (`operator`, `assignment`, `return`).
- `operationCount`: total de operaciones.
- `operationOrder`: IDs internos de los nodos en orden de operación, para la evaluación.
- `levels`: filas de abajo hacia arriba con `{ level, depth, nodeIds }`; los IDs de cada fila están de izquierda a derecha.

Estas identidades internas no son IDs de la tabla de símbolos. Ningún `symbolId` se modifica.

## Orden y separación de la vista

Una cola recorre el árbol por profundidad y conserva el orden de `children`. Después se recorren las filas desde la última hacia la primera, sin invertir el orden dentro de las filas. No se usa un recorrido que termine toda la rama izquierda antes de procesar la derecha.

El orden no depende del array `nodes`, del número de sus IDs, de la posición en el código ni de coordenadas visuales. La distribución futura debe mantener el orden de hijos y la alineación de cada profundidad; zoom y desplazamiento no cambian la numeración.

La implementación es iterativa, con tiempo y memoria proporcionales al número de nodos. Antes de numerar comprueba raíz existente, IDs únicos, hijos existentes, ausencia de ciclos/ramas compartidas y conexión de todos los nodos. Un árbol estructuralmente inválido lanza `TypeError`, sin devolver una numeración parcial.

Se utiliza structured clone para conservar símbolos, contextos, casts, ubicaciones y valores que pudieran estar anotados, incluidos BigInt. La entrada no se modifica. Volver a numerar reinicia los números y limpia cualquier número antiguo de nodos que no cuentan como operación.

## Referencias verificadas

El ejemplo de `b` tiene seis niveles y ocho operaciones: división, asignación a `a`, suma `23+2`, suma izquierda, división derecha, primera resta, segunda resta y asignación a `b`. Los valores `5` y el último `10` permanecen en los niveles 2 y 4, sin número de operación.

Para `fixtures/ArbolViernes.java`:

| Operación | Nodo | Nivel |
| --- | --- | --- |
| 1 | División de `'@'/10` | 2 |
| 2–3 | Los dos accesos a Math.random | 2 |
| 4 | Asignación ID8 (num) | 3 |
| 5–6 | Las dos multiplicaciones por 2 | 3 |
| 7–8 | Las dos asignaciones ID6 (variable) | 4 |
| 9 | Multiplicación del retorno | 5 |
| 10 | División del retorno | 5 |
| 11 | Suma del retorno | 6 |
| 12 | RTN | 7 |
| 13 | Acceso al método de Viernes | 9 |

La numeración de ambas copias no implica ejecutar dos veces una inicialización ni decidir los valores de random(). El punto 6 ya aplica la regla escolar de Math.random() siempre igual a 1.0, indicada por el usuario.

Las pruebas están en `tests/tree-numbering.test.js`: referencias completas, alturas desiguales, recorrido por filas, independencia del almacenamiento, conservación de datos, repetibilidad y rechazo de grafos inválidos.
