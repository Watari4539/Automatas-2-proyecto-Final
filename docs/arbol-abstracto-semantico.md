# Árbol abstracto-semántico: acuerdos y referencias

Estado: punto 1 del plan de desarrollo, consolidación de reglas. No implementa el generador, la evaluación ni la vista. Este documento registra las explicaciones y dibujos del usuario; las decisiones pendientes no deben convertirse en reglas por defecto.

El punto 2 cuenta con un [modelo interno de nodos y árboles](modelo-del-arbol.md). Su contrato técnico conserva estas reglas y mantiene abiertas las decisiones de este documento.

El punto 3 incorpora un [constructor de expresiones](arbol-de-expresiones.md). La corrección del usuario establece dos niveles adicionales por cada par de paréntesis, resolviendo el caso `2*(3+4)`.

El punto 4 construye el [árbol desde PMAIN](arbol-del-programa.md). El usuario confirmó que los casos escolares no contienen varios SOUT y que el cast se anota junto al ID, sin nodo adicional.

## 1. Propósito y presentación acordados

El árbol representa las operaciones y las relaciones necesarias para obtener los valores del programa: expresiones, asignaciones, accesos, llamadas, parámetros y retornos. Se construye desde arriba hacia abajo. Una vez completo, las operaciones se numeran por niveles, desde abajo hacia arriba y de izquierda a derecha dentro de cada nivel.

Los nodos se mostrarán como círculos unidos por líneas, sobre una cuadrícula con desplazamiento mediante arrastre y zoom. Las marcas de nivel de los dibujos son explicativas: no aparecerán en la vista final. Sí aparecerán el número de operación, su valor y el token del valor.

Los niveles del árbol (altura horizontal compartida) y los niveles de operadores (prioridad para dividir una expresión) son conceptos distintos.

## 2. Identidad y etiquetas

- Todos los identificadores del programador reutilizan exactamente su `IDn` de la tabla de símbolos: clase, métodos, parámetros y variables.
- No existe una numeración nueva de símbolos para el árbol. El número de operación es independiente de `IDn`.
- El ámbito y la identidad del símbolo determinan qué declaración corresponde a un uso; no basta comparar nombres.
- Los elementos externos de Java, como `Math` y `random()`, conservan sus nombres, sin ID numerado del programador.
- Una asignación que se representaba como `a=` se etiqueta con el ID correspondiente, por ejemplo `ID3=`.
- Cada aparición de una variable desarrolla una copia completa de su derivación. No se comparten ramas visuales entre apariciones.
- Omitir un elemento del dibujo no altera los IDs de la tabla: el `package` no aparece en el árbol, pero puede haber consumido un ID.

## 3. Construcción de expresiones

Se desarrolla la expresión situada después de `=` y antes de `;`. En el ejemplo de una declaración, la asignación a la variable queda sobre esa expresión.

| Operador | Nivel base explicado |
| --- | --- |
| `+`, `-` | 1 |
| `*`, `/` | 2 |
| `.` | 3 |

Cada par de paréntesis envolvente suma **dos niveles** al operador: `+` tiene 1, `(+)` tiene 3, `((+))` tiene 5 y `((*))` tiene 6. La fórmula corregida por el usuario es `nivel base + 2 × profundidad de paréntesis`. En `2*(3+4)`, el `*` exterior tiene nivel 2 y el `+` interior tiene nivel 3; la raíz es `*`.

Se revisa siempre de derecha a izquierda, también dentro de cada subexpresión, buscando el operador de menor nivel. A igualdad de nivel se elige el primero encontrado desde la derecha, como en las restas del ejemplo. El operador binario genera dos ramas: la subexpresión situada a su izquierda y la situada a su derecha. Se repite el procedimiento en ambas.

Al encontrar una variable, se busca su declaración y se desarrolla su expresión. El ejemplo conserva un nodo de asignación entre la referencia y el valor. Las expresiones terminan en valores; los extremos externos como `Math` y `random()` requieren aún una regla específica. No se ha acordado aquí cómo representar operadores adicionales, unarios o conversiones en todos los casos.

## 4. Programa completo y detonadores

La raíz contiene el ID de la clase y `PMAIN`. El recorrido comienza en `main`; el `package` no participa en el dibujo.

Un detonador conduce a lo que se necesita desarrollar. En el ejemplo recibido:

1. `SOUT` es el detonador de `main`.
2. `SOUT` tiene un hijo `.` por el acceso `new Viernes().a(...)`.
3. El punto tiene a su izquierda el objeto, representado como el ID de la clase seguido de `()`, y a su derecha el ID del método.
4. Del método se pasa a `RTN`, y de ahí a la expresión del retorno.
5. Al encontrar un parámetro se consulta el argumento de esa llamada. Si el argumento es una variable del `main`, se desarrolla su declaración en ese contexto.

