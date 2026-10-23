# PWA — paso 1: preparar la caché

Implementado únicamente el guardado de los archivos de ejecución. Todavía no hay interceptación de solicitudes (`fetch`), apertura offline, manifiesto de instalación, gestión de activación de actualizaciones ni indicador de disponibilidad. No anunciar la aplicación como lista sin conexión todavía.

`main.js` registra `sw.js` mediante `src/pwa/register.js`. La ruta y el alcance son relativos al proyecto, por lo que funcionan tanto en la raíz como en el subdirectorio de GitHub Pages. La preparación es independiente del análisis; un fallo no bloquea Generar. Requiere HTTPS o localhost y soporte de Service Worker.

`sw.js` instala mediante Cache Storage todos los recursos enumerados en `sw-assets.js`. `cache.addAll` solo completa el lote si todos los recursos se descargan correctamente. Cada solicitud usa integridad SHA-256 y evita la caché HTTP previa. Un fallo rechaza la instalación. Los nombres de caché incluyen el alcance y una versión derivada del contenido; no se borran versiones anteriores ni se fuerza la activación.

## Preparar cada publicación

Después de cambiar archivos de la aplicación:

```sh
npm run build:cache
npm test
```

Subir también `sw.js`, `sw-assets.js`, `src/pwa/register.js` y el resto de archivos modificados a GitHub. El inventario se genera localmente; Pages no necesita ejecutar Node. `npm run check:cache` comprueba que no quedó desactualizado y también forma parte de las pruebas.

El generador recorre index.html, sus recursos, imports/exports estáticos, URLs literales construidas con import.meta.url (incluido el Worker) y recursos CSS. Excluye el Service Worker, cuyo script instala el navegador. El formato de dependencias actual está cubierto; si se incorporan imports dinámicos, rutas calculadas o nuevos mecanismos de carga habrá que ampliar el generador. No guarda pruebas, documentación ni vistas de desarrollo. El código Java escrito por el usuario no forma parte de esta caché.

Verificación del paso 1: inventario vigente, rutas de subdirectorio, opciones de integridad, rechazo de instalación fallida y separación de cachés entre proyectos mediante pruebas automatizadas. La prueba real en iPhone y la apertura sin red se realizarán al añadir la respuesta offline.
