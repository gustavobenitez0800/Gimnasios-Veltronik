// ============================================
// VELTRONIK - LA CLAVE PARA COBRAR, EN ESTA PC (para cuando no hay internet)
// ============================================
// La clave la comprueba el servidor. Pero la caja no para cuando se corta internet, así que esta
// PC se acuerda de dos cosas, por sucursal:
//   · si la sucursal pide clave (lo último que dijo el servidor), y
//   · una HUELLA de la clave, guardada la última vez que se comprobó bien con internet.
// Sin internet, lo que se escribe se compara con esa huella. Si la PC nunca la comprobó (la clave
// se puso en otra computadora y esta no volvió a tener internet desde entonces), no hay contra qué
// comparar y se deja cobrar: frenar la caja de un gimnasio por eso sería peor que el problema.
//
// La huella no es la clave (SHA-256 de la sucursal + la clave), pero tampoco es una bóveda: es la
// cerradura del mostrador, como el PIN del turno.
// ============================================

const CLAVE = (sucursal) => `veltronik_clave_cobro:${sucursal}`;

/** Lo que esta PC sabe de la clave de esa sucursal. */
export function leerLocal(sucursal) {
  if (!sucursal) return { activa: false, huella: null };
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE(sucursal)) || 'null');
    return { activa: !!guardado?.activa, huella: guardado?.huella || null };
  } catch {
    return { activa: false, huella: null };
  }
}

export function guardarLocal(sucursal, cambios) {
  if (!sucursal) return;
  try {
    localStorage.setItem(CLAVE(sucursal), JSON.stringify({ ...leerLocal(sucursal), ...cambios }));
  } catch { /* sin almacenamiento: sin internet no se podrá comprobar */ }
}

/** La huella de una clave para una sucursal (hex). */
export async function huellaDe(sucursal, clave) {
  const datos = new TextEncoder().encode(`veltronik:${sucursal}:${clave}`);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(resumen)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
