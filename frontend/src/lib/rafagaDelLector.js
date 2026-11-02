// ============================================
// VELTRONIK - ¿FUE UN LECTOR O UNA PERSONA? (ADR-016 §3)
// ============================================
// El lector de llaveros "tipo teclado" escribe el número y un Enter, como si alguien lo
// tecleara. Para la pantalla es un teclado más. Lo que lo delata es la VELOCIDAD: un lector
// escribe diez caracteres en unos 30 ms; una persona, por rápida que sea, tarda más de 50 ms
// entre tecla y tecla, y no sostiene ese ritmo seis teclas seguidas.
//
// Saberlo sirve para tres cosas que con el teclado solo no se sabrían:
//   · que la entrada fue con LLAVERO (y no tecleada a mano),
//   · que se busca EXACTO (un llavero que coincide en parte con otro es otra persona),
//   · que lo que había escrito antes en el campo sobra: si la recepcionista dejó "pe" y un
//     socio pasa el llavero, el campo quedaría "pe0012345678" y no encontraría a nadie. La
//     ráfaga se lleva solo lo que escribió el lector.
//
// Es una función pura, con el reloj pasado de afuera, para poder probarla con tiempos falsos.
// ============================================

/** Cuántos caracteres seguidos hacen falta para que sea un lector. Un llavero tiene diez. */
export const MIN_CARACTERES = 6;

/**
 * El intervalo máximo entre tecla y tecla de una ráfaga. Un lector anda por 3–15 ms; con un USB
 * cargado puede llegar a 30. Una persona escribiendo rápido no baja de 80.
 */
export const MAX_INTERVALO_MS = 50;

/**
 * Cuánto puede tardar el Enter después del último carácter. Más que entre carácter y carácter:
 * hay lectores que esperan un poco antes de mandar el final. Ampliarlo no confunde a nadie,
 * porque los caracteres de antes ya tuvieron que venir a ritmo de lector.
 */
export const MAX_PAUSA_AL_ENTER_MS = 150;

/**
 * Crea un detector. Se le pasan las teclas en orden con su momento, y al Enter dice si lo que
 * vino antes fue una ráfaga.
 *
 * @returns {{ tecla: (key: string, t: number) => (null | { codigo: string }), reiniciar: () => void }}
 *   `tecla` devuelve `{ codigo }` SOLO en el Enter que cierra una ráfaga; en cualquier otra tecla,
 *   o en un Enter tecleado por una persona, devuelve null.
 */
export function crearDetectorDeRafagas({
  minCaracteres = MIN_CARACTERES,
  maxIntervaloMs = MAX_INTERVALO_MS,
  maxPausaAlEnterMs = MAX_PAUSA_AL_ENTER_MS,
} = {}) {
  let caracteres = '';
  let ultima = -Infinity;

  const reiniciar = () => {
    caracteres = '';
    ultima = -Infinity;
  };

  const tecla = (key, t) => {
    const pausa = t - ultima;

    if (key === 'Enter') {
      const fueRafaga = caracteres.length >= minCaracteres && pausa <= maxPausaAlEnterMs;
      const codigo = caracteres;
      reiniciar();
      return fueRafaga ? { codigo } : null;
    }

    // Solo cuenta lo que se escribe. Una flecha o un Shift no rompen la ráfaga ni la arman.
    if (typeof key !== 'string' || key.length !== 1) return null;

    // Una pausa larga empieza una ráfaga nueva: lo de antes lo escribió una persona.
    if (pausa > maxIntervaloMs) caracteres = '';
    caracteres += key;
    ultima = t;
    return null;
  };

  return { tecla, reiniciar };
}
