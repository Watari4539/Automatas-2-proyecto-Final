/** Cache preparation is independent of the compiler and never blocks Generar. */
export async function registerCacheWorker() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
  try {
    const url = new URL('../../sw.js', import.meta.url);
    return await navigator.serviceWorker.register(url, {
      scope: new URL('./', url).href,
      updateViaCache: 'none',
    });
  } catch (error) {
    console.warn('No se pudo preparar la caché de la aplicación.', error);
    return null;
  }
}