Los argumentos no se añaden inicialmente como ramas del punto en este ejemplo: se consultan cuando se resuelve el parámetro utilizado. Esto no define todavía el tratamiento de todos los argumentos o de sus posibles efectos.

## 5. Numeración y evaluación

- Un nivel agrupa los nodos situados a la misma altura horizontal, como en los dibujos. No se alinean todas las hojas en una sola fila: algunas terminan antes.
- Se recorre primero el nivel inferior completo, de izquierda a derecha; después el siguiente nivel superior, manteniendo el contador.
- Los literales no cuentan como operaciones.
- Sí cuentan los operadores explicados (`+`, `-`, `*`, `/`, `.`), las asignaciones a identificadores y RTN, según la aclaración del usuario en el punto 5.
- SOUT, llamadas, constructores, PMAIN y referencias de parámetros no reciben número. El cast anotado no añade una operación separada.
- No se sustituye este recorrido por un recorrido que termine toda una rama antes de pasar a otra.
- Tras construir y numerar, se evalúan las operaciones en ese orden, anotando el valor y el token de su tipo en cada operación.
- La división entre enteros produce un entero: `35 / 10` da `3`, no `3.5`.
- En el ejemplo, `'A'` conserva tipo carácter al asignarse a `a`; al sumarlo con `3`, aporta el valor numérico 65 y se obtiene el entero 68.

| Tipo de valor | Ejemplo de presentación | Token |
| --- | --- | --- |
| Entero | `3` | `VTE` |
| Double | `3.0` | `VTD` |
| Float | `3.0f` | `VTF` |
| Cadena | `"texto"` | `VTS` |
| Carácter | `'A'` | `VTC` |
| Booleano | `true` / `false` | `VTB` |

La precisión, el redondeo visual y la presentación de valores especiales no se han acordado. Se distinguen el valor interno, su tipo y el texto que se dibuja.

## 6. Referencia A: expresión con variable

Código explicado por el usuario:

```java
char a = 'A';
int b = 35/10+a-(23+2)/5-10;
```

Para fijar IDs verificables, se propone únicamente como envoltura documental:

```java
public class Expresiones {
    public static void main(String[] args) {
        char a = 'A';
        int b = 35/10+a-(23+2)/5-10;
    }
}
```

La tabla actual asigna `Expresiones → ID1`, `args → ID2`, `a → ID3`, `b → ID4`. Esta envoltura permite comparar símbolos; no resuelve qué detonador usar en un `main` sin salida.

Subárbol esperado de la declaración de `b`:

```text
ID4=
└── -
    ├── -
    │   ├── +
    │   │   ├── /
    │   │   │   ├── 35
    │   │   │   └── 10
    │   │   └── ID3=
    │   │       └── 'A'
    │   └── /
    │       ├── +
    │       │   ├── 23
    │       │   └── 2
    │       └── 5
    └── 10
```

Esta notación indica parentesco y orden de hijos, no posiciones finales en pantalla.

| Nivel desde abajo | Operación | Nodo / cálculo | Valor | Token |
| --- | --- | --- | --- | --- |
| 1 | — | Literales inferiores | — | — |
| 2 | 1 | `35 / 10` | `3` | `VTE` |
| 2 | 2 | Asignación a `ID3` | `'A'` | `VTC` |
| 2 | 3 | `23 + 2` | `25` | `VTE` |
| 3 | 4 | `3 + 'A'` | `68` | `VTE` |
| 3 | 5 | `25 / 5` | `5` | `VTE` |
| 4 | 6 | `68 - 5` | `63` | `VTE` |
| 5 | 7 | `63 - 10` | `53` | `VTE` |
| 6 | 8 | Asignación a `ID4` | `53` | `VTE` |

Los literales `5` y el último `10` están en niveles 2 y 4 respectivamente, sin número de operación. El código y el último dibujo fijan `'A'`, aunque dibujos anteriores mostraban otro carácter.

## 7. Referencia B: llamada desde SOUT

Transcripción normalizada para documentación del ejemplo del usuario:

```java
package asesorías;
public class Viernes {
    public double a(int x, String y) {
        int variable = (int)(Math.random()*2);
        return x*variable+variable/3;
    }
    public static void main(String[] a) {
        int num = '@'/10;
        System.out.println(new Viernes().a(num, "URIANGATO"));
    }
}
```

Normalizaciones de transcripción: `Package` pasa a `package`, las comillas tipográficas pasan a delimitadores Java y se añade el paréntesis de cierre faltante de `println`. No son cambios a la GLC ni al programa actual. Este ejemplo no se declara compatible con todas las restricciones del analizador existente.

IDs comprobados con la tabla actual sobre esta transcripción:

