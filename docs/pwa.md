# PWA — pasos 1 y 2: caché y funcionamiento offline

Implementados el guardado completo de archivos y su respuesta desde caché: después de una primera instalación con conexión, la aplicación puede abrirse y generar las cinco salidas sin red. Todavía no hay manifiesto de instalación, gestión visual de actualizaciones, reparación de caché ni indicador de disponibilidad.

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

## Respuesta sin conexión

El evento `fetch` responde únicamente a GET de los archivos inventariados del propio proyecto. La raíz del alcance se resuelve a `index.html`; también se admiten parámetros de consulta. Los archivos se leen de la versión instalada, sin mezclar recursos de otras versiones ni consultar la red. Las rutas desconocidas y las solicitudes externas conservan el comportamiento normal del navegador.

Al activarse, el Service Worker controla la página abierta. Las actualizaciones esperan a que se cierren los clientes anteriores; no se usa `skipWaiting`. Si falta un recurso guardado, se devuelve 503 en lugar de ejecutar una mezcla de versiones. La recuperación de una caché eliminada o dañada queda pendiente de la gestión de actualizaciones y reparación.

## Probar después de publicar

1. Abrir la URL de Pages con conexión y permitir que se descarguen todos los archivos.
2. Si había una versión anterior abierta, cerrar todas las pestañas de la aplicación y volver a abrirla para que pueda activarse la nueva versión.
3. Activar modo avión, abrir de nuevo la misma dirección y generar un ejemplo nuevo.

La primera visita necesita conexión. El código Java escrito no se guarda al cerrar la página. El funcionamiento offline depende de conservar los datos del sitio en el navegador; todavía no hay un indicador que confirme la preparación.

Verificación: 287 pruebas automatizadas aprobadas, incluidas instalación, integridad, aislamiento de versiones y respuesta offline de los 51 recursos tanto en raíz como en subdirectorio. También se recargó la aplicación en el navegador local con el servidor apagado y se generó un ejemplo hasta tres direcciones. La prueba en un iPhone real queda pendiente.
