import { molineteService } from '../services/MolineteService';

/**
 * Mantener el molinete al día, desde un solo lugar.
 *
 * <p><b>La regla de diseño.</b> Recepción no tiene que saber que el molinete existe. Nadie
 * debería acordarse de apretar "sincronizar" después de cobrar: si el socio paga y camina hasta
 * la puerta, la puerta tiene que abrirse. Todo lo que cambie <i>quién puede pasar</i> avisa por
 * acá, y el resto es problema del sistema.</p>
 *
 * <p>Importa {@code MolineteService} directo y no el índice de servicios a propósito: el índice
 * importa a los demás servicios, y uno de ellos —Pagos— importa este archivo. Por el índice
 * sería un círculo.</p>
 */

/** Cuánto se espera antes de sincronizar, para juntar los cambios que vienen de a ráfagas. */
const ESPERA_MS = 1500;

let pendiente = null;

/** ¿Esta computadora puede hablarle al equipo? En la web y sin configurar, no. */
function puente() {
  return typeof window !== 'undefined' ? window.electronAPI?.molinete : null;
}

/**
 * Baja el padrón y se lo aplica al equipo. Es la ÚNICA implementación: la usan el botón de
 * Ajustes, el ciclo automático y el disparo del cobro.
 *
 * <p>Las dos mitades están separadas a propósito: si el backend no contesta, no se toca el
 * equipo. Sincronizar contra una lista incompleta es peor que no sincronizar — puede terminar
 * cerrándole el horario a socios que están al día.</p>
 */
export async function sincronizarMolinete() {
  const api = puente();
  if (!api) return { ok: false, error: 'Esta computadora no tiene el molinete a mano.' };

  const cfg = await api.getConfig().catch(() => null);
  if (!cfg?.ip || !cfg?.clave) return { ok: false, error: 'El molinete no está configurado.' };

  try {
    const padron = await molineteService.getPadron();
    return await api.sincronizar(padron);
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo traer el padrón.' };
  }
}

/**
 * "Cambió algo que decide quién pasa": un cobro, una fecha, una baja.
 *
 * <p>No devuelve nada y no interrumpe a nadie: quien cobra ya terminó su trabajo y no tiene que
 * esperar a un aparato de la pared. Si falla, la próxima corrida del ciclo automático lo
 * arregla, porque el estado real vive en el equipo y se compara contra él.</p>
 *
 * <p>Espera un momento antes de salir para juntar las ráfagas: asignar un arancel a doscientos
 * socios de una vez es UN cambio, no doscientos.</p>
 */
export function avisarCambioDeCobertura() {
  if (!puente()) return;
  clearTimeout(pendiente);
  pendiente = setTimeout(() => {
    sincronizarMolinete().then((r) => {
      if (!r?.ok) console.warn('[Molinete] No se pudo sincronizar tras un cambio:', r?.error);
    });
  }, ESPERA_MS);
}
