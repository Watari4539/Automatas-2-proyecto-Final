# Refuerzo de generación del árbol

Se centralizó la lectura del alcance de casts primitivos en `src/compiler/tree/casts.js`. La misma regla se utiliza en expresiones, inicializadores y retornos. Los accesos y llamadas forman parte del operando del cast; las operaciones aritméticas exteriores permanecen fuera de él. Los paréntesis que envuelven toda la expresión son transparentes.

Correcciones verificadas:

- `int x=(int)2.9+3` desarrolla una conversión local y suma, resultado 5; ya no rechaza todo el inicializador.
- `(int)Math.random()` convierte el resultado de la llamada, no el receptor Math; resultado académico 1.
- `(int)Math.random()*2` conserva la multiplicación exterior; resultado 2.
- Un cast completo agrupado como `((int)(2.9+3.5))` se anota junto al ID y produce 6.
- `return (int)Math.random()` anota el cast en RTN sin agregar otra operación de conversión.

Se conservan la numeración por niveles, las identidades por ocurrencia, la fórmula académica de prioridad y los límites de expansión. Las pruebas verifican valores, estructura conectada, ausencia de ciclos/nodos compartidos, contextos de llamadas repetidas y 40 expresiones generadas con resultados independientes.

324 pruebas totales aprobadas. Inventario offline actualizado. No se amplía aquí el soporte de reasignaciones, `this`, unarios ni CAST intermedio en Tres direcciones: sus avisos continúan indicando las limitaciones existentes.
