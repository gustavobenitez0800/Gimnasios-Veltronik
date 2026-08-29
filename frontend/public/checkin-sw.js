// ============================================
// VELTRONIK - SERVICE WORKER DEL CHECK-IN
// ============================================
// Existe por UN motivo: que el socio que escanea el cartel sin señal vea una pantalla
// nuestra que le diga qué hacer, en vez del error del navegador.
//
// Sin esto, "sin internet" es total: el QR apunta a una dirección web, el navegador no la
// puede abrir, y NADA de nuestro código llega a ejecutarse. No hay forma de decirle
// "pedile al mostrador que te marque" porque no llegamos a decir nada.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTE ARCHIVO ES DELICADO
// ─────────────────────────────────────────────────────────────────────────────
// Un service worker controla TODO el origen, no solo la pantalla que lo instaló. El
// error clásico —servir primero desde la caché— deja a la gente clavada en una versión
// vieja de la app, y es un problema difícil de diagnosticar porque cada navegador tiene
// su propia copia. En una app que además cobra con tarjeta, eso es inaceptable.
//
// Por eso las reglas de acá son conservadoras:
//   1. NAVEGACIÓN → primero la red, la caché SOLO si la red falló. Quien tiene señal ve
//      siempre la versión de hoy. La caché es un paracaídas, no un atajo.
//   2. ARCHIVOS CON HASH → esos sí desde la caché: su nombre cambia en cada build, así
//      que una copia guardada nunca puede quedar vieja.
//   3. LA API → nunca se toca. Un cobro o una marca de entrada jamás salen de una caché.
//
// Se registra ÚNICAMENTE desde la pantalla de check-in, así que solo se instala en los
// teléfonos de los socios que escanean el cartel.

const CACHE = 'veltronik-checkin-v1';

// El caparazón: lo mínimo para que la pantalla pueda dibujarse sin red. Los archivos con
// hash se van sumando solos a medida que se piden (ver abajo).
const CAPARAZON = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CAPARAZON))
      // Si algo del caparazón no se pudo guardar, NO abortamos la instalación: es mejor un
      // service worker a medias (que igual sirve los archivos con hash) que ninguno.
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Borra las versiones anteriores de esta caché. Sin esto, cada despliegue deja basura
  // acumulándose en el teléfono del socio para siempre.
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k.startsWith('veltronik-checkin-') && k !== CACHE)
              .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET. Un POST —marcar la entrada— jamás se responde desde una caché.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fuera de nuestro origen (fuentes, lo que sea) y CUALQUIER cosa de la API: de largo.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // ── Navegación: primero la red ──
  // El que tiene señal ve siempre la app de hoy. El que no, ve la pantalla guardada y
  // puede leer un mensaje que se entienda.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // ── Archivos con hash: primero la caché ──
  // Vite les pone un hash en el nombre (app-a3f9c2.js). Si el contenido cambia, cambia el
  // nombre — así que una copia guardada NUNCA puede estar desactualizada. Es el único
  // lugar donde la caché puede ir primero sin riesgo.
  const conHash = /\.[0-9a-f]{8,}\.(js|css|woff2?|png|svg|jpg)$/i.test(url.pathname);
  if (conHash) {
    event.respondWith(
      caches.match(req).then((guardado) => guardado || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // Todo lo demás: red, y si falla, lo que haya guardado. Sin inventar nada.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
