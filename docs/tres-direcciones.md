# Tres direcciones — modelo, generación e integración

Estado: modelo, generación, planificación con pendientes y validación independiente implementados. `src/compiler/three-address/model.js` define el contrato y `src/compiler/three-address/index.js` implementa la etapa 2. La presentación visual y la integración en Generar están completas. La aplicación muestra cinco etapas disponibles.

## Notación confirmada

Solo hay tres temporales: T1, T2 y T3. La salida respeta el formato escolar, no otra convención de código intermedio.

- Operación: `T2. (2, +, T1)`.
- Asignación: `ID3 = T1`, `ID3 = ID4` o `ID3 = 5`.
- Retorno: `T1. (ID2, RTN, ID6)`.
- Salida: `T2. (PMAIN, SOUT, T1)`.
- Pendiente: `P4`, donde 4 es la operación del árbol, nunca el cuádruplo ni la fila impresa.
- Cierre sin número: `ID1 PMAIN -> T2`.

No se imprime el resultado numérico de cada operación ni las anotaciones FREE. Las asignaciones no reciben un temporal de destino. RTN y SOUT sí requieren uno, igual que +, -, *, / y punto.

## Contrato de datos

Cada operación y asignación guarda un `origin` con `quadrupleNumber`, `nodeId`, `treeOperationNumber`, `contextId` y ubicación de fuente. Es información interna: los IDs del programador nunca se sustituyen por sus nombres reales. Los campos `source` y `contextId` pueden ser null en subárboles sin contexto.

Los números de árbol y cuádruplo son independientes. Para construir el origen se debe relacionar el `nodeId` del cuádruplo con el nodo del árbol numerado. SOUT y algunas referencias no tienen número de operación del árbol: se conserva null; no se inventa un número P para ellas.

Clases de instrucciones:

- `operation`: destino Tn, dos operandos, operador y origen.
- `assignment`: ID de destino, valor y origen.
- `pending`: número de operación del árbol y origen. No ejecuta nada ni ocupa memoria.
- `closure`: cierre separado de la lista de instrucciones; clase, PMAIN y resultado almacenado.

Los operandos pueden ser literal, nombre externo Java, llamada externa con argumentos, constructor, PMAIN, temporal o valor guardado en un ID. `symbolIdentity` representa el ID de un método en RTN sin confundirlo con una lectura de variable. Los temporales y valores guardados en variables incluyen `producer`, el número del cuádruplo que produjo exactamente ese valor. Las copias del mismo ID en el árbol no se consideran intercambiables automáticamente.

Los datos son objetos y listas transferibles mediante structuredClone, sin DOM, funciones ni Map en la salida. Las fábricas validan la forma local, pero no certifican una secuencia ejecutable.

## Reglas de memoria para las etapas siguientes

1. Seguir inicialmente el orden de los cuádruplos y utilizar exclusivamente operandos disponibles.
2. Elegir el temporal libre de menor número **antes** de liberar los operandos consumidos. El destino no puede coincidir con ningún temporal leído, incluidos argumentos de llamadas externas.
3. Una asignación guarda el valor en el ID de destino y permite liberar su temporal de origen. RTN, SOUT y operaciones aritméticas guardan su resultado en otro temporal.
4. Liberar valores consumidos cuando no tengan usos pendientes. En el caso escolar habitual tienen un consumidor; el contador de usos evita perder resultados si un registro participa en más de una dependencia.
5. Una variable guarda una versión concreta identificada por su productor y contexto. No sobrescribirla si todavía se necesita su versión anterior. No crear IDs ficticios como memoria adicional.
6. Ante falta de espacio, registrar el pendiente numerable del árbol y buscar operaciones disponibles que permitan avanzar. Al retomarlo, emitir su instrucción normal; Pn queda en su posición histórica. No duplicar una operación ejecutada ni repetir el mismo aviso pendiente.
7. La reordenación debe conservar dependencias, contexto y efectos. RTN y SOUT no se adelantan simplemente para vaciar memoria si eso cambia la ejecución.
8. Si no existe una secuencia bajo estas restricciones, o se alcanza un límite de búsqueda, devolver un diagnóstico explícito; nunca reutilizar un temporal ocupado ni inventar un resultado completo.

`createMemoryState()` solo construye el estado inicial vacío. La asignación y liberación efectiva se implementan en la etapa 2; la búsqueda de pendientes se implementa en la etapa 3.

## Extensiones recientes del árbol

Los argumentos de substring/charAt pueden contener temporales o IDs y deben participar en el recuento de usos. Los constructores y objetos conservan su identidad sin ejecutar Java.

El operador CAST intermedio fue incorporado recientemente a los cuádruplos, después de acordar las reglas de tres direcciones. Todavía no tiene una regla confirmada de temporales. El modelo no lo acepta silenciosamente como operación ni elimina su conversión: la generación deberá señalarlo como no soportado hasta definir su representación. Los casts ya anotados en asignaciones conservan el comportamiento existente, sin crear una instrucción nueva.

