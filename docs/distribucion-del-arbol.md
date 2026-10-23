# Distribución del árbol (punto 7)

Estado: implementado como cálculo puro de geometría. El [punto 8](plano-interactivo.md) consume esta geometría para el visor con cuadrícula, arrastre y zoom; la conexión con Generar sigue pendiente.

## API

```js
import { layoutTree } from '../src/ui/tree/layout.js';
const layout = layoutTree(evaluatedTree);
```

Recibe el árbol construido o evaluado. Valida su estructura usando la numeración existente y no modifica la entrada. Devuelve datos serializables: `rootId`, `nodes`, `edges`, `bounds` y `config`. Pertenece a presentación (`src/ui/tree`), separado de las reglas del compilador.

Cada nodo conserva su ID interno, profundidad, nivel y número de operación; añade centro `x/y`, `radius`, caja reservada `bounds`, etiqueta íntegra `fullLabel`, líneas `labelLines/valueLines` y posiciones de etiqueta, número y resultado. Las aristas identifican padre e hijo e incluyen los puntos de su recorrido. Los límites globales incluyen un margen exterior y servirán para encuadrar el árbol en el visor.

## Distribución

1. Preparar las etiquetas usando `symbolId`, nunca el nombre del programador. La entrada usa ID y PMAIN en dos líneas; el constructor lleva `()`; las asignaciones llevan `=` y el cast junto al ID cuando corresponde. Esta convención de presentación no altera la identidad ni las operaciones del modelo.
2. Medir círculos y anotaciones. El número queda a la izquierda; el resultado y su token, a la derecha. Solo las operaciones muestran anotación de resultado; los valores originales de las hojas quedan en su etiqueta. Un resultado pendiente no se presenta como cero.
3. Dividir textos largos en líneas sin truncarlos. Se conservan el texto íntegro y los caracteres Unicode. El visor deberá usar fuente monoespaciada de tamaño `fontSize`, interlineado `lineHeight` y centrar verticalmente los bloques. La medición reserva una celda conservadora de `fontSize` por carácter; una futura fuente con glifos más anchos necesitaría medición real antes de distribuir.
4. Construir contornos izquierdo/derecho de cada subárbol por profundidad, desde abajo. Separar cada rama de todas las anteriores al menos `siblingGap` en cada nivel compartido. Esto evita reservar columnas vacías hasta el fondo para ramas que terminan antes.
5. Centrar cada padre entre el primer y el último hijo; un hijo único queda alineado con su padre. Mantener el orden de los hijos, incluyendo las copias repetidas de una variable.
6. Reservar la altura máxima de cada fila. Todos sus centros comparten la misma coordenada Y. Las hojas conservan su profundidad original; no se empujan a la última fila.
7. Conectar los bordes de los círculos mediante segmentos verticales y horizontales por el espacio libre entre filas. Las conexiones no atraviesan las etiquetas laterales ni los círculos de otros nodos. La vista podrá redondear las esquinas respetando ese recorrido.

Coordenadas en unidades del plano, independientes del tamaño de pantalla y del zoom. No se comprime el árbol para hacerlo caber en la ventana: el visor aplicará su transformación después. Los niveles sirven para calcular posiciones, no son etiquetas dibujadas.

Opciones positivas: `siblingGap` (32), `levelGap` (56), `padding` (32), `fontSize` (14), `lineHeight` (20), `maxLineLength` (24, entero), `minRadius` (28). Las opciones desconocidas o inválidas se rechazan.

El algoritmo es iterativo. Sus contornos ocupan O(n × h) en el peor caso, donde h es la profundidad; la construcción actual limita esa profundidad. No depende del orden físico del array de nodos.

## Verificación

`tests/tree-layout.test.js` comprueba los ejemplos de la expresión y Viernes, numeración y valores, IDs/casts, separación de cajas y conexiones, centrado de padres, ramas desiguales, textos extensos, Unicode, evaluación pendiente, un nodo aislado, una cadena profunda, determinismo, serialización, entrada inmutable y rechazo de datos inválidos.
