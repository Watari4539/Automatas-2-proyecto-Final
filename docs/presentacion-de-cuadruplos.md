# Presentación visual de cuádruplos (etapa 4)

Componente visual reutilizable. La [etapa 5](integracion-de-cuadruplos.md) ya lo conecta con Generar y el Worker. La página `quadruples-preview.html` permite comprobar Viernes, una secuencia real de 128 registros, evaluación parcial, rechazo de datos inválidos y limpieza de resultados.

## Archivos y API

- `src/ui/quadruples/format.js`: texto de operandos, registros y cierre, conservando exactamente el formato acordado.
- `src/ui/quadruples/view.js`: `createQuadruplesView(host)` devuelve `show(data)`, `clear()` y `destroy()`.
- `src/ui/quadruples/view.css`: tipografía monoespaciada, tonos verdes, filas alternadas y estados pendientes.
- `src/ui/quadruples/preview.js`: ejemplos independientes usando construcción, evaluación, generación y validación reales.

La vista recibe una respuesta del generador con `validation.valid === true` y estado success o partial. Los resultados invalid/unsupported o sin validación muestran avisos, sin publicar sus registros como una salida correcta. La validación se realiza antes de la vista; el componente no recalcula el árbol ni sustituye el validador.

## Presentación

Cada fila contiene `n.- (izquierdo, operador, derecho, resultado)`. Los resultados ausentes se muestran explícitamente como `Pendiente` y las filas usan un tono ámbar. Las secuencias completas solo muestran el contador de registros y pendientes, sin explicaciones de relleno.

Se muestran hasta 100 registros por página. Los números y las referencias siguen siendo globales; cambiar de página no renumera nada. El cierre aparece sin número, en una franja verde al final de la última página. Un subárbol sin cierre no muestra una franja vacía. Anterior/Siguiente se ocultan si solo hay una página, y se desactivan en los extremos cuando hay varias.

El área tiene desplazamiento vertical y horizontal con foco de teclado; las filas mantienen su formato en pantallas estrechas. Al cambiar de página vuelve al inicio del área. Los cambios de ejemplo o de respuesta reinician la página y eliminan los resultados anteriores. El texto se inserta con textContent, nunca con HTML interpretado.

## Verificación

Tres pruebas nuevas comprueban coincidencia exacta del formateador con Viernes, preservación de textos con comas/corchetes/HTML y representación explícita de pendientes sin alterar números globales. Suite completa: 211 pruebas.

En navegador se verificaron 100 registros en la primera página y 28 en la segunda, empezando en 101 y terminando en 128; cierre `ID1 PMAIN -> [128]`, pendientes, ocultación de una secuencia inválida, limpieza y regreso a Viernes.

La etapa 5 conecta este componente con el botón Generar y la ejecución en Worker.