## Etapas restantes

5. Presentación visual.
6. Integración y comprobación completa.


## Etapa 2 — API y comportamiento secuencial

`buildThreeAddress(tree, quadruples)` recibe el árbol evaluado completo (no el layout SVG) y sus cuádruplos. Valida la correspondencia con el validador existente de cuádruplos antes de generar. No reevalúa operaciones, ejecuta Java ni modifica las entradas.

Devuelve `instructions`, `closure`, `diagnostics`, `status`, `version` y una instantánea `memory` para inspección interna. Las instrucciones conservan su origen; la instantánea registra productores y usos restantes. El cierre consume el último resultado y libera el temporal correspondiente. Los datos soportan structuredClone.

Ejemplo: `int x=2+2; System.out.println(x*3);` produce conceptualmente:

```text
T1. (2, +, 2)
ID3 = T1
T1. (ID3, *, 3)
T2. (PMAIN, SOUT, T1)
ID1 PMAIN -> T2
```

La etapa 2 estableció el recorrido secuencial. La etapa 3 conserva ese recorrido cuando cabe en memoria y busca alternativas cuando no cabe. Las restricciones de memoria y versiones de IDs siguen vigentes; los diagnósticos específicos de bloqueo secuencial se sustituyen por los estados de planificación descritos abajo.

Los operadores no acordados, incluido CAST intermedio, producen `unsupported` antes de emitir instrucciones. Una secuencia estructuralmente generable cuyos valores aún no se hayan evaluado se devuelve como `partial`, con aviso; no se inventan resultados numéricos.

La suite `tests/three-address.test.js` cubre asignación y liberación, prioridad, RTN/SOUT, argumentos externos, agotamiento, sobrescrituras, conversiones no acordadas, entradas inválidas y aislamiento entre generaciones. La etapa 6 conecta esta API al botón Generar.


## Etapa 3 — planificación con pendientes

`src/compiler/three-address/scheduler.js` contiene el simulador de almacenamiento y el planificador. Primero prueba el orden original completo. Si falla, vuelve al estado inicial y realiza una búsqueda en profundidad iterativa, probando las operaciones disponibles por orden original. Puede retroceder sobre decisiones anteriores; memoriza estados agotados para no repetirlos. No recurre sobre la pila de JavaScript.

Una operación está disponible cuando sus productores están ejecutados y conservan sus valores, hay un destino libre y no se sobrescribe una versión aún necesaria de una variable. El destino se elige antes de consumir los operandos. Los SOUT mantienen su orden relativo y los RTN dependen de su expresión. El alcance continúa siendo el árbol escolar de expresiones, sin ejecutar código externo ni simular flujo arbitrario de Java.

Una asignación repetida al mismo ID puede conservar productores simultáneos únicamente si pertenecen al mismo contexto y sus resultados evaluados disponibles tienen exactamente el mismo tipo y valor. Esto permite desarrollar `x+x` sin inventar otro ID. Cada productor mantiene sus usos restantes; valores desconocidos, distintos o de invocaciones diferentes no se fusionan.

Solo después de elegir el plan definitivo se reconstruye la salida. Antes de adelantar una instrucción, se emite una vez Pn por cada operación anterior aún no ejecutada que tenga número del árbol. Al retomarla se imprime su instrucción normal; el marcador histórico permanece. Los nodos sin número de operación no reciben un P inventado. Los intentos descartados durante la búsqueda no contaminan la salida.

Ejemplo de orden de cuádruplos para `(1+2)+((3+4)*(5+6))`: 1, 2, **4, 3**, 5, 6. El resultado incluye P3 antes de ejecutar la multiplicación y retoma la suma pendiente después. El resultado numérico se conserva en 80. Otro caso adelanta una asignación al llenarse T1/T2/T3, imprime P4 y reutiliza el temporal liberado.

Límites configurables en el tercer argumento de `buildThreeAddress`:

- maxStates: hasta 10 000 estados visitados.
- maxSteps: hasta 100 000 intentos de operación.
- maxSearchRecords: hasta 256 cuádruplos para la búsqueda combinatoria. Las secuencias que caben en el orden original no necesitan esa búsqueda.

`planning` informa estados, intentos y si cambió el orden. Una búsqueda agotada devuelve blocked / THREE_NO_SCHEDULE; alcanzar un límite devuelve limit / THREE_SEARCH_LIMIT y no afirma que el problema sea imposible. Ambos conservan solo el prefijo secuencial seguro, sin cierre. Los casos completos tienen memory.pending vacío. No se añaden temporales ni memoria ficticia.

Pruebas: reordenación que libera variables, retroceso desde un bloqueo, índices Pn, resultados numéricos, prioridad, consumo múltiple, versiones incompatibles, límites y casos realmente irresolubles bajo estas reglas. La etapa 4 valida de forma independiente toda la salida.


## Etapa 4 — validación independiente

