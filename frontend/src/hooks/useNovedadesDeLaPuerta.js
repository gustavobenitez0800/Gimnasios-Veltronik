// ============================================
// VELTRONIK - EL MOSTRADOR SE ENTERA AL INSTANTE DE LO QUE PASA EN LA PUERTA
// ============================================
// Reportado por el dueño (2026-09-22): cuando el socio marca por QR, el cartel de los días,
// el aviso de "necesita atención" y la X llegaban TARDE al escritorio; a mano, al instante.
//
// A mano el cartel lo pinta el propio clic. Por QR el que marca es el celular del socio, y el
// mostrador solo se entera PREGUNTANDO. Preguntaba poco y mal:
//   · cada 3 s con la ventana en foco, pero cada 15 s sin foco — y en un mostrador el foco
//     casi nunca está en Veltronik (está en la música, en el WhatsApp del gimnasio);
//   · y NADA con la ventana tapada o minimizada: Windows la marca como oculta y Chromium,
//     además, frena sus temporizadores.
//
// Ahora se pregunta una MARCA cada 2 segundos, siempre, se vea o no la ventana: dos cuentas
// en el servidor sobre un índice, que cambian con cada entrada, salida, aviso atendido o
// rechazo del molinete. Recién cuando cambia se pide el mostrador entero.
//
// ⚠️ Solo el escritorio escucha con la ventana oculta. En el navegador, una pestaña que nadie
// mira no tiene a quién avisarle, y preguntar ahí es gastar.
// ============================================

import { useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import CONFIG from '../lib/config';

export const CADA_MS = 2000;

/**
 * @param {Function} alCambiar  qué hacer cuando pasó algo (normalmente, pedir el mostrador)
 * @param {boolean}  activo     false = no preguntar (sin red, por ejemplo)
 */
export function useNovedadesDeLaPuerta(alCambiar, activo = true) {
  const alCambiarRef = useRef(alCambiar);
  const activoRef = useRef(activo);
  useEffect(() => {
    alCambiarRef.current = alCambiar;
    activoRef.current = activo;
  });

  // Se monta UNA vez: depender de la identidad de `alCambiar` desarmaría el temporizador en
  // cada render, que es el bug que ya hizo tardar al QR una vez (ver useRefrescoAutomatico).
  useEffect(() => {
    let ultima = null;
    let enVuelo = false;
    let vivo = true;

    const preguntar = async () => {
      if (!activoRef.current || enVuelo) return;
      if (!CONFIG.IS_DESKTOP && document.visibilityState !== 'visible') return;
      enVuelo = true;
      try {
        const { data } = await apiClient.get('/gym/access/novedades', { timeout: 5000 });
        const marca = data?.marca ?? null;
        if (!vivo || marca == null) return;
        // La primera respuesta es el punto de partida, no una novedad: lo que ya estaba al abrir
        // la pantalla lo trae el primer pedido del mostrador.
        if (ultima !== null && marca !== ultima) alCambiarRef.current();
        ultima = marca;
      } catch {
        // Un backend viejo (404) o un corte: el latido lento del mostrador sigue de red.
      } finally {
        enVuelo = false;
      }
    };

    preguntar();
    const t = setInterval(preguntar, CADA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);
}
