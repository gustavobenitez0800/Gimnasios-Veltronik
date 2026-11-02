import { useEffect, useRef } from 'react';
import { crearDetectorDeRafagas } from '../lib/rafagaDelLector';

/** ¿La tecla va a un campo de texto? Ahí alguien está escribiendo otra cosa. */
function esCampoDeTexto(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

/**
 * ⭐ EL LECTOR DE LLAVEROS EN UNA PANTALLA (ADR-016 §3).
 *
 * <p>El lector "tipo teclado" escribe el número del llavero y un Enter. Este hook escucha el
 * teclado de toda la página ANTES que nadie (fase de captura) y, cuando reconoce la ráfaga de un
 * lector, se queda con ese Enter y llama a {@code alLeer(codigo)}. El Enter de una persona pasa de
 * largo y hace lo de siempre.</p>
 *
 * <p><b>Dónde escucha.</b> Las teclas sueltas (con el foco en ningún campo) y las del campo que se
 * le indica —el buscador de Accesos, que es donde escribe el lector—. Las que van a OTRO campo o a
 * un diálogo no se tocan: ahí alguien escribe otra cosa, y robarle el Enter sería romperle el
 * formulario.</p>
 *
 * <p><b>El reloj es el de la tecla</b> ({@code e.timeStamp}), no el de cuando se procesa: si la
 * pantalla estuvo ocupada, las teclas de una persona se procesan todas juntas y con el reloj de
 * ahora parecerían una ráfaga. Con el de la tecla, cada una dice cuándo se apretó.</p>
 *
 * @param {(codigo: string) => void} alLeer lo que pasa con un llavero leído
 * @param {{ activo?: boolean, campo?: { current: HTMLElement|null }, reloj?: (e: KeyboardEvent) => number }} [opciones]
 */
export function useLectorDeLlaveros(alLeer, { activo = true, campo = null, reloj = (e) => e.timeStamp } = {}) {
  // La función más nueva, sin volver a enganchar el escucha en cada dibujo: si se enganchara de
  // nuevo, el detector nacería vacío y una ráfaga cortada al medio por un dibujo no se vería.
  const alLeerRef = useRef(alLeer);
  const relojRef = useRef(reloj);
  useEffect(() => {
    alLeerRef.current = alLeer;
    relojRef.current = reloj;
  });

  useEffect(() => {
    if (!activo) return undefined;
    const detector = crearDetectorDeRafagas();

    const esDeEstaPantalla = (t) => {
      if (campo?.current && t === campo.current) return true;
      if (esCampoDeTexto(t)) return false;
      if (t?.closest?.('[role="dialog"], .modal-overlay, .modal-container')) return false;
      return true;
    };

    const alTeclear = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (!esDeEstaPantalla(e.target)) {
        detector.reiniciar();
        return;
      }
      const leido = detector.tecla(e.key, relojRef.current(e));
      if (!leido) return;
      // El Enter es del lector: que no llegue al buscador, que lo tomaría por una persona.
      e.preventDefault();
      e.stopPropagation();
      alLeerRef.current(leido.codigo);
    };

    document.addEventListener('keydown', alTeclear, true);
    return () => document.removeEventListener('keydown', alTeclear, true);
  }, [activo, campo]);
}
