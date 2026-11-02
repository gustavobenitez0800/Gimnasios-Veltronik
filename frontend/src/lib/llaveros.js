// ============================================
// VELTRONIK - LA REGLA DEL LLAVERO (ADR-016)
// ============================================
// Qué cuenta como "el mismo llavero". Es la gemela de `Llavero.java` del backend: lo que
// escribe el lector se limpia acá con exactamente la misma regla con la que se guardó, o el
// llavero no se encuentra. Si cambia una, cambia la otra (y los dos tests lo dicen).
//
// LA REGLA: sin espacios y en mayúsculas. NADA MÁS.
//   · No se sacan los ceros de adelante: el lector típico escribe diez dígitos (0012345678), y
//     sin los ceros queda 12345678, que es un DNI válido y podría ser el de otro socio.
//   · No se saca la coma: un lector Wiegand escribe 188,22136; sin ella, otro número con forma
//     de DNI.
//   · No se convierte de formato: se guarda lo que escribe el lector del gimnasio.
// ============================================

export const LARGO_MINIMO = 4;
export const LARGO_MAXIMO = 64;

/** Cómo se llama en el registro de accesos la entrada con llavero (`AccessLogService.METODO_LLAVERO`). */
export const METODO_LLAVERO = 'LLAVERO';

const PERMITIDO = /^[0-9A-Z,.:_-]+$/;

/** El código como se guarda y se compara. Nunca devuelve null. */
export function normalizarLlavero(crudo) {
  return String(crudo ?? '').replace(/\s+/g, '').toUpperCase();
}

/** ¿Esto, ya normalizado, puede ser el código de un llavero? */
export function esLlaveroValido(codigo) {
  return typeof codigo === 'string'
    && codigo.length >= LARGO_MINIMO
    && codigo.length <= LARGO_MAXIMO
    && PERMITIDO.test(codigo);
}
