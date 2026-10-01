import { useEffect, useState } from 'react';
import { sinConexion, alCambiarLaConexion } from '../lib/conexion';

/**
 * ¿Hay red ahora mismo? Reactivo, para que la pantalla pueda decir la verdad.
 *
 * <p><b>Por qué hace falta.</b> Sin esto, una pantalla que pide datos al servidor y se queda
 * sin red no tiene forma de distinguir "todavía no llegó" de "no va a llegar", y lo único que
 * puede hacer es dejar el spinner girando. Eso fue exactamente el síntoma que reportó el
 * dueño: apagó el wifi con la app abierta y "En el gimnasio" quedó en <i>Cargando…</i> hasta
 * que volvió a prenderlo.</p>
 *
 * <p><b>Y no es solo cosmético.</b> Mientras tanto, el refresco automático seguía disparando
 * un pedido cada quince segundos, cada uno con su plazo de espera y sus reintentos con espera
 * creciente. Son pedidos condenados a fallar que se apilan y que además tapan el problema:
 * cuanto más se insiste, más tarda en aparecer la respuesta honesta.</p>
 *
 * <p><b>⚠️ La respuesta es la de `lib/conexion`, no la de `navigator.onLine`.</b> Ese dato dice
 * poco: con el router prendido y sin internet da true, y así esta pantalla creía tener red y
 * seguía insistiendo. En el escritorio, `lib/conexion` sabe además si el SERVIDOR contesta, y
 * avisa cuando vuelve — que es cuando la pantalla tiene que ponerse al día. En la web responde
 * lo mismo que `navigator.onLine`.</p>
 */
export function useEstaEnLinea() {
  const [enLinea, setEnLinea] = useState(() => !sinConexion());

  useEffect(() => {
    const actualizar = () => setEnLinea(!sinConexion());

    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    const soltar = alCambiarLaConexion(actualizar);

    // Por si cambió entre el primer render y el momento en que se engancharon los oyentes.
    actualizar();

    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
      soltar();
    };
  }, []);

  return enLinea;
}

export default useEstaEnLinea;
