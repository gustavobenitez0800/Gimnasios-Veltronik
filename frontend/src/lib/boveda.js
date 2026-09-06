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

    // Si el sistema no puede cifrar, la bóveda contesta null a todo y esto cae solo en el
    // camino de abajo: se lee del lugar viejo y se sigue trabajando. No hace falta
    // preguntarle antes si está disponible — y eso importa, porque preguntar sería una
    // vuelta asincrónica ANTES de poder construir el cliente de Supabase, que se arma de
    // forma sincrónica al cargar el módulo.
    const guardado = await b.leer(clave);
    if (guardado !== null && guardado !== undefined) return guardado;

    // No está en la bóveda. ¿Estará en el lugar viejo, de una versión anterior?
    const viejo = leerViejo(clave);
    if (viejo === null) return null;

    // Mudanza: escribir, verificar, y recién entonces borrar el original.
    const quedo = await b.escribir(clave, viejo);
    if (quedo) borrarViejo(clave);

    // Se devuelve el valor pase lo que pase con la mudanza: si la bóveda no pudo guardar,
    // la sesión sigue siendo válida y no hay ningún motivo para echar a nadie.
    return viejo;
  },

  async setItem(clave, valor) {
    const b = puente();
    const quedo = b ? await b.escribir(clave, valor) : false;
    if (!quedo) {
      // La bóveda no pudo. Antes que perder la sesión, se guarda donde se guardaba siempre.
      try { window.localStorage.setItem(clave, valor); } catch { /* sin dónde: queda en memoria */ }
    }
  },

  async removeItem(clave) {
    const b = puente();
    if (b) await b.borrar(clave);
    // También del lugar viejo: un logout tiene que borrar TODAS las copias, no la más nueva.
    // Sin esto, el token que quedó de la versión anterior sobreviviría al cierre de sesión.
    borrarViejo(clave);
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
    const crudo = b ? await b.leer(clave) : leerViejo(clave);
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

export default almacenDeSesion;
