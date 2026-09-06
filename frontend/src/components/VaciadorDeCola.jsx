// ============================================
// VELTRONIK - EL QUE VACÍA LA COLA, MIRE DONDE MIRE
// ============================================
// Manda al servidor los accesos que se registraron sin internet. No dibuja nada.
//
// ⚠️ POR QUÉ NO VIVE EN LA PANTALLA DE ACCESO, QUE ES DONDE NACIÓ
// Ahí estaba al principio, y era un agujero: el vaciado solo corría mientras esa pantalla
// estuviera abierta. Un terminal que quedó en el Dashboard —o en Socios, o minimizado en
// Ajustes— cuando volvió el internet se quedaba con las visitas adentro hasta que a alguien
// se le ocurriera volver al mostrador. Y como la app no avisa nada, podían pasar días.
//
// Lo que hay en esa cola son visitas reales que el gimnasio TODAVÍA NO TIENE en ningún otro
// lado. Que suban no puede depender de en qué pantalla quedó parado el terminal.
//
// Monta una sola vez, dentro del proveedor de sesión, y avisa por un evento cuando la cola
// cambió — así la pantalla de Acceso actualiza su contador sin que este componente tenga que
// conocerla.

import { useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { accessService } from '../services';
import { vaciar, disponible } from '../lib/colaAccesos';

/** Cada cuánto se reintenta si quedó algo. Cinco minutos: nadie está esperando esto. */
const CADA_MS = 5 * 60 * 1000;

/** Lo escucha la pantalla de Acceso para volver a contar sin que este módulo la conozca. */
export const EVENTO_COLA_CAMBIO = 'veltronik-cola-cambio';

export default function VaciadorDeCola() {
  const { showToast } = useToast();

  const intentar = useCallback(async () => {
    if (!disponible()) return;
    // Sin red no se intenta: serían pedidos condenados a fallar, cada uno con su ruido.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    try {
      const { enviados } = await vaciar((item) => accessService.enviarEncolado(item));
      if (enviados > 0) {
        showToast(
          `Se ${enviados === 1 ? 'registró' : 'registraron'} ${enviados} `
          + `${enviados === 1 ? 'entrada que estaba esperando' : 'entradas que estaban esperando'}`,
          'success',
        );
      }
    } catch {
      // Que el vaciado falle no puede romper nada: los accesos siguen en la cola y se
      // reintentan solos. Es exactamente para lo que la cola existe.
    }
    window.dispatchEvent(new Event(EVENTO_COLA_CAMBIO));
  }, [showToast]);

  useEffect(() => {
    intentar();
    // `online` es la señal barata: lo emite el sistema operativo cuando aparece la red. El
    // temporizador es la red de seguridad para cuando esa señal no llega (un router que
    // nunca se cayó del todo, una conexión que volvió sin avisar).
    window.addEventListener('online', intentar);
    const t = setInterval(intentar, CADA_MS);
    return () => {
      window.removeEventListener('online', intentar);
      clearInterval(t);
    };
  }, [intentar]);

  return null;
}
