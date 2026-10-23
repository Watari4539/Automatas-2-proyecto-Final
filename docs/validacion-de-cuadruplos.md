# Validación de cuádruplos (etapa 3)

Implementada en `src/compiler/quadruples/validation.js`. El generador invoca esta comprobación antes de devolver una secuencia producida. No cambia la interfaz ni la conexión con Generar.

## API

```js
import { buildQuadruples, validateQuadruples } from '../src/compiler/quadruples/index.js';
const output = buildQuadruples(evaluatedTree);
const validation = validateQuadruples(evaluatedTree, output);
// { valid, complete, diagnostics }
```

La validación no regenera cuádruplos ni recalcula expresiones. Contrasta los datos recibidos con las ocurrencias, niveles, símbolos, contextos y anotaciones del árbol. No utiliza el campo `validation` que pueda traer la respuesta: puede comprobar de nuevo datos modificados sin confiar en una aprobación anterior. Ambas entradas permanecen intactas.

## Comprobaciones

- Forma general, versión y estados admitidos de la respuesta.
- Estructura del árbol evaluado y metadatos de símbolos/contextos.
- Cantidad de productores, numeración continua y correspondencia de cada registro con el nodo esperado en el orden por niveles.
- Identidad de ocurrencia, nivel, contexto y ubicación de origen.
- Operador y operandos exactos, incluyendo su clase estructurada.
- Referencias enteras positivas a registros anteriores existentes, y coincidencia con el productor de la rama concreta. Un registro anterior con el mismo valor no es un sustituto válido.
- IDs de la tabla, ID del método asociado a RTN y propagación del retorno en llamadas.
- Valor, tipo, token, representación y propiedad constant iguales a la anotación evaluada. Se comparan sin convertir BigInt ni confundir NaN con un fallo de igualdad.
- Resultados pendientes sin datos inventados y avisos correspondientes a sus registros y ubicaciones.
- Cierre sin número, con la clase correcta, PMAIN y el registro final de su rama; ausencia de cierre en subárboles sin PMAIN.

La validación toma el árbol evaluado como fuente de verdad. Verifica fidelidad de la transformación; no sustituye al evaluador ni certifica la validez Java/GLC del programa original.

## Estados

| Caso | valid | complete |
| --- | --- | --- |
| Secuencia consistente y todos sus resultados disponibles | true | true |
| Secuencia consistente con resultados pendientes | true | false |
| Referencias, IDs, resultados, orden o contrato incorrectos | false | false |
| Respuesta no generada o no compatible | false | false |

Cada diagnóstico de validación lleva `code`, `message` y `number` (null cuando afecta a toda la respuesta). Son incidencias del contrato, no errores Java que deban añadirse a la tabla de errores.

El generador añade `validation` a las secuencias producidas. Si la comprobación falla, marca `status: 'invalid'`, conservando los datos para diagnóstico; una futura vista no debe presentarlos como resultado correcto. `success` y `partial` solo se conservan cuando la validación pasa. Una construcción `unsupported` sigue devolviendo una secuencia vacía sin aprobación automática, y los errores de entrada del generador conservan sus TypeError existentes. La API explícita del validador devuelve diagnósticos para entradas ausentes o mal formadas cubiertas por su contrato.

## Pruebas

`tests/quadruples-validation.test.js` altera deliberadamente los registros de referencia para comprobar rechazo de referencias futuras, autorreferencias, productores equivocados con igual valor, IDs y métodos incorrectos, cambios de tipo/token/valor/formato, registros faltantes o extra, cambios de contexto y cierre, operandos ausentes y avisos incoherentes. También verifica secuencias válidas, evaluación parcial legítima, subárboles sin cierre, literales con corchetes y no mutación.

Las pruebas previas del generador y la comparación exacta con Viernes se conservan. La presentación monoespaciada corresponde a la etapa 4 y la integración a la etapa 5.
