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
import { useAuth } from '../contexts/AuthContext';
import { accessService, paymentService, memberService } from '../services';
import { cajaService } from '../services/CajaService';
import { vaciar, disponible } from '../lib/colaAccesos';

/** Cada cuánto se reintenta si quedó algo. Cinco minutos: nadie está esperando esto. */
const CADA_MS = 5 * 60 * 1000;

/** Lo escucha la pantalla de Acceso para volver a contar sin que este módulo la conozca. */
export const EVENTO_COLA_CAMBIO = 'veltronik-cola-cambio';

export default function VaciadorDeCola() {
  const { showToast } = useToast();
  const { orgId } = useAuth();

  const intentar = useCallback(async () => {
    if (!disponible()) return;
    // Sin red no se intenta: serían pedidos condenados a fallar, cada uno con su ruido.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    // ⚠️ NI SIN SUCURSAL. El escritorio arranca borrando `current_org_id` a propósito, así
    // que en cada arranque hay una ventana sin sucursal. Un acceso que sale en esa ventana
    // viaja sin `X-Tenant-ID` y el backend lo corta con 401 "Falta contexto de negocio".
    //
    // No se perdía nada —un 401 no es definitivo, la fila se queda y se reintenta— pero se
    // quemaban DOS intentos en cada arranque, para siempre. Se encontró al revés: una fila
    // en la cola con `intentos: 2` y ningún motivo a la vista.
    if (!orgId) return;

    try {
      // Un enviador por tipo. Falta el CIERRE, que es el último paso (ver
      // docs/FASE3-CAMINOS.md) y el que más depende de que todo lo anterior lleve su
      // momento real.
      //
      // ⚠️ Lo que NO tiene enviador se queda en la cola y corta la tanda, no se descarta:
      // durante una actualización un terminal viejo puede encontrarse un tipo que su código
      // todavía no sabe mandar, y tirarlo sería tirar plata.
      const { enviados } = await vaciar({
        ACCESO: (item) => accessService.enviarEncolado(item),
        COBRO: (item) => paymentService.enviarEncolado(item),
        // ⚠️ El ALTA va en la MISMA cola y por eso sube antes que el cobro a ese socio: si
        // fueran colas separadas, el servidor recibiría un cobro de alguien que no existe.
        ALTA: (item) => memberService.enviarEncolado(item),
        // ⚠️ El egreso sube con SU momento, no con el de llegada: un gasto de anoche que sube
        // esta mañana tiene que quedar en el arqueo de anoche, o descuadra los dos días.
        EGRESO: (item) => cajaService.enviarEncolado(item),
      });
      if (enviados > 0) {
        // ⚠️ "ACCESO", NO "ENTRADA". La cola no sabe la dirección: eso lo decide el servidor
        // mirando el estado del socio en el momento en que ocurrió. Llamarle "entrada" a lo
        // que subió es inventar la mitad del dato —y de hecho puede ser una SALIDA, porque
        // marcar la salida sin conexión también pasa por acá—. Es la misma regla que ya
        // aplica el cartel del mostrador cuando dice "Guardado sin conexión" en vez de
        // "Entrada registrada". El dueño lo vio en pantalla: subió una salida y el aviso le
        // dijo "entrada".
        showToast(
          `Se ${enviados === 1 ? 'registró' : 'registraron'} ${enviados} `
          + `${enviados === 1 ? 'acceso que estaba esperando' : 'accesos que estaban esperando'}`,
          'success',
        );
      }
    } catch {
      // Que el vaciado falle no puede romper nada: los accesos siguen en la cola y se
      // reintentan solos. Es exactamente para lo que la cola existe.
    }
    window.dispatchEvent(new Event(EVENTO_COLA_CAMBIO));
  }, [showToast, orgId]);

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
