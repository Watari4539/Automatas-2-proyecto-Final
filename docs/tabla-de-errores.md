# Tabla de errores

## Presentación acordada

Una sola tabla con tres columnas:

1. **Número de fila:** línea del código fuente, base 1. Es la interpretación utilizada y anunciada al implementar; no es la fila de la tabla de símbolos. Internamente también se conserva la columna.
2. **Error:** categoría (Léxico, Sintáctico o Semántico) y fragmento original del código donde está el problema, en la misma celda. Por ejemplo: `2contador`, `int incompleto = ;` o `procesar(10)`. El nombre descriptivo del problema se conserva solo como metadato interno.
3. **Justificación:** explicación concreta de menos de 50 palabras.

El orden global es siempre léxico → sintáctico → semántico. Dentro de cada categoría se ordena por línea y columna. Los IDs sustituidos de la tabla de símbolos nunca se utilizan para analizar errores; se trabaja sobre lexemas originales.

Los resultados se presentan en páginas de 100 errores dentro de la misma tabla, conservando el orden entre páginas. Editar el código oculta ambas tablas y cancela el análisis pendiente.

## Léxico

Detecta identificadores que empiezan con número, números mal formados, cadenas y caracteres sin cerrar, caracteres vacíos o de varias letras, escapes inválidos, comentarios de bloque sin cerrar y caracteres ilegales fuera de literales/comentarios.

Las justificaciones describen lo que Java no acepta o requiere. `$` puede aparecer en un identificador; `@` pertenece a construcciones que están fuera del alcance y no se declara ilegal de forma global. Una palabra como `publik` puede ser un identificador léxicamente válido aunque no pueda ocupar la posición de un modificador.

Un operador válido de Java que aún no tenga token acordado (`<=`, `!=`, `&&`, etc.) se mantiene como aviso de cobertura, no como error léxico. Los bloques de texto con comillas triples se señalan como no revisados. No se realiza el preprocesamiento global de escapes Unicode ni una validación exhaustiva de todas las variantes Unicode del lenguaje.

## Sintaxis de la GLC

El registro `src/compiler/errors/grammar.js` conserva las producciones utilizadas y sus nombres. Todas las justificaciones sintácticas siguen el formato:

> En base a la regla gramatical X, se esperaba Y.

El analizador revisa el esqueleto de clase, declaraciones, métodos, main, parámetros, asignaciones, expresiones, acceso a miembros, objetos y retorno. Las expresiones compuestas usan precedencia aritmética convencional para obtener tipos y valores constantes; la GLC original no establece una precedencia explícita.

Refuerzo de sintaxis (16 de octubre de 2026), autorizado para reducir falsos positivos de la GLC:

- Se conserva el catálogo de reglas del curso como referencia y los nombres de las justificaciones; el reconocedor admite las ampliaciones descritas aquí.
- Package es opcional y admite nombres con puntos. Import admite rutas de varios segmentos y comodines.
- Clases y métodos pueden omitir el modificador de acceso. Se admiten métodos y campos static, y modificadores reconocidos como final.
- Los argumentos admiten expresiones, llamadas anidadas y creación de objetos. Las llamadas directas ya no generan un aviso por faltar en la GLC.
- Se admiten agrupaciones simples, signos unarios, incrementos/decrementos prefijos y posfijos, y casts a tipos primitivos. Se comprueba la compatibilidad numérica/booleana del cast; no se calcula su valor constante.
- Se revisan declaraciones en lista. Se reconoce null y su compatibilidad con referencias.
- Se reconocen declaraciones y creación básica de arreglos con aviso de revisión parcial. Herencia, implementación y tipos calificados conservan avisos de cobertura; no se certifica su semántica.
- Return puede aparecer en main; la semántica sigue rechazando valores retornados desde un método void.
- Las instrucciones de llamada, asignación y declaración requieren punto y coma.
- Las construcciones de control todavía no revisadas se omiten con aviso. No se añade soporte al árbol para esas construcciones por el hecho de aceptarlas en la tabla de errores.
- Se pueden revisar fragmentos de instrucciones con aviso de que no se validó el esqueleto completo.

