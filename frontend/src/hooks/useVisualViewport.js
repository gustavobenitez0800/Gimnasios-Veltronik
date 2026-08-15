// ============================================
// VELTRONIK - EL TECLADO DEL TELÉFONO EXISTE
// ============================================
// Problema: en un celular, cuando se abre el teclado, la ventana NO se achica. El
// `100dvh` de CSS sigue midiendo la pantalla entera, así que un diálogo "centrado"
// queda centrado respecto de una altura que ya no se ve: la mitad de abajo —donde
// justo está el campo de texto y el botón— termina tapada por el teclado. El usuario
// ve el título del modal y nada más, y no puede ni tocar el campo.
//
// La única fuente que sabe qué se ve de verdad es `window.visualViewport`. Este hook
// publica sus medidas como variables CSS en <html>, para que cualquier overlay se
// pueda dibujar sobre el área REAL en vez de sobre la teórica.
//
//   --vv-height     alto visible (sin el teclado)
//   --vv-offset-top desplazamiento desde arriba (iOS empuja la vista al hacer foco)
//
// Se activa solo mientras hay algo abierto que lo necesite: escuchar 'resize' del
// visualViewport todo el tiempo es gratis pero no tiene sentido.

import { useEffect } from 'react';

/**
 * @param {boolean} active mientras sea true, mantiene las variables CSS al día.
 */
export function useVisualViewport(active) {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    // Sin soporte (navegador viejo, Electron de escritorio) no pasa nada: el CSS usa
    // sus valores por defecto y el diálogo se comporta como siempre.
    if (!active || !vv) return;

    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--vv-height', `${vv.height}px`);
        root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
      });
    };

    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);

    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--vv-offset-top');
    };
  }, [active]);
}
