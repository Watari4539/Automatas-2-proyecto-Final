# Optimización de códigos intermedios — etapa 1

Estado: modelo y reglas definidos. No hay motor de optimización ni conexión con Generar o la interfaz. Las cinco salidas existentes permanecen independientes. Implementación del contrato: `src/compiler/optimization/model.js`.

## Entrada y aislamiento

La fuente es la salida validada y completa de buildQuadruples. Se conserva una copia original; nunca se modifica el árbol, los cuádruplos que ya se muestran ni la entrada de Tres direcciones. Una entrada parcial, inválida o con errores de origen no se presenta como optimización completa.

Los cuádruplos no demuestran por sí solos que una variable nunca cambia. PC requiere además evidencia del análisis de origen sobre asignaciones, ámbito y contexto. Si esa evidencia falta, se conserva la asignación. No se deduce constancia solamente porque el resultado evaluado esté disponible.

## Identidad, referencias y tipos

Cada registro recibe una identidad estable local a la ejecución (`q1`, `q2`, etc.), su número original, nodeId, contextId y posición de origen. Las referencias internas usan esa identidad; la numeración visible es una proyección de los registros supervivientes, continua desde 1. Las referencias dentro de argumentos de llamadas también se actualizan. No se confunden distintas apariciones de un ID ni llamadas en contextos distintos.

Al eliminar un registro se guarda su sustitución (literal tipado o referencia estable), se resuelven sus consumidores y se actualiza también el cierre. No puede quedar una referencia colgante, circular o a un productor posterior. La identidad desaparecida no se reutiliza para otro registro.

Los valores propagados conservan tipo, token y representación. Una asignación de 109 a double propaga 109.0; una de 35 a float propaga 35.0f. Se reutiliza la semántica de valores Java del motor, incluyendo división entera, promociones y casts. El resultado mostrado no debe redondearse para utilizarlo como valor interno.

## Reglas

- **SE:** identidades `x * 1`, `1 * x`, `x / 1`, `x + 0`, `0 + x`, `x - 0`. No incluye `0 - x` ni `1 / x`. No aplica suma numérica a concatenación de cadenas. Debe conservar tipo y valor, incluidas promociones y casos especiales de coma flotante; si reemplazar directamente por el operando no es equivalente, se conserva o se aplica otra técnica válida.
- **FO:** operaciones puras con operandos constantes; sustituye el registro por el resultado tipado. Un valor evaluado procedente de entrada externa no se convierte en constante por haber sido calculado en el árbol.
- **PC:** elimina la asignación de una variable demostrablemente constante y propaga el valor después de la conversión al tipo de destino. Se distingue identidad, contexto de llamada y ocurrencia; las copias del árbol no son por sí mismas reasignaciones del programa.
- **RS:** conserva la primera subexpresión equivalente y elimina repeticiones posteriores. Compara operador, operandos, tipos y contexto semántico; no compara solo el resultado numérico. No reordena operandos por conmutatividad ni fusiona llamadas o efectos. Una escritura que pueda alterar un operando impide reutilizar una expresión anterior.
- **Protegidos:** RTN, punto (`.`) y SOUT nunca se eliminan ni simplifican mediante estas técnicas. Sus referencias y numeración sí cambian. Esto incluye Math.random(), aunque el motor académico lo evalúe siempre como 1.0.
- Los operadores sin regla probada, como CAST intermedio, se conservan. No se inventan optimizaciones nuevas.

Para decisiones deterministas se recorren los registros en orden original y se repite mientras existan cambios válidos, con límites de trabajo. SE tiene prioridad sobre FO cuando ambas son posibles. PC se aplica a asignaciones; RS se usa cuando no corresponde la simplificación/folding del registro actual. Esta última elección es una convención de implementación: evita guardar una repetición que ya se puede sustituir por constante.

## Derivadas y trazabilidad

Una técnica recibe D únicamente si un cambio anterior habilita esa técnica en esa ocurrencia. Se guardan los eventos causantes, no solo una bandera. Haber cambiado el número del registro no la convierte en derivada.

Ejemplos: `[1] / 1` admite SE antes de propagar [1], por tanto es SE. Una asignación que pasa de referencia a constante admite PCD. Una suma que obtiene operandos constantes por propagación admite FOD. Un duplicado que ya era candidato a FO antes de RS no se convierte en FOD solo por eliminar otra copia.

