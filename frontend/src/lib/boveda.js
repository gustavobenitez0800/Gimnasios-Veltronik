// ============================================
// VELTRONIK - DÓNDE VIVE LA SESIÓN
// ============================================
// El almacén que usa Supabase para guardar el token. En el escritorio es la bóveda cifrada
// por el sistema operativo; en la web, el `localStorage` de siempre.
//
// POR QUÉ
// Hasta acá el token del escritorio vivía en el `localStorage` de Chromium: un archivo en el
// perfil del usuario, en texto plano. Cualquiera con acceso a esa carpeta —el que arregla la
// PC, un pendrive, un backup mal guardado— se llevaba una sesión con la que entrar al
// gimnasio desde otra máquina. `safeStorage` lo cifra con DPAPI: la clave la tiene Windows y
// está atada a la cuenta de esa máquina, así que copiar el archivo no alcanza.
//
// ⚠️ LA MUDANZA NO PUEDE DESLOGUEAR A NADIE
// Este es el detalle que hace o rompe la actualización. Los clientes que ya están adentro
// tienen su token en `localStorage`; si el almacén nuevo mirara solo la bóveda, el lunes a
// la mañana TODOS los gimnasios se encontrarían con la pantalla de login sin haber hecho
// nada. Por eso la primera lectura de cada clave se fija también en el lugar viejo, la muda,
// y recién ahí borra el original. Son diez líneas y evitan una mañana de teléfono.
//
// ⚠️ Y LA MUDANZA NO PUEDE PERDER EL TOKEN
// El orden importa: se escribe en la bóveda, se verifica que haya quedado, y SOLO entonces
// se borra del `localStorage`. Al revés —borrar y después escribir— un disco lleno en el
// medio deja al gimnasio sin sesión y sin forma de recuperarla.
//
// ⚠️ Y LA LECTURA NO PUEDE DEVOLVER UN TOKEN GASTADO
// El refresh token de Supabase es de un solo uso: presentar uno anterior revoca la familia
// entera de sesiones, y el mostrador cae al login una hora después sin que nadie haya hecho
// nada. Cuando la bóveda no puede guardar —en Windows, el antivirus tiene el archivo abierto y
// el reemplazo falla con EPERM— el token nuevo queda en el lugar viejo y en la bóveda sigue el
// anterior. Hay DOS copias, y la lectura tiene que quedarse con la más nueva, no con la del
// lugar que mira primero. Antes miraba primero la bóveda.

/** El puente al proceso principal, si esta app lo tiene. */
function puente() {
  return (typeof window !== 'undefined' && window.electronAPI?.nucleo?.boveda) || null;
}

/** Lectura del almacén viejo, tolerante a que no exista. */
function leerViejo(clave) {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function borrarViejo(clave) {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Modo privado extremo o permisos: no poder limpiar el rastro viejo no es motivo para
    // romper nada. Queda una copia de más, que es exactamente lo que había antes.
  }
}

/**
 * Cada cuánto se vuelve a probar con una bóveda que acaba de decir que no.
 *
 * Un intento que falla le cuesta al proceso principal hasta un segundo de reintentos (ver
 * `electron/nucleo/boveda.cjs`), y Supabase lee la sesión en CADA pedido a la API: insistir
 * en cada lectura sería colgar la app justo cuando el disco anda mal.
 */
const PAUSA_TRAS_FALLO_MS = 60_000;

/** Hasta cuándo no molestar a la bóveda, por clave. Dura lo que dura la ventana. */
const noAntesDe = new Map();

function enPausa(clave) {
  return Date.now() < (noAntesDe.get(clave) ?? 0);
}

function pausar(clave) {
  noAntesDe.set(clave, Date.now() + PAUSA_TRAS_FALLO_MS);
}

/**
 * La marca de "esta sesión se cerró y la bóveda no la pudo borrar".
 *
 * Sin ella, un cierre de sesión que choca con el antivirus deja la sesión guardada. Con
 * internet se cae sola (el servidor ya la dio de baja), pero sin conexión el mostrador abre
 * con lo guardado: quien cerró sesión volvería a estar adentro.
 */
const marcaDeCerrada = (clave) => `${clave}:cerrada`;

function estaCerrada(clave) {
  return leerViejo(marcaDeCerrada(clave)) !== null;
}

