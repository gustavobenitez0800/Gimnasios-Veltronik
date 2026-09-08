import { useEffect, useState } from 'react';

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
 * <p><b>⚠️ `navigator.onLine` dice poco, y por eso solo se usa para lo que sí sabe.</b> Un
 * `false` es confiable —la placa de red está caída, no hay a dónde mandar nada—; un `true`
 * solo significa que hay una interfaz levantada, no que el servidor esté del otro lado. Acá se
 * usa nada más que para dejar de insistir y para poder decir "sin conexión". Nunca para
 * afirmar que algo está funcionando.</p>
 */
export function useEstaEnLinea() {
  const [enLinea, setEnLinea] = useState(
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  );

  useEffect(() => {
    const prendio = () => setEnLinea(true);
    const apago = () => setEnLinea(false);

    window.addEventListener('online', prendio);
    window.addEventListener('offline', apago);

    // Por si cambió entre el primer render y el momento en que se engancharon los oyentes.
    if (typeof navigator !== 'undefined') setEnLinea(navigator.onLine !== false);

    return () => {
      window.removeEventListener('online', prendio);
      window.removeEventListener('offline', apago);
    };
  }, []);

  return enLinea;
}

export default useEstaEnLinea;
