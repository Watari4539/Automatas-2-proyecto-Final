# Representación interna del árbol

Estado: punto 2 implementado en `src/compiler/tree/model.js`. Es una estructura independiente de la interfaz, del evaluador y del AST utilizado para revisar la GLC. No analiza código Java ni aparece aún entre los resultados de Generar.

## Contrato

`createTreeBuilder(symbols)` recibe la lista `symbols` del mismo análisis que produjo la tabla de símbolos. No vuelve a enumerarla. Devuelve `addNode(...)` y `build(rootId)`.

`addNode` devuelve un identificador interno como `node1`. Es único dentro del constructor y representa una aparición visual concreta. No es un ID del programador ni un número de operación. Los hijos se crean antes de su padre; eso es una técnica de almacenamiento, no el orden de evaluación ni una regla para analizar expresiones.

| Campo del nodo | Significado |
| --- | --- |
| `id` | Identidad de la aparición, generada por el constructor. |
| `kind` | Función del nodo. |
| `symbolId` | ID exacto de la tabla de símbolos, o `null`. |
| `text` | Operador, literal original o etiqueta de Java. Es `null` si existe `symbolId`. |
| `children` | IDs de hijos en orden izquierda-derecha; puede tener cero, uno, dos o más. |
| `source` | `{ start, end, line, column }` de su origen, o `null` cuando aún no se proporciona. |
| `contextId` | Contexto de llamada del nodo, o null en árboles aislados. |
| `declaredType` | Tipo declarado de asignación, parámetro o retorno; null cuando no aplica. |
| `constantVariable` | Marca una asignación final de tipo simple para reglas de constantes. |
| `castType` | Cast primitivo anotado junto a una asignación, o null. |
| `operationNumber` | Inicialmente `null`; reservado para la fase de numeración. |
| `evaluation` | Inicialmente `null`; reservado para `{ type, value, token }` al evaluar. |

Las posiciones usan la convención del lexer: offsets UTF-16, fin exclusivo, línea y columna desde 1. Si se proporciona una ubicación, los cuatro campos deben ser válidos. Para un nodo derivado de una declaración, la ubicación puede apuntar a esa declaración; el nodo padre de referencia puede apuntar al uso. El modelo conserva las ubicaciones que reciba, no resuelve referencias.

Clases disponibles:

| `kind` | Representación prevista |
| --- | --- |
| `entry` | Clase y PMAIN |
| `output` | SOUT |
| `operator` | Operador de expresión o acceso |
| `assignment` | Asignación a un símbolo |
| `literal` | Valor literal |
| `reference` | Referencia a variable o parámetro |
| `call` | Llamada a método |
| `constructor` | Construcción de objeto |
| `return` | RTN |
| `conversion` | Conversión, si posteriormente se acuerda un nodo propio |
| `external` | Elemento externo de Java |

Estas clases describen capacidad de representación. No determinan cuántos hijos exige cada construcción, si cuenta como operación ni cómo se evalúa. El usuario confirmó que el cast del ejemplo será una anotación `castType` junto al ID; ese caso no crea un nodo `conversion`.

Los nombres del programador permanecen en los metadatos `symbols` para trazabilidad; las etiquetas de sus nodos se basarán en `symbolId` y `kind`. Se impide proporcionar simultáneamente `symbolId` y una etiqueta libre `text`. La futura presentación decidirá los adornos acordados, como `=` o `()`, sin sustituir el ID por el nombre.

## Resultado y garantías

`build(rootId)` devuelve una instantánea de datos:

```js
{
  version: 1,
  rootId: 'node3',
  symbols: [/* copia de los registros recibidos */],
  nodes: [/* nodos identificados mediante id */]
}
```

- Cada constructor pertenece a un solo árbol y a una tabla de símbolos.
- Un símbolo inexistente se rechaza; IDs repetidos en la tabla de entrada también.
- Las aristas solo pueden apuntar a nodos previamente creados en el mismo constructor, lo que impide ciclos.
- Al finalizar, todos los nodos deben ser alcanzables desde la raíz y cada uno aparecer una sola vez. Se rechazan ramas compartidas y nodos desconectados.
- Para repetir una derivación se crean nodos nuevos en toda la rama, conservando los mismos `symbolId` que correspondan.
- El orden de `nodes` es de creación; no debe usarse para evaluar. El orden entre hermanos está en `children`.
- La instantánea tiene sus propios arrays y ubicaciones. Modificarla no modifica el constructor ni otra instantánea.
- El resultado usa datos transferibles mediante structured clone, compatible con `postMessage` del Worker. No contiene métodos, DOM, vínculos al padre ni coordenadas.

La fase de evaluación completa las anotaciones de una copia de la instantánea. `evaluation.type` será el tipo Java, `value` el valor interno y `token` el token del valor. No se convierte ahora un literal en valor evaluado ni se usa el texto de presentación para hacer cálculos. Structured clone permite conservar `BigInt` cuando el evaluador lo necesite para enteros; este contrato no promete serialización JSON de esos valores.

## Ejemplo de uso manual

```js
import { createTreeBuilder } from '../src/compiler/tree/model.js';

// symbols procede de requestAnalysis(source).symbols.
const builder = createTreeBuilder(symbols);
const value = builder.addNode({ kind: 'literal', text: "'A'" });
const assignment = builder.addNode({
  kind: 'assignment',
  symbolId: 'ID3', // ID de a en la referencia A documentada.
  children: [value],
});
const tree = builder.build(assignment);
```

Este ejemplo construye datos manualmente. El punto 3 ya incorpora un [constructor de expresiones](arbol-de-expresiones.md) para los casos acordados. El punto 4 añade [contextos de llamadas](arbol-del-programa.md), con metadatos `contexts` en el árbol del programa. El punto 5 aplica la [numeración por niveles](numeracion-del-arbol.md) sobre una copia del árbol. El punto 6 añade la [evaluación de valores y tipos](evaluacion-del-arbol.md). La distribución visual corresponde a etapas posteriores.

## Verificación

`tests/tree-model.test.js` comprueba integración con IDs reales (incluido package y nombres iguales en contextos distintos), expansión independiente de apariciones, orden de hijos, trazabilidad de código, rechazo de ramas compartidas, aislamiento de instantáneas y transferencia por structured clone.
