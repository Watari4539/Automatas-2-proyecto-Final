# Cuádruplos: contrato y referencia (etapa 1)

Estado: contrato de la etapa 1. La [etapa 2](generador-de-cuadruplos.md) ya implementa el generador independiente; la interfaz sigue pendiente. Esta fase usa el formato académico confirmado por el usuario, no lo sustituye por otra convención de código intermedio.

## Reglas confirmadas

Cada registro numerado tiene exactamente cuatro campos:

```text
n.- (operando izquierdo, operador, operando derecho, resultado)
```

- Los cuádruplos se derivan del árbol evaluado: se reutilizan identidad, estructura, orden y valores. No se recalcula Java ni se interpreta el dibujo SVG.
- Se conserva el recorrido por niveles completos, de abajo hacia arriba y de izquierda a derecha dentro de cada nivel.
- La numeración empieza en 1, es continua y propia de los cuádruplos. No cambia la numeración del árbol.
- Se numeran operadores, asignaciones a variables, asignaciones a parámetros, RTN y SOUT. Una asignación entre IDs también ocupa un registro.
- `[n]` referencia el resultado del cuádruplo n, nunca el número de operación del árbol. Debe existir y preceder al registro que lo utiliza.
- Cuando un operando viene de una variable ya asignada se usa el registro de esa asignación, no el nombre ni el ID como valor operando. El ID sí aparece como destino a la izquierda de `=`.
- Se conserva una fila por aparición desarrollada: dos copias de la misma variable no se fusionan. Un mapa global ID → último registro sería incorrecto; la referencia debe seguir la ocurrencia exacta del árbol y su contexto.
- El primer campo de RTN es el ID del método que contiene el retorno. Se obtiene del contexto del nodo; no del nombre del método ni del argumento.
- En SOUT el primer campo es PMAIN; el tercero referencia lo que se muestra y el cuarto conserva ese valor.
- El cierre `ID de clase PMAIN -> [registro final]` no lleva número y no es otro cuádruplo.
- Los casts no se imprimen, pero su efecto aparece en el resultado de la asignación.
- Se preservan comillas y formato de valores: enteros, double con decimal, float con sufijo f, cadenas entre comillas dobles y caracteres entre simples. El token se puede conservar internamente, pero no se añade como quinto campo.

Ejemplos confirmados:

```text
4.- (ID8, =, [1], 6)
5.- (ID4, =, [4], 6)
```

La posición concreta del segundo ejemplo depende de su nivel en el árbol completo; no obliga a colocar ambas asignaciones consecutivamente.

## Aplicación a llamadas y nodos estructurales

Para completar el ejemplo se aplica la regla de reutilizar registros también al acceso al método:

```text
13.- (ID3, RTN, [12], 12.0)
14.- (ID2(), ., [13], 12.0)
```

El nodo de llamada ID3 propaga el registro producido por su RTN. El constructor se conserva como operando `ID2()`, igual que en el árbol; no se inventa una instrucción de construcción adicional. Las hojas literales y externas tampoco crean registros propios. `Math` y `random()` conservan su grafía Java, sin ID de programador. Esta es la aplicación del formato al árbol actual; otros tipos de construcción o llamadas sin resultado quedan fuera del contrato de esta referencia.

SOUT y la raíz no tienen resultado evaluado propio en el modelo actual. Para la salida se toma el valor ya evaluado de su hijo; el cierre enlaza el registro de SOUT, sin calcular un valor adicional.

## Referencia completa: Viernes

Fuente: `fixtures/ArbolViernes.java`, sin modificar. Salida de referencia escrita explícitamente: `fixtures/ArbolViernes.cuadruplos.txt`. Este archivo es un resultado esperado para futuras pruebas, no una salida de un generador ya implementado.

| Identificador | Elemento |
| --- | --- |
| ID1 | package asesorías, no aparece en el cierre |
| ID2 | clase Viernes |
| ID3 | método a |
| ID4 | parámetro x |
| ID5 | parámetro y, no usado por el retorno |
| ID6 | variable local variable |
| ID7 | parámetro del main |
| ID8 | variable num del main |

```text
1.- ('@', /, 10, 6)
2.- (Math, ., random(), 1.0)
3.- (Math, ., random(), 1.0)
4.- (ID8, =, [1], 6)
5.- ([2], *, 2, 2.0)
6.- ([3], *, 2, 2.0)
7.- (ID4, =, [4], 6)
8.- (ID6, =, [5], 2)
9.- (ID6, =, [6], 2)
10.- ([7], *, [8], 12)
11.- ([9], /, 3, 0)
12.- ([10], +, [11], 12)
13.- (ID3, RTN, [12], 12.0)
14.- (ID2(), ., [13], 12.0)
15.- (PMAIN, SOUT, [14], 12.0)
ID2 PMAIN -> [15]
```