## Salida y tabla

El resultado contiene originales, eventos cronológicos, filas de explicación, registros finales, mapa de números, cierre y diagnósticos. El modelo JSDoc describe cada estructura. Cada ejecución posee colecciones nuevas.

La tabla tiene una fila por registro original y cuatro columnas:

1. **Cuádruplo original:** intacto, con numeración original.
2. **Optimización:** técnica y D si corresponde; raya si no hay técnica.
3. **Cuádruplo afectado:** números ORIGINALES de los consumidores directos, sin duplicados; varios separados por comas. Si se afecta el cierre, se indica “cierre”. No se incluyen simples desplazamientos de numeración.
4. **Cuádruplo modificado:** transformación con su numeración vigente en ese paso y “→ ELIMINAR” cuando corresponda. Si no cambió antes de eliminarse, puede mostrar solo “ELIMINAR”. Los supervivientes muestran el cuádruplo final.

Si un registro recibe varias transformaciones, se conservan sus eventos ordenados dentro de la misma fila; no se pierde la explicación anterior. La tabla y la salida final son representaciones distintas: no se reconstruye la salida interpretando el texto de la tabla.

La presentación futura tendrá tres pestañas dentro de Cuádruplos: Originales, Optimización y Resultado final. Esta etapa no las implementa.

## Referencia acordada

Se suponen ID4 e ID3 constantes en este ejemplo.

| Original | Optimización | Afectado | Modificado |
|---|---|---|---|
| 1 (99, +, 10, 109) | FO | 2 | ELIMINAR |
| 2 ([1], /, 1, 109) | SE | 3 | 1 (109, /, 1, 109) → ELIMINAR |
| 3 (ID4, =, [2], 109.0) | PCD | 6 | 1 (ID4, =, 109, 109.0) → ELIMINAR |
| 4 (33, +, 2, 35) | FO | 5 | 1 (33, +, 2, 35) → ELIMINAR |
| 5 (ID3, =, [4], 35.0f) | PCD | 7 | 1 (ID3, =, 35, 35.0f) → ELIMINAR |
| 6 ([3], *, 3, 327.0) | FOD | 7 | 1 (109.0, *, 3, 327.0) → ELIMINAR |
| 7 ([6], +, [5], 362.0) | FOD | 8 | 1 (327.0, +, 35.0f, 362.0) → ELIMINAR |
| 8 (ID2, RTN, [7], 362.0) | — | — | 1 (ID2, RTN, 362.0, 362.0) |
| 9 (ID1, ., [8], 362.0) | — | — | 2 (ID1, ., [1], 362.0) |
| 10 (PMAIN, SOUT, [9], 362.0) | — | — | 3 (PMAIN, SOUT, [2], 362.0) |

Resultado esperado independiente para la futura validación: `fixtures/OptimizacionFacil.optimizado.txt`. Se mantiene RTN incluso con valor constante y se actualiza el cierre sin numerarlo.

## Etapa 2 — motor independiente

Implementado `optimizeQuadruples(input, options)` en `src/compiler/optimization/index.js`. Recibe la salida completa validada de cuádruplos. Devuelve originales, eventos, registros optimizados, mapa de números y cierre; `rows` queda reservado a la etapa 3 de construcción de la tabla explicativa. No está conectado al Worker ni a Generar.

`options.constantAssignments` contiene identidades qN de asignaciones cuya constancia ya fue comprobada por el análisis de origen. No basta con conocer el valor evaluado: sin esa evidencia PC conserva la fila. El adaptador que obtenga esta evidencia del programa se conectará en la integración; esta API no interpreta el código fuente. `hasSourceErrors` bloquea la ejecución. El límite máximo es de 2000 registros; puede reducirse mediante `maxRecords`.

El motor reutiliza lectura, conversiones y operaciones tipadas del evaluador. SE se aplica conservadoramente a identidades integrales que no cambien el tipo; los casos flotantes constantes pueden resolverse mediante FO. RS compara operandos literales/referencias estables, operador, contexto y tipo; las asignaciones conservadas, accesos y operaciones desconocidas interrumpen su bloque de búsqueda. Los casos no demostrablemente seguros permanecen sin optimizar.

Se recorren las ocurrencias en orden y se repite hasta que no haya eliminaciones. Cada cambio elimina un registro, por lo que la terminación está acotada. Las sustituciones alcanzan argumentos anidados y cierre. Los eventos contienen la fila inmediatamente antes de eliminarse, consumidores originales y causas de derivación. No se expone una salida parcial si la entrada es inconsistente.