`validateThreeAddress(tree, quadruples, data)` está exportado desde `src/compiler/three-address/index.js` y se implementa en `validation.js`. Devuelve `{ valid, complete, diagnostics }`. No importa el planificador, no invoca el generador y no utiliza su simulador de memoria: reconstruye por separado el almacenamiento y los usos de los productores a partir de los cuádruplos validados.

Comprueba:

- Correspondencia exacta de instrucciones con sus nodos, contextos, ubicación, operadores y operandos originales.
- Productores disponibles antes de cada lectura, incluidos los argumentos de métodos externos.
- Exclusividad de T1/T2/T3, destino libre antes de consumir entradas, prioridad numérica y ausencia de autorreferencias.
- Conservación de versiones de variables todavía necesarias y condiciones estrictas para compartir valores idénticos.
- Una ejecución por cuádruplo y orden relativo de SOUT.
- Pendientes con numeración del árbol, sin duplicados ni omisiones, anunciados al adelantar operaciones y finalmente resueltos.
- Cierre con la clase correcta y el resultado final realmente disponible.
- Estado final de memoria, lista de operaciones completadas, estado success/partial y advertencias de valores sin evaluar.

El generador valida automáticamente sus secuencias terminadas. Añade `validation` al resultado y cambia el estado a invalid si la comprobación falla. La validación no certifica optimalidad del planificador ni recalcula Java. Los prefijos blocked/limit y las salidas unsupported/invalid/empty no reciben certificación como secuencias completas.

`valid: true, complete: false` indica una secuencia estructuralmente correcta cuyo árbol todavía tiene valores pendientes; no equivale a éxito completo. Las entradas mal formadas o los resultados alterados devuelven diagnósticos, sin aceptar su campo validation como evidencia.

La suite `three-address-validation.test.js` modifica deliberadamente temporales, productores, IDs, operadores, orígenes, Pn, cierre y memoria. También verifica omisiones, duplicaciones, referencias anidadas y salidas parciales. Se conserva la separación con la futura presentación visual.


## Etapa 5 — presentación visual

`src/ui/three-address/view.js` expone show, clear y destroy. La vista usa texto seguro, conserva los IDs y presenta la notación acordada sin resultados numéricos ni FREE. Los pendientes Pn se distinguen en ámbar; el cierre aparece al final. El resumen cuenta instrucciones, pendientes retomados y temporales utilizados.

Se muestran hasta 100 filas por página, con desplazamiento horizontal y controles de teclado. El cierre aparece únicamente en la última página. Cambiar resultados reinicia la paginación y elimina los datos anteriores. Solo se muestran secuencias success/partial con validación satisfactoria; los estados bloqueados, inválidos o no soportados muestran diagnósticos, sin presentar un prefijo como resultado completo.

La página `three-address-preview.html` prueba resultados normales, pendientes, paginación, evaluación parcial, bloqueo, operador no soportado, datos inválidos y limpieza. El formato está separado en `format.js` y los estilos en `view.css`. La etapa 6 conecta esta vista al flujo principal de Generar.


## Etapa 6 — integración y comprobación

`analyzeProgram` devuelve `threeAddressAnalysis` en todas las rutas, incluida entrada vacía, límite, árbol ausente y fallo interno. Reutiliza el árbol evaluado y solo genera cuando los cuádruplos están validados; la generación y validación de temporales ocurren en el Worker. Un fallo de esta fase no descarta las tablas, el árbol ni los cuádruplos.

`main.js` presenta la salida después de los cuádruplos, limpia la vista al editar o regenerar y conserva la cancelación por revisión de solicitudes. Los mensajes de éxito siguen ocultos. La quinta etapa queda disponible.

Verificación: 275 pruebas automatizadas aprobadas, incluyendo integración con Viernes, identidad de símbolos, transferencia structuredClone, reinicio entre generaciones, P4, evaluación parcial, CAST no soportado, memoria insuficiente y límites de entrada. En navegador se comprobó Generar a través del Worker, salida con P4, aviso de CAST y limpieza de la vista al editar.

### Cast en el retorno

Cuando un cast primitivo abarca el valor completo del return (por ejemplo `return (char)(d+e);`), se anota en el nodo `RTN (char)`. La evaluación convierte primero al tipo explícito y después al tipo declarado del método. No añade una operación CAST, un cuádruplo ni un temporal: RTN conserva su operación y su resultado convertido. Un cast interno, como `(int)3.8+1.5`, mantiene su alcance dentro de la expresión; no se traslada al retorno completo.

### Tabla de ocupación

La presentación conserva la notación en la primera columna. La segunda muestra T1/T2/T3 ocupados después de cada fila; usa «todos» para tres y «ninguno» para cero. Los Pn no alteran la ocupación y el cierre consume su temporal. `ui/three-address/occupancy.js` obtiene estas instantáneas de la secuencia validada, contando usos por productor (también argumentos externos), sin modificar ni reordenar las instrucciones. El cálculo abarca toda la secuencia antes de paginar.
