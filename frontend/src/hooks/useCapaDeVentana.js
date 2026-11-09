// ============================================
// VELTRONIK - Una sola ventana a la vista (09/11/2026)
// ============================================
// Lo pidió Gustavo mirando la clave para cobrar abierta encima del cobro: «esas ventanas que se
// van superponiendo cansan al leer la que está para interactuar». Cada ventana se dibujaba sin
// saber de las otras: la de abajo seguía asomando por los costados —oscurecida, pero legible— y
// además seguía escuchando el teclado: un Escape cerraba las DOS de golpe.
//
// Ahora hay una PILA. Cada ventana que se abre se anota arriba de todo, y:
//   - solo la de ARRIBA se ve y atiende el teclado;
//   - la de abajo se esconde mientras tanto (inerte: ni el Tab llega a ella) y vuelve, con su
//     entrada de siempre, cuando la de arriba se cierra;
//   - la de arriba NO vuelve a oscurecer el fondo: ya lo oscureció la de abajo, y dos capas de
//     negro al 60% dejaban la pantalla casi negra.
//
// Como la de abajo ya no se ve, la de arriba tiene que decir de qué se trata (ver la clave para
// cobrar, que muestra a quién, cuánto y cómo).
// ============================================

import { useId, useLayoutEffect, useSyncExternalStore } from 'react';

let pila = [];
const oyentes = new Set();

function avisar() {
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

const leer = () => pila;

/**
 * El lugar de una ventana en la pila.
 *
 * @param {boolean} abierta
 * @returns {{ arriba: boolean, sobreOtra: boolean }} `arriba`: es la que se ve y atiende el
 *   teclado. `sobreOtra`: se abrió encima de otra (no oscurece el fondo de nuevo).
 */
export function useCapaDeVentana(abierta) {
  const id = useId();

  // Antes de pintar: si no, la ventana nueva se vería un instante junto a la de abajo.
  useLayoutEffect(() => {
    if (!abierta) return undefined;
    pila = [...pila.filter((x) => x !== id), id];
    avisar();
    return () => {
      pila = pila.filter((x) => x !== id);
      avisar();
    };
  }, [abierta, id]);

  const actual = useSyncExternalStore(suscribir, leer, leer);
  const lugar = actual.indexOf(id);
  return {
    // Mientras todavía no se anotó (su primer dibujo) es, por definición, la que se está abriendo.
    arriba: lugar === -1 || lugar === actual.length - 1,
    sobreOtra: lugar > 0,
  };
}

/** Las clases del fondo de una ventana según su lugar en la pila (ver feedback.css). */
export function clasesDeCapa({ arriba, sobreOtra }) {
  return `${arriba ? '' : ' ventana-tapada'}${sobreOtra ? ' ventana-encima' : ''}`;
}

/** Solo para las pruebas: arranca cada una con la pila vacía. */
export function _vaciarPilaDeVentanas() {
  pila = [];
  avisar();
}