| Símbolo | Identidad | ID |
| --- | --- | --- |
| `asesorías` | Package | `ID1` |
| `Viernes` | Clase | `ID2` |
| `a` | Método | `ID3` |
| `x` | Parámetro del método | `ID4` |
| `y` | Parámetro del método | `ID5` |
| `variable` | Local del método | `ID6` |
| `a` | Parámetro del main | `ID7` |
| `num` | Local del main | `ID8` |

Aquí la raíz es `ID2 / PMAIN`, no `ID1 / PMAIN`: el package ocupa ID1 aunque no se dibuje. Sin package, la tabla podría asignar ID1 a la clase. Los dos símbolos llamados `a` son distintos.

Estructura de referencia, completando la segunda aparición de `variable` como pidió el usuario:

```text
ID2 / PMAIN
└── SOUT
    └── .
        ├── ID2()
        └── ID3
            └── RTN
                └── +
                    ├── *
                    │   ├── ID4
                    │   │   └── ID8
                    │   │       └── /
                    │   │           ├── '@'
                    │   │           └── 10
                    │   └── ID6 (int)
                    │       └── *
                    │           ├── .
                    │           │   ├── Math
                    │           │   └── random()
                    │           └── 2
                    └── /
                        ├── ID6 (int)
                        │   └── *
                        │       ├── .
                        │       │   ├── Math
                        │       │   └── random()
                        │       └── 2
                        └── 3
```

`(int)` conserva la anotación del dibujo. El usuario confirmó que se anotará junto al ID, sin nodo propio. Este dibujo usa identificadores sin `=` donde así los mostró el usuario; la unificación de etiquetas queda pendiente.

La llamada vincula `ID4` con el argumento `ID8`, e `ID5` con `"URIANGATO"`. El retorno no utiliza `ID5`, por lo que no se añade una rama para él en esta referencia. `ID8` desarrolla `'@'/10`, cuyo resultado entero es 6.

La [numeración de esta referencia](numeracion-del-arbol.md) está verificada con 13 operaciones, incluyendo RTN. El punto 6 verifica el resultado `12.0 / VTD` con la regla escolar de Math.random() siempre igual a 1.0 y el cast anotado. Dos copias dibujadas de la declaración no autorizan por sí solas dos ejecuciones independientes de `random()`.

## 8. Decisiones pendientes antes de cada implementación

| Tema | Qué falta acordar |
| --- | --- |
| Detonadores fuera del caso escolar | Se confirmó que no vendrán varios SOUT. Main sin detonador u otros cuerpos complejos quedan fuera del alcance actual. |
| Asignaciones posteriores | Qué definición desarrollar si una variable cambia antes de usarse; tratamiento de variables sin inicialización. |
| Identificadores y asignaciones | Cuándo mostrar `IDn` o `IDn=` en la vista. La referencia de parámetro actual no añade un número de operación. |
| Anotaciones de nodos estructurales | RTN ya se evalúa con su tipo declarado y las llamadas propagan ese resultado. Falta diseñar su presentación visual. |
| Conversiones adicionales | El cast anotado y la conversión del retorno ya se evalúan. Los casts internos que afectan solo parte de una expresión requieren ampliar su representación. |
| Elementos externos | Cómo terminan y se evalúan las ramas Math, random() y objetos. La regla de hojas con valores requiere esta precisión. |
| Otras fuentes de valores externos | Math.random() ya está fijado por el usuario en 1.0 para todas sus apariciones. Otros valores externos requieren reglas propias. |
| Tipos y operadores adicionales | Ya se evalúa el subconjunto numérico, booleanos como valores y concatenaciones. Faltan operadores unarios y otras operaciones aún no representadas por el constructor. |
| Llamadas y ciclos | Recursión, referencias circulares, sobrecargas, múltiples retornos y límites de expansión. |
| Errores y cobertura | Generación parcial o bloqueo; compatibilidad entre estos ejemplos y las restricciones de la GLC existente. |
| Presentación extensa | Precisión numérica, textos largos, tamaño de nodos y ubicación de valor, token y número. |

## 9. Criterios documentales para las siguientes etapas

- La referencia A debe reproducir la estructura y las ocho operaciones de su tabla.
- La referencia B debe conservar el enlace parámetro-argumento, la identidad de los dos `a` y las dos copias completas de `ID6`.
- Toda etiqueta de programador debe coincidir con la tabla de símbolos del mismo código, incluido el desplazamiento de IDs por package.
- Los casos aún abiertos no tienen resultados esperados inventados. Se completará esta especificación al recibir sus reglas.
- La construcción de expresiones y del programa ya tiene APIs independientes. La numeración también está implementada como fase independiente. La evaluación también está implementada como fase independiente. El punto 7 incorpora la [distribución horizontal y vertical](distribucion-del-arbol.md), independiente del visor interactivo pendiente.