function marcarCerrada(clave) {
  try { window.localStorage.setItem(marcaDeCerrada(clave), '1'); } catch { /* sin dónde anotarlo */ }
}

/** Cuándo vence el token de acceso de una sesión guardada, o null si eso no es una sesión. */
function vencimientoDe(crudo) {
  try {
    const vence = JSON.parse(crudo)?.expires_at;
    return Number.isFinite(vence) ? vence : null;
  } catch {
    return null;
  }
}

/**
 * Hay una copia en la bóveda y otra en el lugar viejo: ¿es más nueva la del lugar viejo?
 *
 * Lo decide el dato y no la historia de cómo llegó cada una ahí. Cada renovación trae un
 * token de acceso que vence más tarde, así que entre dos sesiones la más nueva es la de
 * `expires_at` mayor. Hace falta mirarlo porque el lugar viejo puede tener las dos cosas: el
 * token que la bóveda no pudo guardar recién (más nuevo), o el resto que las versiones
 * anteriores dejaban tirado cuando un guardado posterior sí entraba (más viejo, y gastado).
 */
function ganaElViejo(enBoveda, enViejo) {
  const deLaBoveda = vencimientoDe(enBoveda);
  const delViejo = vencimientoDe(enViejo);
  if (deLaBoveda !== null && delViejo !== null) return delViejo > deLaBoveda;
  // Una sola es una sesión: gana esa. Basura en el lugar viejo no le gana a una sesión buena.
  if (deLaBoveda !== null) return false;
  // Ninguna lo es —el verificador del login con Google, por ejemplo—: ahí no hay restos de
  // versiones anteriores (cada login que termina los borra), así que lo que está en el lugar
  // viejo es lo último que la bóveda no pudo guardar.
  return true;
}

/**
 * De a una operación por vez.
 *
 * Supabase ordena las suyas, pero `sesionGuardada` la llama la app por fuera. Una lectura que
 * decide mudar el token que vio, con una renovación entrando en el medio, llega última y deja
 * en la bóveda el token anterior: el mismo bug, por otro camino.
 */
let fila = Promise.resolve();

function enFila(operacion) {
  const turno = fila.then(operacion);
  fila = turno.catch(() => { /* un error no traba a las que vienen detrás */ });
  return turno;
}

/** Lo último que se guardó con esa clave, esté donde esté. Y de paso lo deja en la bóveda. */
async function leerLoMasNuevo(b, clave) {
  if (estaCerrada(clave)) {
    // El cierre de sesión no pudo borrar la bóveda. Se vuelve a probar y, salga como salga,
    // acá no hay sesión.
    if (!enPausa(marcaDeCerrada(clave))) {
      if (await b.borrar(clave)) borrarViejo(marcaDeCerrada(clave));
      else pausar(marcaDeCerrada(clave));
    }
    return null;
  }

  // Si el sistema no puede cifrar, la bóveda contesta null a todo y esto cae solo en el
  // lugar viejo: no hace falta preguntarle antes si está disponible — y eso importa, porque
  // preguntar sería una vuelta asincrónica ANTES de poder construir el cliente de Supabase,
  // que se arma de forma sincrónica al cargar el módulo.
  const enBoveda = (await b.leer(clave)) ?? null;
  const enViejo = leerViejo(clave);
  if (enViejo === null) return enBoveda;

  if (enBoveda !== null && !ganaElViejo(enBoveda, enViejo)) {
    // Un resto de una versión anterior: se limpia, para que no haya nada que comparar.
    borrarViejo(clave);
    return enBoveda;
  }

  // Lo más nuevo está en el lugar viejo: de una versión anterior a la bóveda, o de un
  // guardado que la bóveda rechazó. Mudanza: escribir, verificar, y recién entonces borrar.
  if (!enPausa(clave)) {
    const quedo = await b.escribir(clave, enViejo);
    if (quedo) borrarViejo(clave);
    else pausar(clave);
  }

  // Se devuelve el valor pase lo que pase con la mudanza: si la bóveda no pudo guardar,
  // la sesión sigue siendo válida y no hay ningún motivo para echar a nadie.
  return enViejo;
}

/**
 * El almacén cifrado, con la mudanza incorporada.
 *
 * Cumple el contrato de `storage` de Supabase (getItem / setItem / removeItem), que acepta
 * respuestas asincrónicas — está pensado para el AsyncStorage de React Native, así que un
 * IPC entra sin problemas.
 */
