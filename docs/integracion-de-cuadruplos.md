# Integración y comprobación final (etapa 5)

Generar ya produce símbolos, errores, árbol y cuádruplos en la página principal. El resumen de etapas indica cuatro de cinco disponibles; tres direcciones sigue pendiente.

## Flujo

`analyzeProgram` se ejecuta en el Worker. Construye y evalúa el árbol una sola vez, prepara su geometría y entrega ese mismo árbol evaluado al generador de cuádruplos, que incorpora su validación. La respuesta añade `quadrupleAnalysis`; los registros conservan sus BigInt mediante el envío estructurado del Worker.

La geometría y los cuádruplos tienen bloques de manejo de fallos separados. Un fallo al producir cuádruplos conserva las tablas y el árbol; un fallo de distribución visual tampoco impide intentar generar los cuádruplos a partir del árbol evaluado.

`main.js` crea la vista en `#quadruples-host`, después del árbol. Al editar o volver a generar, limpia los cuatro resultados y termina el Worker previo. La revisión de solicitud existente descarta respuestas antiguas. Cada nueva secuencia comienza en la primera página.

## Estados

- Vacío: sin sección de resultados.
- Límites globales: aviso sin registros.
- Sin árbol compatible o evaluado: cuádruplos bloqueados, conservando las tablas y los avisos del árbol.
- Evaluación parcial: registros validados con resultados pendientes explícitos.
- Secuencia inválida, no soportada o fallo de generación: avisos, sin presentar registros como correctos.
- Secuencia completa: registros y cierre, paginados cuando corresponda.

La GLC mantiene sus reglas. Si existen errores de la tabla y el subconjunto del árbol permite cuádruplos, se conserva la secuencia y se añade un aviso breve para evitar confundirla con una certificación de validez del código.

## Comprobación

Suite completa: 215 pruebas. Las nuevas pruebas de integración verifican 15 registros y cierre de Viernes, 13 operaciones originales del árbol sin renumerar, mismos IDs, conservación de errores GLC, transferencia estructurada, limpieza lógica entre generaciones, entradas vacías, límites, falta de detonador, errores léxicos y división por cero con resultados pendientes.

En navegador se probó Generar con el Worker real: Viernes completo, eliminación de árbol y cuádruplos al editar, salida parcial por división entre cero y programa sin detonador que conserva símbolos y no deja registros anteriores. La paginación y el formato ya fueron comprobados en la etapa 4 y permanecen en el mismo componente.

La página `quadruples-preview.html` sigue disponible como ejemplo aislado, pero ya no es necesaria para usar los cuádruplos en el programa principal.
