# Integración y verificación (punto 9)

Generar produce las tablas y el árbol en la página principal. El árbol se presenta después de errores y antes del resumen de etapas, que ahora indica tres de cinco disponibles.

## Flujo y responsabilidades

- `src/compiler/analysis.js`: `analyzeProgram(source)` conserva la respuesta de `requestAnalysis` y añade `treeAnalysis` con estado, geometría y diagnósticos. Construye, comprueba los IDs contra la tabla, evalúa y distribuye el árbol.
- `worker.js`: ejecuta el flujo completo fuera del hilo de la interfaz. Transfiere la geometría terminada, sin DOM.
- `src/ui/tree/results.js`: muestra el visor, estado e incidencias propias del árbol. Las incidencias no se insertan como errores Java en la tabla.
- `main.js`: coordina los tres resultados. Al editar o volver a generar termina el Worker previo, incrementa la revisión y limpia todos los resultados. Una respuesta de otra revisión se descarta.

El visor se crea únicamente cuando hay un árbol. Se reutiliza entre generaciones y recupera el encuadre para cada nuevo resultado.

## Estados y límites

Una construcción inválida o no compatible presenta su explicación sin dibujo, conservando las tablas. Una evaluación parcial conserva las ramas construidas y omite los valores que no pudieron calcularse; muestra las incidencias con línea y operación cuando están disponibles. Las entradas vacías no generan resultados y los límites globales impiden intentar expandir el árbol.

La GLC y el constructor del árbol tienen alcances distintos. En particular, el ejemplo Viernes incluye casts y llamadas que el árbol admite por acuerdo, pero la tabla sintáctica todavía rechaza según su GLC. Por ello se analizan independientemente: mostrar el árbol no elimina los errores ni certifica que el programa sea válido. Se presenta un aviso cuando ambas situaciones coinciden. No se ampliaron las reglas de la GLC en este paso.

## Verificación

La suite completa tiene 170 pruebas. Las pruebas de integración cubren Viernes y sus 13 operaciones, la expresión con resultado 53, coincidencia de IDs, conservación de las tablas originales, transferibilidad, generaciones sucesivas, entradas vacías, límites, error léxico, ausencia de detonador y evaluación parcial por división entre cero.

En navegador se comprobó Generar mediante el Worker real, aparición del árbol, zoom, limpieza de tablas y árbol al editar, y aviso sin dibujo para un main sin detonador. Las pruebas del visor y geometría de los pasos anteriores siguen vigentes.