Pruebas de esta etapa: ejemplo aprobado completo, aislamiento de entrada, constancia externa, PC sin evidencia, RS con referencias, división entera, promociones, bloqueo de entrada y límites. La validación exhaustiva y presentación corresponden a etapas posteriores.

## Etapa 3 — tabla explicativa

`buildOptimizationRows` (`src/compiler/optimization/rows.js`) construye una fila independiente por original y agrupa sus eventos en orden cronológico. `optimizeQuadruples` ya llena `rows` al finalizar correctamente. Cada evento de fila incorpora `affectedNumbers`, obtenidos de las identidades originales, ordenados y sin duplicados. Un superviviente conserva su versión final; un eliminado tiene `final: null`.

`src/ui/optimization/format.js` convierte estas estructuras en las cuatro celdas de texto: `original`, `optimization`, `affected`, `modified`. No crea HTML ni interpreta literales como etiquetas. Las transformaciones múltiples quedan separadas por saltos de línea dentro de la misma celda. Se muestra “cierre” si corresponde, y “—” cuando no hay técnica o consumidores. Los registros protegidos siguen visibles con sus referencias finales.

No se agrega aún la tabla al DOM ni se cambia la sección de Cuádruplos. Las pestañas corresponden a la etapa visual. La referencia de diez filas se comprueba celda por celda; también se cubren varios consumidores, cierre, registros intactos, eventos múltiples y aislamiento de los datos originales.

## Etapa 4 — validación automática

`validateOptimization(input, output, options)` reconstruye los pasos de eliminación y sustitución independientemente del generador. Comprueba originales intactos, snapshots intermedios, consumidores, causas anteriores, técnicas, tipos y valores de las sustituciones, protección de RTN/punto/SOUT, mapa de números, registros finales, cierre y tabla. La comparación estructural conserva BigInt, NaN y cero con signo y funciona en el navegador.

El motor la ejecuta antes de devolver éxito. Si detecta una inconsistencia devuelve `invalid` con diagnóstico y sin presentar registros o tablas parciales como válidos. No sustituye la validación del código Java ni demuestra por sí misma que la evidencia de constancia suministrada sea correcta: esa responsabilidad permanece en el análisis de origen de la futura integración.

Hallazgos corregidos: se acotaron FO/RS a los cuatro operadores aritméticos soportados por el evaluador; se rechazaron opciones y entradas mal formadas; RS derivada conserva también las causas de cambios de la primera expresión equivalente. Se mantienen los casos no soportados sin inventar resultados.

Cobertura: referencia aprobada, alteraciones deliberadas de resultados/referencias/historial/mapa/tabla/cierre, operaciones con enteros, double, float, char y cadenas, promociones, 30 cadenas de 12 dependencias, llamadas repetidas protegidas, contextos distintos, operadores desconocidos y argumentos anidados. La interfaz permanece sin cambios.

## Etapa 5 — presentación con pestañas

La vista de Cuádruplos recibe opcionalmente `optimization` en las opciones de `show`. Cuando contiene una salida validada, muestra Originales (selección inicial), Optimización y Resultado final dentro del mismo panel. Sin esa salida conserva la presentación anterior. Incluye contadores, tabla de cuatro columnas, paginación de 100 filas y desplazamiento horizontal local. El cierre aparece al final de la secuencia original o final, no como fila de optimización.

Las pestañas exponen roles ARIA y selección; admiten flechas, Home y End. Cambiar de pestaña reinicia su página; limpiar o generar otros resultados restablece Originales. Los textos se insertan mediante textContent. La tabla conserva encabezados horizontales y resaltado de filas.

Se puede comprobar en `quadruples-preview.html`, que ahora suministra resultados del optimizador independiente. La aplicación principal todavía no lo ejecuta: la conexión con Generar y la evidencia de constancia corresponden a la integración final. Se comprobó en navegador el cambio de vistas y la navegación por teclado; el inventario offline se regeneró con los módulos de presentación nuevos.

## Etapa 6 — integración completa

`analyzeProgram` incorpora `optimizationAnalysis` después de generar cuádruplos y antes de Tres direcciones, con manejo de fallos independiente. Los originales siguen siendo la entrada de Tres direcciones. `main.js` entrega la salida a la vista de pestañas; editar o volver a generar limpia todas sus vistas mediante el ciclo existente. Sin entrada completa o con errores de origen no se ofrece una optimización como válida.

