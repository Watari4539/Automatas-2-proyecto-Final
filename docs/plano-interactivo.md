# Plano interactivo (punto 8)

Estado: visor SVG independiente y vista previa funcional. El [paso 9](integracion-del-arbol.md) ya conecta este visor con Generar en la pantalla principal. La vista previa sigue disponible para inspeccionar los ejemplos por separado.

## Vista previa

Con el servidor local activo, abrir `http://localhost:8000/tree-preview.html`. El selector permite revisar la expresión de `b`, el programa Viernes y el estado vacío. Ambos ejemplos usan los constructores, evaluación y distribución reales; no son dibujos fijos. Math.random() conserva la regla escolar de 1.0.

## Componente

Cargar `src/ui/tree/viewer.css` junto con la hoja general del sitio:

```js
import { createTreeViewer } from '../src/ui/tree/viewer.js';
import { layoutTree } from '../src/ui/tree/layout.js';

const viewer = createTreeViewer(container);
viewer.show(layoutTree(evaluatedTree));
viewer.fit();    // Encuadrar todo el árbol.
viewer.clear();  // Retirar el árbol, reiniciar cámara y desactivar controles.
viewer.destroy(); // Desconectar eventos, observador y animación; retirar el visor.
```

`show` recibe geometría del punto 7 y no modifica sus datos. Puede reemplazar un árbol cuantas veces sea necesario. Cada instancia tiene un identificador propio de patrón SVG. Los textos se insertan como texto, nunca mediante HTML interpretado.

## Interacción

- Arrastrar con el botón principal del ratón o con un dedo mueve el plano sin límites laterales.
- La rueda amplía o reduce alrededor del cursor; dos punteros táctiles permiten desplazamiento y zoom alrededor de su punto medio. La captura del puntero mantiene el arrastre aunque salga del área, y se libera al terminar, cancelar o perder el foco.
- Los botones `−`, porcentaje (100%), `+` y `Encuadrar` actúan sobre la cámara. El zoom manual está limitado entre 1% y 400% para evitar escalas nulas o excesivas.
- Con el plano enfocado: flechas para desplazar, `+`/`−` para zoom, `0` para 100% e `Inicio` para encuadrar. Tab permite salir del plano sin quedar atrapado.
- La cuadrícula está ligada a las coordenadas del árbol. Su densidad se adapta a la escala para evitar líneas excesivamente juntas.
- Al cambiar el tamaño del contenedor, se recalcula el encuadre si continúa automático; después de navegar manualmente, se conserva el punto central observado.

La cámara transforma un solo grupo SVG; mover o ampliar no reconstruye nodos ni recalcula operaciones. Los cambios de cámara se agrupan mediante `requestAnimationFrame`. El árbol conserva los círculos, conexiones y espacios del punto 7; las marcas de nivel están ocultas por defecto. La casilla «Mostrar niveles» añade una línea roja horizontal y su etiqueta por nivel, detrás de nodos y conexiones. Nivel 1 corresponde a la fila inferior; las guías siguen la cámara y conservan el número al hacer zoom o arrastrar. La selección se conserva entre generaciones durante la sesión del visor.

La raíz usa verde oscuro; los círculos, tonos verdes claros; las operaciones llevan numeración diferenciada y resultados con sus tokens al lado. Los controles mantienen foco visible y hay una lista de operaciones accesible para lectores de pantalla, además de instrucciones de teclado que no añaden texto visible al diseño.

## Verificación

`tests/tree-camera.test.js` comprueba que el zoom mantiene el punto bajo el cursor, el encuadre respeta márgenes, el desplazamiento no altera la escala, las transformaciones no mutan su entrada y la cuadrícula acompaña al mundo en todo el rango de zoom. Las pruebas de distribución existentes verifican separación y niveles.

Se verificaron en navegador los ejemplos de b y Viernes, zoom por botones y rueda, arrastre, teclado, encuadre y cambio de ejemplo/estado vacío. El gesto táctil de dos dedos está implementado mediante Pointer Events; no se ha verificado en un dispositivo táctil físico.
