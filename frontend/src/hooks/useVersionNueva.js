import { useEffect, useState } from 'react';
import CONFIG from '../lib/config';

/**
 * ¿Salió una versión nueva de la web mientras esta pantalla estaba abierta?
 *
 * ⭐ EL PROBLEMA REAL, COMPROBADO EN VIVO (2026-09-03). La app es una SPA: moverse entre
 * módulos cambia el `#/hash`, y eso NO recarga el documento. Una pestaña abierta sigue
 * corriendo el bundle con el que se abrió, para siempre. Al verificar un deploy me encontré
 * mirando una versión de DOS deploys atrás y casi doy por roto un arreglo que ya estaba
 * publicado.
 *
 * En el gimnasio es peor: el terminal del mostrador se abre a la mañana y queda prendido
 * todo el día. Si se publica un arreglo —el del QR, sin ir más lejos— esa máquina no lo ve
 * hasta que alguien recarga a mano. Y nadie recarga a mano: no hay motivo para hacerlo.
 *
 * CÓMO SE DETECTA. Se pide el `index.html` sin caché y se compara el nombre del bundle
 * (`assets/index-<hash>.js`) con el que está corriendo. Vite le pone un hash distinto a cada
 * build, así que un nombre distinto ES una versión distinta. No hace falta tocar el build ni
 * inventar un archivo de versión que después haya que acordarse de actualizar.
 *
 * ⚠️ LO QUE ESTE HOOK NO HACE: recargar solo. Recargar por su cuenta a alguien que está a
 * mitad de un cobro le borra lo que estaba escribiendo. Solo avisa; recarga la persona.
 *
 * En el ESCRITORIO no corre: ahí la actualización la maneja electron-updater con el
 * instalador, y el `index.html` se sirve por `file://`, donde esto no significa nada.
 */

/** Cada cuánto se pregunta. 10 minutos: un aviso no es una urgencia. */
const CADA_MS = 10 * 60 * 1000;

/** El bundle que está corriendo AHORA, sacado de los <script> de la página. */
function bundleActual() {
  const src = [...document.querySelectorAll('script[src]')]
    .map((s) => s.getAttribute('src') || '')
    .find((s) => /assets\/index-.*\.js/.test(s));
  return src ? src.split('/').pop() : null;
}

/** El bundle que el servidor está sirviendo en este momento. */
async function bundlePublicado() {
  // `no-store` y un parámetro que cambia: sin las dos cosas, el navegador (o el CDN)
  // contesta con el HTML viejo que ya tenía y esto no detectaría nunca nada.
  const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? m[0].split('/').pop() : null;
}

export function useVersionNueva() {
  const [hayVersionNueva, setHayVersionNueva] = useState(false);

  useEffect(() => {
    // En el escritorio actualiza el instalador, no esto.
    if (CONFIG.IS_DESKTOP) return undefined;

    const actual = bundleActual();
    // Sin un bundle con hash (desarrollo con Vite) no hay nada que comparar.
    if (!actual) return undefined;

    let vivo = true;

    const revisar = async () => {
      if (!vivo || document.visibilityState !== 'visible') return;
      try {
        const publicado = await bundlePublicado();
        if (vivo && publicado && publicado !== actual) setHayVersionNueva(true);
      } catch {
        // Sin internet no hay nada que avisar. El que está sin señal ya tiene otro problema.
      }
    };

    const t = setInterval(revisar, CADA_MS);
    // Al volver a la pestaña: es cuando la persona vuelve a mirar, y el momento más probable
    // de que haya pasado un rato desde la última vez.
    document.addEventListener('visibilitychange', revisar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', revisar);
    };
  }, []);

  return hayVersionNueva;
}