Ante errores se intenta continuar en el siguiente punto y coma, cierre de bloque o inicio de declaración. Las expresiones dañadas no originan errores de tipos en cascada. No se exige que el reconocedor de símbolos valide la GLC: puede reconocer identidades en construcciones que esta gramática rechaza.

## Semántica

Se comprueba lo que puede deducirse del texto y de declaraciones visibles:

- Variables, tipos, métodos y miembros propios inexistentes o fuera de ámbito.
- Declaraciones duplicadas y firmas de métodos duplicadas.
- Compatibilidad de asignaciones, operaciones, operadores unarios y valores de retorno.
- Cantidad y tipos de argumentos. Se permiten ampliaciones numéricas, pero no estrechamiento implícito en llamadas: un int no se envía a un char.
- Constantes int pequeñas pueden asignarse a byte, short o char si están dentro de rango; esto no se aplica a parámetros.
- Retornos faltantes en métodos con resultado cuyo cuerpo haya sido revisado.
- Rango de literales y operaciones numéricas constantes. Se usan BigInt para evitar perder precisión al revisar enteros long.
- División o residuo enteros con divisor constante cero.

El desbordamiento aritmético constante se reporta como problema semántico del proyecto, aunque Java permita algunas operaciones con desbordamiento durante la ejecución. No se predicen valores de entrada ni desbordamientos dependientes de la ejecución.

Se incluyen firmas habituales de Math, String, Scanner y System.out/err. Un miembro externo sin firma conocida produce un aviso y tipo desconocido; no se inventa su retorno ni se asegura que el miembro exista. Los constructores se reconocen, pero su firma no se valida. Las sobrecargas que no puedan resolverse con los tipos conocidos dejan un aviso de cobertura.

No se implementan análisis de inicialización definitiva, flujo de todas las ramas, classpath, herencia, acceso privado entre clases, genéricos ni semántica de las construcciones omitidas. «Sin errores detectados» no equivale a certificación de Java completo.

## Organización y contrato

```text
src/compiler/errors/
  diagnostics.js   Formato, errores léxicos, etiquetas y orden global
  source-fragments.js  Fragmentos exactos del código para la columna Error
  grammar.js       Producciones y alcance del curso
  parser.js        Reconocimiento sintáctico con recuperación
  types.js         Tipos, conversiones y rangos numéricos
  semantic.js      Declaraciones, usos, operaciones, llamadas y retornos
  index.js         Coordinación y avisos de cobertura
src/ui/error-table.js  Presentación segura y paginación
```

El árbol interno de `parser.js` sirve solo para validar; no implementa la salida 3 (árbol abstracto semántico) que aún debe acordarse.

La API existente `requestAnalysis(source)` conserva las propiedades de símbolos y añade:

```text
errors: Array<{
  category: 'lexical' | 'syntax' | 'semantic',
  code: string,
  line: number, column: number,
  error: string,             // Fragmento del código original
  description: string,       // Nombre interno del problema
  sourceStart: number, sourceEnd: number, // Intervalo del fragmento [inicio, fin)
  justification: string,
  rule: string | null
}>
errorAnalysis: {
  complete: boolean,
  notices: Array<{ code, message, line, column }>
}
```

`status` sigue describiendo la generación de símbolos, por compatibilidad. `errors` expresa los problemas detectados y `errorAnalysis.complete` indica si hubo construcciones o límites que impidieron revisar alguna parte. Una lista vacía con `complete: false` siempre se muestra como revisión parcial.

## Verificación

Ejecutar `npm test`. `tests/errors.test.js` cubre orden entre categorías, posiciones, reglas sintácticas, recuperación, tipos, ámbitos, firmas y rangos, además de longitud y formato de las justificaciones. Se conservan las pruebas del punto 1.

`fixtures/Errores.java` produce errores de las tres categorías, incluso cuando las líneas aparecen en otro orden. `fixtures/ValidoGLC.java` es un ejemplo sin errores bajo las reglas revisadas. El ejemplo original `fixtures/Ejemplo.java` conserva su utilidad para símbolos, pero contiene construcciones que la GLC recibida posteriormente no permite.
