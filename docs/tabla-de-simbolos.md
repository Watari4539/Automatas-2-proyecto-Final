# Tabla de símbolos

## Formato y numeración

Exactamente tres columnas: `Número de ID`, `Lexema`, `Token`. Se conservan todas las apariciones y el orden original. Los comentarios y espacios exteriores a los literales no crean filas.

Decisiones de presentación expuestas durante la implementación:

- Numeración global `ID1`, `ID2`, … por primera aparición, reiniciada en cada generación.
- Se incluye la clase: en el ejemplo completo, `Ejemplo` es `ID1`, `mostrarProcesos` es `ID2` y `limite` es `ID3`.
- Primera aparición: ID en la primera columna y nombre original en lexema. Repeticiones: primera columna vacía y lexema `IDn`.
- La sustitución se aplica a variables, parámetros, métodos, clases y segmentos de paquete del programador. Los constructores explícitos se registran como métodos propios; `new Clase()` referencia al identificador de la clase.
- Los segmentos de `package escuela.proyecto` son dos lexemas con identidades distintas. Los segmentos de importaciones son externos y no se numeran.
- Firma principal: `public static void main(String[] args)`; puede variar el nombre del parámetro. Se acepta `String args[]` y `java.lang.String[]`. `main` no se numera cuando tiene token `PMAIN`. Un método ordinario homónimo recibe `ID` y su propia identidad.

Ejemplo para `int contador=1; contador=contador+2;`:

| Número de ID | Lexema | Token |
| --- | --- | --- |
| | int | TD |
| ID1 | contador | ID |
| | = | ODA |
| | 1 | VTE |
| | ; | FI |
| | ID1 | ID |
| | = | ODA |
| | ID1 | ID |
| | + | OPA |
| | 2 | VTE |
| | ; | FI |

## Catálogo

`src/compiler/lexical/catalog.js` centraliza las equivalencias de las imágenes. No cambiar tokens dentro del lexer o de la interfaz.

- Cadenas: un lexema con comillas, espacios y contenido, token `VTS`.
- Caracteres con comillas simples: `VTC`.
- Enteros: `VTE`; decimales: `VTD`; flotantes con `f`/`F`: `VTF`.
- `String`: `STR`; tipos primitivos: `TD`; `void`: `TM`.
- `null`: `_NU`, transcrito así de la imagen. `default` usa `DF` (la imagen contiene «deafult»).
- `abstract`: `MA`, según el material del curso.
- Los operadores compuestos se reconocen completos. Si no figuran en el catálogo, su token interno es `null` y la celda muestra «Pendiente», con un aviso. No se clasifican por semejanza ni se fragmentan para fingir tokens válidos.

## Etapas internas

1. **Lexer:** lexemas originales, categorías y posiciones. Trata comentarios, cadenas y caracteres por separado.
2. **Estructura:** declaraciones y ámbitos de clases, métodos, bloques, ciclos y `catch`. Registra declaraciones antes de resolver usos para admitir campos y métodos declarados más adelante.
3. **Resolución:** cada aparición se vincula a una entidad. Una variable local es visible desde su declaración. `this.campo` se resuelve en la clase aunque haya un parámetro homónimo. La variable del `for` deja de ser visible al salir del ciclo.
4. **Tabla:** IDs por primera aparición y sustitución de lexemas, preservando el original en metadatos.
5. **Interfaz:** tres columnas, avisos y páginas de 100 filas. Usa `textContent`; el código nunca se interpreta como HTML.

El Web Worker evita ejecutar el análisis en el hilo de la interfaz. Editar cancela el trabajo, invalida respuestas anteriores y oculta resultados desactualizados.

## Nombres externos

Las declaraciones del programa tienen prioridad: una clase propia llamada `Math` o una variable llamada `System` no se confunden automáticamente con la biblioteca.

Se reconocen raíces `java` y `javax`, tipos habituales de `java.lang`, importaciones explícitas y un registro de nombres comunes para `java.lang.*`, `java.util.*` y `java.io.*`. El registro ampliable está en `java-library.js`. Los miembros de receptores externos (`System.out.println`) y de objetos de tipos externos (`Scanner lector`) conservan sus nombres sin enumerarse.

Esto distingue procedencia; no valida la existencia de cada miembro en la biblioteca. Un nombre sin declaración visible ni origen conocido genera aviso. Java distingue mayúsculas: `Math` y `MAth` son diferentes.

## Contrato público

```js
import { requestAnalysis } from './src/compiler/index.js';
const result = requestAnalysis(source);
```

Función pura que exige una cadena y devuelve:

```text
status: 'empty' | 'success' | 'incomplete'
rows: Array<{
  id: string,                   // Primera columna, vacía en repeticiones
  lexeme: string,               // Segunda columna, puede ser IDn
  token: string | null,         // Tercera columna, null si falta regla
  originalLexeme: string,
  symbolId: string | null,      // Identidad también en las repeticiones
  line: number, column: number, // Base 1
  start: number, end: number    // Índices UTF-16, intervalo [start, end)
}>
symbols: Array<{ id, name, kind, declaration }>
diagnostics: Array<{ code, message, line, column }>
```

`declaration` es el índice del lexema de declaración, no una fila paginada. Un resultado `incomplete` conserva información útil, pero no debe consumirse como íntegro para etapas posteriores.

## Cobertura y límites

Orientado al Java sencillo del proyecto. No reemplaza `javac` ni valida toda la sintaxis o los tipos. Reconoce campos, métodos, constructores, parámetros, variables, tipos simples/calificados, arreglos, bloques, clases anidadas, `if`/`else`, ciclos, `switch`, `try`/`catch`/`finally` simples y llamadas propias y externas.

Las sobrecargas se distinguen por cantidad de parámetros y, si hace falta, por tipos exactos deducibles de literales, variables o llamadas propias. Si requieren conversiones, inferencia de expresiones o información externa, se informa la ambigüedad.

Sin cobertura validada todavía: genéricos, lambdas, referencias a métodos, anotaciones, interfaces, records, patrones, varargs, recursos de `try`, miembros heredados, bloques de texto multilínea y classpath de bibliotecas. No se realiza el preprocesamiento global de escapes Unicode de Java. Estas construcciones requieren ampliar el reconocimiento y sus pruebas.

Límites operativos: 100 000 unidades UTF-16 por entrada y 160 niveles de delimitadores anidados. Los avisos conservan línea y columna. La tabla de errores ya cuenta con un módulo independiente, documentado en [tabla-de-errores.md](tabla-de-errores.md); las tres salidas restantes siguen pendientes.

## Extender sin mezclar responsabilidades

- Tokens nuevos: catálogo y ejemplo esperado de prueba.
- Construcciones nuevas: reconocimiento de declaraciones/ámbitos y pruebas tanto de declaraciones como de usos.
- Bibliotecas: registro externo; nunca asumir que todos los nombres desconocidos pertenecen a Java.
- Formato de columnas: `table.js`. Cambios visuales: `src/ui` y CSS.
- Las siguientes etapas deben usar lexemas y entidades originales, sin reinterpretar celdas `IDn` de presentación.
