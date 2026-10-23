# Alcance y acuerdos

## Confirmado por el usuario

- Sitio web con caja de texto y botón verde «Generar», debajo y a la derecha.
- Entrada prevista: código Java relativamente sencillo, a lo mucho una clase con uno, dos o tres métodos y el main. Esto describe la intención; aún no se impone como límite de validación.
- Salidas: tabla de símbolos, tabla de errores, árbol abstracto semántico, cuádruplos y código de tres direcciones.
- Las convenciones de clase tienen que acordarse antes de construir el motor.
- Las tablas de símbolos y errores están implementadas. Las otras tres salidas siguen pendientes.

## Reglas recibidas para la tabla de símbolos

- Tres columnas: número de ID, lexema, token.
- Ignorar comentarios; separar por unidades léxicas en el orden original, no solo por espacios.
- Enumerar únicamente identificadores del programador: clases, métodos, parámetros, variables y paquetes.
- Reutilizar la identidad en apariciones posteriores. Entidades distintas con igual nombre tienen IDs distintos según su ámbito.
- En apariciones posteriores, sustituir el lexema por el ID correspondiente.
- Tokenizar usando las dos imágenes del catálogo y el ejemplo de `public static void mostrarProcesos(int limite) {`.
- `System`, `out`, `print`, `Math`, `random` y otros nombres externos reconocidos conservan token `ID`, sin número. Los puntos tienen token `CA`.
- `main` es `PMAIN` únicamente como método principal de Java.

Las decisiones de presentación y límites explícitos están en [tabla-de-simbolos.md](tabla-de-simbolos.md).

## Pendiente de conversar, sin decisiones tomadas

1. Ejemplos completos resueltos en clase que sirvan de referencia.
2. Subconjunto de Java permitido: tipos, declaraciones, operadores, expresiones, control de flujo, métodos, llamadas, entrada/salida y comentarios.
3. Reglas de tipos, conversiones, ámbitos, firmas y resolución de nombres.
4. Tokens de operadores ausentes del catálogo, como `<=`, `>=`, `!=`, `&&`, `||` y asignaciones compuestas.
5. Ampliaciones de las reglas de errores y de la GLC fuera del subconjunto acordado.
6. Casos pendientes del árbol abstracto-semántico: las reglas y referencias ya recibidas están en [arbol-abstracto-semantico.md](arbol-abstracto-semantico.md).
7. Convenciones de cuádruplos: campos, operadores, temporales, etiquetas y saltos.
8. Formato de tres direcciones y su relación con los cuádruplos.
9. Comportamiento de las salidas si una etapa falla, y ejemplos de resultados parciales si aplican.

## Dirección técnica provisional

El punto 1 del plan de desarrollo del árbol (consolidación de reglas y ejemplos) está documentado. Incluye desarrollo desde detonadores, expansión de variables y parámetros, reutilización de IDs, numeración por niveles y evaluación del ejemplo aritmético. Las decisiones abiertas están separadas de los acuerdos en su especificación.

El punto 2 está implementado como [modelo interno](modelo-del-arbol.md): identidad de cada aparición, relación con símbolos, hijos ordenados, ubicación del código y campos reservados para numeración y evaluación. El modelo aún no modifica las salidas de la interfaz.

El punto 3 ya construye [subárboles de expresiones](arbol-de-expresiones.md) mediante una API independiente, usando los IDs y ámbitos existentes. La referencia A está verificada como estructura y se aplica la regla corregida de dos niveles adicionales por cada par de paréntesis. La vista sigue pendiente.

El punto 4 implementa el [árbol desde PMAIN](arbol-del-programa.md), con llamadas, retornos y contextos de parámetros. El usuario confirmó un solo SOUT y el cast como anotación junto al ID. La referencia Viernes está verificada como estructura; la integración visual sigue pendiente.

El punto 5 implementa la [numeración por niveles](numeracion-del-arbol.md). El usuario confirmó RTN como operación adicional a operadores y asignaciones; SOUT, llamadas y constructores no se numeran. La numeración conserva los IDs y no depende de posiciones visuales.

El punto 6 implementa la [evaluación por niveles](evaluacion-del-arbol.md), con valores, tipos, tokens y formato. El usuario fijó Math.random() en 1 para todos los casos. Las dos referencias están verificadas; las incidencias de evaluación se conservan como resultado parcial sin fabricar valores dependientes.

La interfaz entrega el texto original a un módulo independiente mediante un Web Worker. La tabla de símbolos tiene etapas internas separadas para lexemas, ámbitos, resolución de nombres y presentación. Los cinco productos solicitados no presuponen cinco fases secuenciales: por ejemplo, los errores pueden originarse en distintas partes del procesamiento.

La tabla de errores distingue léxico, sintaxis y semántica en ese orden. Los avisos de cobertura evitan presentar como revisadas las construcciones que acordamos omitir. Ver [tabla-de-errores.md](tabla-de-errores.md) para las decisiones concretas.

## Acuerdos de errores y GLC

- Tres columnas: número de fila, error, justificación de menos de 50 palabras.
- Una sola tabla, ordenada primero por categoría (léxico → sintáctico → semántico), después por posición.
- Justificación sintáctica: «En base a la regla gramatical X, se esperaba Y».
- `package` opcional; si aparece se valida DPACKAGE.
- EXPC significa expresión compuesta. SOUT corresponde a System.out.print().
- No inventar reglas para las producciones incompletas: esas construcciones se omiten con aviso.
- Los errores léxicos describen las restricciones del vocabulario; los semánticos explican qué relación de nombres, tipos, parámetros o rangos falla y por qué.

El sitio es estático por ahora. No se introducen backend, persistencia, librerías de análisis ni ejecución de Java. Si aparecen requisitos de rendimiento, almacenamiento o visualización, se evaluarán con ejemplos concretos.