### Correspondencia verificable con el árbol

| Registro | Nivel del árbol | Operación del árbol | Significado |
| --- | --- | --- | --- |
| 1–3 | 2 | 1–3 | División y dos accesos a Math.random() |
| 4–6 | 3 | 4–6 | ID8 y dos multiplicaciones por 2 |
| 7 | 4 | Sin número | Asignación del argumento ID8 al parámetro ID4 |
| 8–9 | 4 | 7–8 | Dos asignaciones independientes de ID6 |
| 10–11 | 5 | 9–10 | Multiplicación y división del retorno |
| 12 | 6 | 11 | Suma |
| 13 | 7 | 12 | RTN del método ID3 |
| 14 | 9 | 13 | Acceso al método mediante ID2() |
| 15 | 10 | Sin número | SOUT |
| Cierre | 11 | Sin número | Clase ID2 / PMAIN |

En nivel 4, ID4 está a la izquierda de ambas apariciones de ID6, por eso su asignación es el registro 7. En nivel 8 solo hay constructor y llamada: no se emiten filas adicionales.

Los resultados provienen del evaluador actual: `'@'/10` da 6; Math.random() siempre da 1.0 según la regla escolar; los productos dan 2.0; las asignaciones con cast dan 2; `6*2` da 12 y `2/3` da 0. El retorno declarado double transforma 12 en 12.0. El argumento `"URIANGATO"` no participa en el árbol desarrollado porque su parámetro no se utiliza, por lo que no se añade un registro para él.

## Contrato de datos propuesto para la etapa 2

Separar los datos de la cadena visible:

- Registro: número, operando izquierdo, operador, operando derecho y resultado; además, ID del nodo de origen, contexto y ubicación para trazabilidad.
- Operando con clase explícita: literal, símbolo, elemento externo, constructor, PMAIN o referencia a registro. `[n]` se formatea desde una referencia numérica, no se descubre analizando texto.
- Resultado: valor, tipo, token y presentación procedentes de la evaluación existente, o estado pendiente explícito si no hay valor.
- Cierre separado: ID de clase, PMAIN y referencia al registro final. No consume número.
- Relación por ID interno de ocurrencia del árbol → registro productor. Una llamada puede reenviar el registro de su retorno sin emitir otro.

Estos requisitos ya se concretaron en la API de la [etapa 2](generador-de-cuadruplos.md), que recibe el árbol semántico evaluado antes de convertirlo en geometría: la distribución visual no conserva todo el contexto necesario para RTN y referencias.

## Criterios para las etapas siguientes

1. Reproducir exactamente los 15 registros y el cierre de la referencia.
2. Comprobar que cada referencia está resuelta y es anterior al registro consumidor.
3. Conservar ambas copias de ID6 y sus productores distintos, aunque sus valores coincidan.
4. Mantener intactos los IDs, valores y numeración del árbol de entrada.
5. No crear registros por tokens, nodos visuales decorativos o elementos no desarrollados en el árbol.
6. No usar un resultado inventado ante una evaluación parcial. El texto visible para un resultado pendiente se definirá en la etapa de validación/presentación.
7. No ocultar los errores de la GLC cuando el subconjunto del árbol sí permite producir cuádruplos.

Plan: etapa 1 contrato y referencia; etapa 2 generador independiente; etapa 3 validación; etapa 4 presentación; etapa 5 integración con Generar y comprobación final.

## Extensiones para conversiones intermedias y argumentos externos

- Los casts anotados en asignaciones conservan su formato anterior, sin agregar un registro de cast.
- Una conversión intermedia explícita se emite como `(operando, CAST, tipo, resultado)`, por ejemplo `(81, CAST, char, 'Q')`. Así el registro siguiente consume el valor convertido.
- Un método externo con argumentos conserva un operando estructurado `externalCall` con nombre y lista de operandos; su presentación es `substring(3, 4)` o `charAt([n])`. Cada argumento calculado referencia su productor previo y el validador compara esos argumentos con los del árbol.
- Una asignación de objeto conserva como resultado su identidad de clase (`IDn()`), con tipo interno object y token ID. El acceso posterior usa el registro de esa asignación.