`collectConstantAssignments` reutiliza el lector de estructura y la resolución de nombres de `prepareExpressionSource`: vincula cada asignación por nodeId/symbolId y rechaza símbolos con escrituras posteriores a su declaración, incluidas incrementos y asignaciones compuestas. Admite locales, campos y parámetros; el motor verifica por separado que el valor provenga de constantes antes de aplicar PC. No interpreta como constante una llamada externa aunque tenga un resultado evaluado.

Verificación final: 306 pruebas aprobadas, incluida integración con las salidas originales sin cambios, transporte de resultados, evidencia de constancia y limpieza de estados vacíos/erróneos. En navegador se apagó el servidor, se recargó la página y se generó el ejemplo Facil: 10 originales, 3 finales y 7 eliminados. Se verificaron las pestañas, limpieza al editar y regeneración. Caché actualizada con 58 archivos. La prueba física en iPhone continúa pendiente; no se publicó el repositorio automáticamente.

## Entrada alternativa de cuádruplos

La aplicación ahora recibe únicamente código Java. Se retiraron el selector de
modo y las entradas manuales por campos y texto, junto con su ruta en el Worker.
Los cuádruplos generados desde Java, sus pestañas de optimización y el resultado
final conservan su funcionamiento.

El lector de cuádruplos se conserva como utilidad interna para las pruebas del
motor. No se importa desde la aplicación ni se distribuye en la caché offline.
Las notas siguientes documentan sus reglas internas.

### Refuerzo tras pruebas adversas

En la entrada directa, los operandos de cálculo y los valores de asignación/RTN/SOUT deben ser literales o referencias anteriores `[n]`. Un ID se admite como destino de asignación/RTN o identidad estructural de un acceso, pero no como valor implícito: no se elimina su definición dejando un uso directo sin resolver. Los nombres desconocidos tampoco permiten certificar un cálculo arbitrario.

Las llamadas externas con argumentos se rechazan explícitamente en este modo hasta disponer de un parser estructurado para ellos; las llamadas sin argumentos como `random()` siguen admitidas. Esto impide esconder referencias inválidas o conservar referencias eliminadas dentro de texto opaco. El modo Java mantiene su soporte existente de llamadas.

Se admiten los mínimos decimales firmados de int y long en la entrada directa, conservando el rechazo de magnitudes fuera de rango. Pruebas de regresión incorporadas para estos casos; esta corrección no amplía el desarrollo de operadores unarios del árbol Java ni cambia la política académica de valores no finitos.

### Notación simbólica en la entrada manual
Se admiten `x`, `X` y `X.0` como resultado de Math.random(), y
coeficientes como `15X.0`. La entrada comprueba equivalencia de expresiones
afines (sumas, restas, productos por constantes y divisiones entre constantes)
con un lector acotado, sin ejecutar texto. Se conserva la escritura del resultado
introducido. Esto valida la notación; no añade una nueva técnica de optimización
ni convierte resultados simbólicos en constantes.

Se normalizan comillas tipográficas y se admite la abreviatura
`([2], / [3], resultado)`. Se verifica la longitud de cadenas literales en
length(); los accesos a métodos mediante IDs propagan su retorno.
Expresiones simbólicas fuera de esa equivalencia limitada siguen requiriendo
el formato exacto del evaluador.

### Excepción para length() constante
El punto sigue protegido salvo el acceso sin argumentos `length()` sobre un
literal String. En ese caso se aplica FO, se elimina el registro y se sustituye
cada referencia por su longitud entera (unidades UTF-16, igual que Java).
Si la cadena pasa a ser literal por PC o FO previos, corresponde FOD.
No se usa solamente el resultado anotado como evidencia: el receptor debe ser
una cadena constante. Math.random(), cadenas simbólicas y otros accesos siguen
protegidos.

## Referencia de clase: lectura, substring y longitud

El ejemplo de 17 cuádruplos del 1 de noviembre se conserva como prueba en
`tests/optimization-classroom.test.js`. Sus eliminaciones son:

| Original | Técnica | Motivo |
| --- | --- | --- |
| 2 | PC | ID5 recibe la constante 1 y no cambia. |
| 5 | FOD | PC permite calcular 1 + 1. |
| 6 | FO | 7 * 7 contiene constantes desde el inicio. |
| 7 | FOD | El registro 5 se sustituye por 2: 2 * 15. |
| 8 | FOD | El registro 6 se sustituye por 49: 50 - 49. |
| 10 | SED | Los cambios anteriores permiten 30 / 1; SE tiene prioridad sobre FO. |
| 11 | FO | substring(0,4) tiene longitud 4 si termina correctamente, aunque su contenido sea desconocido. |
| 12 | PCD | ID7 recibe 30 tras las eliminaciones; la sustitución conserva el tipo double: 30.0. |
| 13 | PCD | ID8 recibe 4 tras FO; no es SED porque es una asignación, no una identidad aritmética. |
| 14 | FOD | 30.0 * 4 se sustituye por 120.0. |

Permanecen los originales 1, 3, 4, 9, 15, 16 y 17, renumerados 1–7.
El retorno conserva la conversión a char (`120.0` → `'x'`) y no se elimina.
Las referencias de la columna «afectado» usan números originales; las del
cuádruplo modificado usan la numeración de ese estado o la final.

La inferencia de longitud recorre referencias y asignaciones de String y solo
acepta límites enteros conocidos. Nunca deduce constancia de un valor anotado
como resultado. Conserva la llamada substring, incluso si su resultado deja de
usarse: podría lanzar una excepción y no debe desaparecer. No convierte el
contenido desconocido en una cadena literal. Con límites desconocidos no aplica
FO. Si los límites se conocen gracias a otra optimización, corresponde FOD.
La misma longitud conocida se conserva en la evaluación simbólica del árbol para
que sus valores, los cuádruplos y la optimización sean coherentes.

La prueba usa Scanner como entrada estructurada al motor de optimización; no
incorpora soporte nuevo para ejecutar lecturas de consola en el analizador Java.

## Dos referencias adicionales: propagación y reutilización encadenada

`tests/optimization-classroom-reuse.test.js` registra las dos hojas adicionales:

- **22 → 12 registros:** FO en 1, 6 y 7; PC en 3 y 15; PCD en 2, 4 y 9;
  FOD en 5 y 8. Se conserva la lectura externa, su longitud desconocida y las
  operaciones que dependen de ella. `'A'` se convierte a `65` al propagarse desde
  la asignación entera. `3/2` da `1`; `3.1416f` conserva el tipo float. El cierre
  cambia de `[22]` a `[12]`.
- **21 → 13 registros:** RS en 2; RSD en 4, 6, 8 y 12; PC en 9; FO en 10 y 13.
  Primero se reutiliza la definición de Scanner, luego su lectura, la longitud,
  la asignación y la multiplicación. El cierre apunta al registro final 13.

Las referencias originales son la autoridad para las dependencias, no las
expresiones abreviadas del resultado manuscrito. En la primera hoja `(18*y)/5`
no puede sustituirse por `3*y`: con y=2 la división entera da 7, no 6. Tampoco se
invierte el signo de la resta final ni se reagrupan operaciones float, que tienen
redondeo. Las pruebas calculan los resultados tipados respetando ese orden.

### Evidencia necesaria para RS

Los operandos se comparan por su valor y tipo, no por si un literal ya incluye
metadatos producidos por FO. Los registros anteriores son valores estables y
pueden reutilizarse aunque haya asignaciones intermedias. Se distinguen el orden
de operandos, los tipos, el cero positivo y el negativo y los contextos de llamada.

`equivalentRecords` contiene grupos de IDs internos qN que representan copias de
una misma operación fuente. `collectEquivalentRecords` los obtiene del árbol,
usando ubicación, identidad y contexto de llamada. Permite RS para asignaciones y
accesos duplicados; no permite eliminar RTN ni SOUT. Dos llamadas escritas por
separado nunca se agrupan solo porque su texto o resultado simbólico coincidan.
Los ejemplos de Scanner se prueban como cuádruplos estructurados con esa evidencia;
esto no amplía el soporte de Scanner del analizador Java.

`length()` sobre el mismo valor String puede reutilizarse aun si su longitud es
desconocida. Esto es RS/RSD, no FO. El validador exige la evidencia para las
operaciones que pueden tener efectos y comprueba la etiqueta RSD frente a los
operandos originales. Las sustituciones mantienen trazabilidad, numeración y cierre.
