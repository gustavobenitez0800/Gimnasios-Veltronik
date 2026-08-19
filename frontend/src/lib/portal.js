// ============================================
// VELTRONIK - PUENTE AL PORTAL WEB (Fase 4)
// ============================================
// La app de escritorio no lleva adentro las pantallas de cuenta ni de cobro. Este módulo
// es el ÚNICO lugar que sabe cómo mandar al usuario al portal, y hace dos cosas distintas
// según dónde corra:
//
//   · En la web  → navega, como cualquier link.
//   · En Electron → abre el NAVEGADOR DEL SISTEMA por IPC y NUNCA navega la ventana.
//
// Por qué eso último importa: hasta ahora el cobro hacía `window.location.href = init_point`,
// o sea llevaba la ventana de la app a Mercado Pago. MP devolvía al cliente a la URL web,
// la app nunca se enteraba de que había pagado, y el cliente volvía a intentar el pago —
// cada reintento, un rechazo más en MP. Sacar la navegación de la ventana es la cura.

import CONFIG from './config';

/** URL absoluta del portal para un path dado ('' = la home). */
export function portalUrl(path = '') {
  const base = (CONFIG.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
  if (!path) return base;
  return base + (path.startsWith('/') ? path : `/${path}`);
}

/**
 * Manda al usuario al portal web.
 *
 * @returns {Promise<boolean>} true si se pudo abrir. En escritorio, `false` significa
 *   que el navegador no abrió (sin handler, o el proceso principal rechazó la URL por
 *   lista blanca): el llamador debería mostrar la dirección en pantalla para que la
 *   copie a mano. En la web siempre es true.
 */
export async function openPortal(path = '') {
  const url = portalUrl(path);

  if (CONFIG.IS_DESKTOP) {
    // Jamás `window.location.href` acá: sacaría la app de su propia pantalla.
    try {
      return (await window.electronAPI?.openExternal?.(url)) === true;
    } catch {
      return false;
    }
  }

  window.location.href = url;
  return true;
}
