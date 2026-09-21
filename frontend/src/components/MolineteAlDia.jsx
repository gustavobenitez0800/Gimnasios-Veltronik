// ============================================
// VELTRONIK - EL MOLINETE, AL DÍA SOLO
// ============================================
// No dibuja nada. Mantiene la lista del equipo sincronizada mientras Veltronik esté abierto
// en la computadora del local.
//
// POR QUÉ ESTÁ ACÁ Y NO EN LA PANTALLA DE AJUSTES
// Antes el ciclo vivía dentro de esa pantalla, así que los "cada tantos minutos" solo corrían
// mientras alguien la tuviera abierta — o sea, casi nunca. Y estaba detrás de una casilla que
// se podía dejar apagada. Las dos cosas convertían la corrección del sistema en algo que
// dependía de que una persona se acordara.
//
// La regla es la contraria: si hay un molinete configurado, el sistema lo mantiene al día y
// recepción no tiene que saber que existe.
// ============================================

import { useEffect } from 'react';
import { sincronizarMolinete } from '../lib/molinete';
import { useAuth } from '../contexts/AuthContext';

/**
 * Cada cuánto se revisa que el equipo esté como debe.
 *
 * <p>Es la RED DE SEGURIDAD, no el mecanismo principal: los cambios que importan —un cobro,
 * una baja— disparan la sincronización en el acto. Esto está para lo que no dispara nada, que
 * es sobre todo <b>el paso del tiempo</b>: a las 00:00 hay socios que se vencieron sin que
 * nadie tocara un botón, y la puerta tiene que enterarse igual.</p>
 */
const CADA_MS = 3 * 60 * 1000;

export default function MolineteAlDia() {
  // ⚠️ SIN SUCURSAL NO SE SINCRONIZA. El escritorio arranca borrando la sucursal hasta que
  // DeviceGate la confirma, y este componente corre en cualquier pantalla: sincronizaba en ese
  // hueco, el pedido salía sin sucursal, y el 401 que volvía terminaba cerrando la sesión —en
  // cada arranque de un gimnasio con molinete—. Se espera, igual que el VaciadorDeCola.
  const { orgId } = useAuth();

  useEffect(() => {
    if (!window.electronAPI?.molinete || !orgId) return undefined;

    let vivo = true;
    const correr = () => {
      if (!vivo) return;
      sincronizarMolinete().then((r) => {
        // Silencioso a propósito: esto corre solo y nadie lo pidió. Un cartel de error cada
        // tres minutos porque el equipo está desenchufado sería ruido que se aprende a
        // ignorar, y el día que importe nadie lo va a mirar. Queda en la consola, y la
        // pantalla de Ajustes es donde se ve el estado real cuando alguien va a buscarlo.
        if (!r?.ok && r?.error !== 'El molinete no está configurado.') {
          console.warn('[Molinete] Sincronización automática:', r?.error);
        }
      });
    };

    correr();                                   // apenas hay sucursal, para arrancar en orden
    const t = setInterval(correr, CADA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [orgId]);

  return null;
}
