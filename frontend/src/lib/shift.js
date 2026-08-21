// ============================================
// VELTRONIK - EL TURNO DEL MOSTRADOR
// ============================================
// Quién está atendiendo ahora mismo en esta computadora. Cada cobro y cada acceso que se
// registre queda firmado con esa persona.
//
// No es una sesión: la sesión la tiene el TERMINAL. Esto es solo "quién está en el turno",
// y se cambia con 4 dígitos — que es lo que hace que un cambio de turno sea viable dos
// veces por día. Pedir email y contraseña sería fricción suficiente para que nadie lo
// haga, y entonces todos los movimientos quedarían a nombre de una sola persona.

const KEY_ID = 'current_cashier_id';
const KEY_NAME = 'current_cashier_name';
const KEY_AT = 'current_cashier_at';

/**
 * Cuánto dura un turno sin actividad antes de pedir el PIN de nuevo.
 *
 * <p>12 horas cubre el caso normal —se abre a la mañana, se cierra a la noche— sin obligar
 * a re-marcar por un reinicio de la app o una actualización a mitad del día. Más largo
 * sería peor que no tener nada: el gimnasio cierra, al otro día entra otra persona, y sus
 * movimientos quedarían firmados con el nombre de quien atendió ayer. Un dato que miente
 * es peor que un dato que falta.
 */
const DURACION_MS = 12 * 60 * 60 * 1000;

/** El turno abierto, o null si no hay o venció. */
export function getShift() {
  try {
    const id = localStorage.getItem(KEY_ID);
    const name = localStorage.getItem(KEY_NAME);
    const at = Number(localStorage.getItem(KEY_AT));
    if (!id || !name || !at) return null;
    if (Date.now() - at > DURACION_MS) {
      clearShift();
      return null;
    }
    return { id, name };
  } catch {
    return null; // sin almacenamiento: se trabaja sin firma, no se bloquea el mostrador
  }
}

/** Abre el turno (después de que el backend validó el PIN). */
export function setShift(id, name) {
  try {
    localStorage.setItem(KEY_ID, id);
    localStorage.setItem(KEY_NAME, name);
    localStorage.setItem(KEY_AT, String(Date.now()));
  } catch { /* sin almacenamiento: el turno dura lo que dure la pantalla */ }
}

export function clearShift() {
  try {
    localStorage.removeItem(KEY_ID);
    localStorage.removeItem(KEY_NAME);
    localStorage.removeItem(KEY_AT);
  } catch { /* nada que limpiar */ }
}

/** El id que viaja en el header de cada request, o null. */
export function getShiftId() {
  return getShift()?.id || null;
}
