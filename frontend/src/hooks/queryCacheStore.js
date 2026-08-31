// ============================================
// VELTRONIK - Depósito de la caché de consultas
// ============================================
// El Map que hay detrás de `useQueryCache`. Vive aparte del hook por dos motivos: se
// puede probar sin montar React, y otras partes de la app necesitan invalidarlo sin ser
// un componente (cobrar un pago vuelve vieja la lista de Socios).
//
// ⭐ Hay DOS maneras de invalidar y NO son intercambiables:
//
//   · `clearQueryCache()` BORRA todo. Es para cambio de sucursal y cierre de sesión: ahí
//     lo que importa es que no quede ni un dato del negocio anterior. Es seguridad.
//
//   · `invalidateQueries(ns)` marca como VIEJO. Es para "esto cambió": lo que hay en
//     pantalla se sigue mostrando y se refresca por detrás. Borrar acá sería peor que no
//     hacer nada — dejaría la pantalla en blanco para volver a dibujar casi lo mismo.
// ============================================

// Techo de entradas. La caché arrancó pegada a pantallas de UNA sola clave (el mostrador,
// el dashboard), así que un Map sin límite no molestaba. Con Socios entra el buscador:
// cada búsqueda distinta es una clave nueva, y una entrada con filtro de estado puede
// traer mil socios. En un terminal que arranca con Windows y no se apaga en semanas, eso
// es una fuga lenta. Sesenta entradas alcanzan de sobra para que ir y volver entre
// módulos sea instantáneo, que es para lo único que existe esto.
export const MAX_ENTRIES = 60;

// { [key]: { data, timestamp, ns } }. El orden de inserción del Map hace de antigüedad.
const store = new Map();

export function readEntry(key) {
  return store.get(key);
}

/**
 * @param {string} key  Clave serializada (la arma el hook)
 * @param {string} ns   Módulo al que pertenece: 'members', 'payments'… Es lo que permite
 *                      invalidar por módulo sin adivinar con prefijos de texto.
 * @param {*} data
 */
export function writeEntry(key, ns, data) {
  // Borrar antes de escribir renueva la antigüedad: una clave que se reescribe seguido
  // (el mostrador lo hace cada 15 s) es la MÁS usada, y sin esto sería la primera en caer,
  // porque el Map la seguiría ordenando por cuándo se creó.
  store.delete(key);
  store.set(key, { data, timestamp: Date.now(), ns });

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

/** Marca UNA clave como vieja: se sigue mostrando, se vuelve a pedir. */
export function markStale(key) {
  const entry = store.get(key);
  if (entry) entry.timestamp = 0;
}

/**
 * Marca como viejo TODO un módulo. Por nombre de módulo y no por prefijo de texto: con
 * `startsWith`, invalidar 'members' se llevaría puesto a cualquier clave futura que
 * empiece igual, y ese es el tipo de error que no se ve nunca —simplemente algo se
 * recarga de más— hasta el día que se ve al revés.
 */
export function invalidateQueries(ns) {
  for (const entry of store.values()) {
    if (entry.ns === ns) entry.timestamp = 0;
  }
}

/** Borra TODO. Cambio de sucursal y cierre de sesión: que no quede nada del anterior. */
export function clearQueryCache() {
  store.clear();
}
