/**
 * Service Worker: permite abrir la interfaz instalada sin red.
 * Por seguridad NUNCA intercepta /api, Authorization ni las respuestas JSON.
 * Para publicar cambios, se actualiza el sufijo de la versión del caché.
 */
const VERSION = 'vehiculos-pwa-v9';
const RECURSOS = [
  '/', '/index.html', '/styles.css?v=9', '/main.js?v=9', '/api.js?v=6', '/sesion.js?v=5', '/ventas.js?v=5',
  '/administracion.js?v=1',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(RECURSOS.map((ruta) => new Request(new URL(ruta, self.location.origin), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) => Promise.all(
      nombres.filter((nombre) => nombre.startsWith('vehiculos-pwa-') && nombre !== VERSION)
        .map((nombre) => caches.delete(nombre)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request;
  const url = new URL(solicitud.url);
  if (solicitud.method !== 'GET' || url.origin !== self.location.origin) return;

  // Los datos protegidos se obtienen siempre en línea; no se guardan.
  if (url.pathname.startsWith('/api/') || solicitud.headers.has('Authorization')) return;

  // Al navegar, se intenta obtener una versión nueva; sin conexión, la pantalla almacenada.
  if (solicitud.mode === 'navigate') {
    evento.respondWith(fetch(solicitud).catch(async () => (
      (await (await caches.open(VERSION)).match('/index.html')) || Response.error()
    )));
    return;
  }

  // Solo recursos estáticos declarados se almacenan para habilitar el inicio sin red.
  if (RECURSOS.includes(url.pathname + url.search)) {
    evento.respondWith(caches.open(VERSION).then((cache) => cache.match(solicitud))
      .then((guardado) => guardado || fetch(solicitud)));
  }
});