const bovedaStorage = {
  async getItem(clave) {
    const b = puente();
    if (!b) return leerViejo(clave);
    return enFila(() => leerLoMasNuevo(b, clave));
  },

  async setItem(clave, valor) {
    return enFila(async () => {
      const b = puente();
      const quedo = b ? await b.escribir(clave, valor) : false;
      if (quedo) {
        // Quedó en la bóveda: la copia en claro que pudo dejar un guardado anterior sobra, y
        // es un token gastado que no tiene que estar en ningún lado.
        borrarViejo(clave);
        noAntesDe.delete(clave);
      } else {
        // La bóveda no pudo. Antes que perder la sesión, se guarda donde se guardaba siempre.
        try { window.localStorage.setItem(clave, valor); } catch { /* sin dónde: queda en memoria */ }
        pausar(clave);
      }
      // Entró alguien: lo que hubiera de un cierre anterior ya no manda.
      borrarViejo(marcaDeCerrada(clave));
    });
  },

  async removeItem(clave) {
    return enFila(async () => {
      const b = puente();
      // `false` es "no pude". Cualquier otra respuesta cuenta como que sí.
      const borrada = b ? (await b.borrar(clave)) !== false : true;
      // También del lugar viejo: un logout tiene que borrar TODAS las copias, no la más nueva.
      // Sin esto, el token que quedó de la versión anterior sobreviviría al cierre de sesión.
      borrarViejo(clave);
      noAntesDe.delete(clave);
      if (borrada) {
        borrarViejo(marcaDeCerrada(clave));
      } else {
        marcarCerrada(clave);
        pausar(marcaDeCerrada(clave));
      }
    });
  },
};

/**
 * El almacén que le corresponde a esta app, o `undefined` para que Supabase use el suyo.
 *
 * Sincrónico a propósito: el cliente de Supabase se construye al cargar el módulo, así que
 * acá no se puede esperar una respuesta del proceso principal. Alcanza con saber si el
 * puente existe; si el sistema después no puede cifrar, cada operación cae sola en el
 * `localStorage` de siempre.
 *
 * Devuelve `undefined` —y no un envoltorio del `localStorage`— en la web, para no meterse en
 * el camino: ahí el comportamiento por defecto de Supabase es exactamente el que queremos, y
 * envolverlo solo agregaría una capa donde algo puede salir mal.
 */
export function almacenDeSesion() {
  return puente() ? bovedaStorage : undefined;
}

/**
 * Lee la sesión guardada SIN pasar por Supabase.
 *
 * <p><b>Para qué existe.</b> Cuando el token venció y no hay internet, `getSession()` de
 * Supabase devuelve `null` — verificado en su código: si está vencida intenta renovarla y,
 * ante cualquier error de la renovación, contesta que no hay sesión. Pero la sesión SIGUE
 * GUARDADA: la biblioteca solo la borra cuando el error NO es de red (un refresh token
 * rechazado de verdad). Así que "no hay sesión" y "no pude confirmarla" se ven igual desde
 * afuera, y son cosas muy distintas: la primera manda al login, la segunda tiene que dejar
 * trabajar al mostrador.</p>
 *
 * <p>Esto mira el dato crudo para poder distinguirlas.</p>
 *
 * @param {string} clave la clave de almacenamiento de Supabase (`sb-<ref>-auth-token`)
 * @returns {Promise<object|null>} la sesión guardada, o null si no hay ninguna
 */
export async function sesionGuardada(clave) {
  const b = puente();
  try {
    // Por el mismo camino que Supabase: si no, acá se vería el token anterior justo cuando
    // la bóveda no pudo guardar el nuevo.
    const crudo = b ? await enFila(() => leerLoMasNuevo(b, clave)) : leerViejo(clave);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    // Se exige `refresh_token` y `user`: es lo que distingue una sesión de verdad de un
    // resto a medio escribir. Sin eso no hay nada que sostener.
    if (!datos?.refresh_token || !datos?.user) return null;
    return datos;
  } catch {
    return null;
  }
}

/** Solo para los tests: que cada uno arranque sin las pausas ni la fila del anterior. */
export function _reiniciar() {
  noAntesDe.clear();
  fila = Promise.resolve();
}

export default almacenDeSesion;
