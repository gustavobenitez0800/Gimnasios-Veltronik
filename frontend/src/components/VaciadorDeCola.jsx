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
//
// Y es el que PONE TODO AL DÍA cuando vuelve la conexión (ver `alVolver`): el orden entre
// subir la cola y volver a pedir los datos importa, y en un solo lugar no se puede invertir.

import { useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { accessService, paymentService, memberService } from '../services';
import { cajaService } from '../services/CajaService';
import { vaciar, disponible } from '../lib/colaAccesos';
import { sinConexion, alCambiarLaConexion } from '../lib/conexion';
import { refrescarSocios } from '../lib/localMembers';
import { refrescarTodo } from '../hooks/queryCacheStore';

/** Cada cuánto se reintenta si quedó algo. Cinco minutos: nadie está esperando esto. */
const CADA_MS = 5 * 60 * 1000;

/** Lo escucha la pantalla de Acceso para volver a contar sin que este módulo la conozca. */
export const EVENTO_COLA_CAMBIO = 'veltronik-cola-cambio';

export default function VaciadorDeCola() {
  const { showToast } = useToast();
  const { orgId } = useAuth();

  /** Sube lo que haya. Devuelve cuántos subieron (0 si no le tocaba intentar). */
  const intentar = useCallback(async () => {
    if (!disponible()) return 0;
    // Sin red no se intenta: serían pedidos condenados a fallar, cada uno con su ruido.
    if (sinConexion()) return 0;

    // ⚠️ NI SIN SUCURSAL. El escritorio arranca borrando `current_org_id` a propósito, así
    // que en cada arranque hay una ventana sin sucursal. Un acceso que sale en esa ventana
    // viaja sin `X-Tenant-ID` y el backend lo corta: hoy con 400 TENANT_CONTEXT_MISSING (hasta
    // la fase A de la sesión, con 401 "Falta contexto de negocio").
    //
    // No se perdía nada —ninguno de los dos es definitivo para la cola (ver esDefinitivo), la
    // fila se queda y se reintenta— pero se
    // quemaban DOS intentos en cada arranque, para siempre. Se encontró al revés: una fila
    // en la cola con `intentos: 2` y ningún motivo a la vista.
    if (!orgId) return 0;

    let subieron = 0;
    try {
      // Un enviador por tipo: los cinco caminos que tocan plata más los accesos
      // (ver docs/FASE3-CAMINOS.md). Ya están todos.
      //
      // ⚠️ Lo que NO tiene enviador se queda en la cola y corta la tanda, no se descarta:
      // durante una actualización un terminal viejo puede encontrarse un tipo que su código
      // todavía no sabe mandar, y tirarlo sería tirar plata.
      const { enviados = 0 } = await vaciar({
        ACCESO: (item) => accessService.enviarEncolado(item),
        // ⚠️ La SALIDA no es un ACCESO. El acceso pide que el servidor deduzca la dirección
        // contra el momento; la salida le dice QUÉ visita cerrar. Se usa cuando el mostrador
        // tenía la lista en pantalla —o sea, tenía el id— y el pedido murió en el transporte.
        SALIDA: (item) => accessService.enviarSalidaEncolada(item),
        COBRO: (item) => paymentService.enviarEncolado(item),
        // ⚠️ El ALTA va en la MISMA cola y por eso sube antes que el cobro a ese socio: si
        // fueran colas separadas, el servidor recibiría un cobro de alguien que no existe.
        ALTA: (item) => memberService.enviarEncolado(item),
        // ⚠️ El egreso sube con SU momento, no con el de llegada: un gasto de anoche que sube
        // esta mañana tiene que quedar en el arqueo de anoche, o descuadra los dos días.
        EGRESO: (item) => cajaService.enviarEncolado(item),
        // ⚠️ EL CIERRE VA ÚLTIMO EN LA COLA Y ESO NO ES CASUAL: cuando llega, el servidor ya
        // recibió todos los cobros del día, así que cuenta el número completo él mismo. Por
        // eso el total no se manda desde el terminal — solo se manda lo que MOSTRÓ, para
        // poder comparar.
        CIERRE: (item) => cajaService.enviarCierreEncolado(item),
      });
      subieron = enviados;
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
    return subieron;
  }, [showToast, orgId]);

  useEffect(() => {
    // Si subió algo, lo que muestran Socios, Pagos o la Caja quedó viejo: recién ahora el
    // servidor sabe de esos cobros y altas.
    const cadaTanto = async () => {
      if ((await intentar()) > 0) refrescarTodo();
    };

    // ⭐ AL VOLVER LA CONEXIÓN: PRIMERO SUBE LA COLA, DESPUÉS SE PONE TODO AL DÍA.
    //
    // Reportado por el dueño (30/09): al prender internet las pantallas seguían mostrando lo
    // que habían sacado de la copia local, y había que salir del sistema y volver a entrar.
    //
    // El orden importa: si las pantallas pidieran antes de que suba la cola, la Caja traería
    // del servidor unos totales SIN los cobros que se hicieron sin conexión — un número más
    // bajo que el que se veía un segundo antes. Primero se sube, después se pregunta.
    const alVolver = async () => {
      await intentar();
      refrescarTodo();
      if (orgId) refrescarSocios(orgId).catch(() => {});
    };

    cadaTanto();
    // En el escritorio la vuelta la avisa lib/conexion, que sondea el servidor: el `online` del
    // navegador no llega con el router prendido y sin internet, que es el corte más común. Se
    // escuchan los dos porque en la web no hay quien sondee. El temporizador es la red de
    // seguridad para cuando ninguna señal llega.
    window.addEventListener('online', cadaTanto);
    const soltar = alCambiarLaConexion((hay) => { if (hay) alVolver(); });
    const t = setInterval(cadaTanto, CADA_MS);
    return () => {
      window.removeEventListener('online', cadaTanto);
      soltar();
      clearInterval(t);
    };
  }, [intentar, orgId]);

  return null;
}
