// ============================================
// VELTRONIK - LA CLAVE PARA COBRAR (la que la pide)
// ============================================
// Lo pidió un gimnasio (08/11/2026): «a veces los socios se renuevan solos la cuota». La PC del
// mostrador queda con la sesión abierta, y cualquiera que se acerque puede registrarse un cobro.
// El dueño prende, si quiere, una clave en Ajustes (ClaveDeCobroSettings). Con ella puesta, se
// pide antes de:
//   · registrar un cobro (el cobro rápido de Socios y de la puerta, y Pagos),
//   · editar o anular un cobro, y
//   · cambiar a mano el vencimiento de un socio.
//
// Quien la necesita llama a `pedirClave(motivo)`: si la sucursal no pide clave, contesta que sí al
// instante; si la pide, abre la ventanita y contesta cuando se escribió bien (o false si se
// canceló). Sin este proveedor alrededor (un test, una pantalla suelta) también contesta que sí.
//
// Sin internet anda igual: compara con la huella de la última vez (ver lib/claveDeCobro).
// ============================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { claveDeCobroService, errorService } from '../services';
import { leerLocal, guardarLocal, huellaDe } from '../lib/claveDeCobro';
import { useAlPonerseAlDia } from '../hooks/useAlPonerseAlDia';
import Modal, { ModalActions } from '../components/ui/Modal';

/** Para qué se pide, dicho en la ventanita. */
const PARA = {
  cobrar: 'para registrar el cobro',
  editar: 'para guardar los cambios del cobro',
  anular: 'para anular el cobro',
  vencimiento: 'para cambiar el vencimiento a mano',
};

/** Cada cuánto se vuelve a preguntar si la sucursal pide clave (la puede prender el dueño desde su casa). */
const REVISAR_MS = 5 * 60 * 1000;

const SIN_CLAVE = { activa: false, pedirClave: async () => true, recargar: async () => {}, alCambiar: () => {} };

const Ctx = createContext(null);

/** La clave para cobrar. Sin el proveedor alrededor, no pide nada. */
export function useClaveDeCobro() {
  return useContext(Ctx) || SIN_CLAVE;
}

/** Sin internet, cinco intentos y un minuto de espera, como en el servidor. */
const freno = { fallidos: 0, hasta: 0 };

/**
 * Comprueba la clave: con el servidor si hay internet (y guarda la huella para cuando no haya), y
 * contra la huella si no lo hay.
 * @returns {Promise<{ok: boolean, mensaje?: string}>}
 */
export async function comprobarClave(sucursal, clave) {
  try {
    await claveDeCobroService.verificar(clave);
    guardarLocal(sucursal, { activa: true, huella: await huellaDe(sucursal, clave) });
    return { ok: true };
  } catch (error) {
    // El servidor contestó que no (o que esperen): se dice lo que dijo.
    if (error?.response) return { ok: false, mensaje: errorService.getMessage(error) };

    const { huella } = leerLocal(sucursal);
    // Esta PC nunca la comprobó con internet: no hay contra qué comparar, y la caja no se frena.
    if (!huella) return { ok: true };
    if (Date.now() < freno.hasta) return { ok: false, mensaje: 'Demasiados intentos. Esperá un minuto.' };
    if ((await huellaDe(sucursal, clave)) === huella) {
      freno.fallidos = 0;
      return { ok: true };
    }
    freno.fallidos += 1;
    if (freno.fallidos >= 5) {
      freno.fallidos = 0;
      freno.hasta = Date.now() + 60_000;
    }
    return { ok: false, mensaje: 'Clave incorrecta.' };
  }
}

/** Solo para los tests: que cada uno arranque sin el freno del anterior. */
export function _reiniciarFreno() {
  freno.fallidos = 0;
  freno.hasta = 0;
}

export function ClaveDeCobroProvider({ children }) {
  const { orgId } = useAuth();
  const sucursal = orgId || localStorage.getItem('current_org_id');
  const [activa, setActiva] = useState(() => leerLocal(sucursal).activa);
  const [pedido, setPedido] = useState(null);

  // Lo que dice el servidor; sin internet, lo último que dijo (guardado en esta PC).
  const recargar = useCallback(async () => {
    if (!sucursal) return;
    try {
      const enElServidor = await claveDeCobroService.estado();
      guardarLocal(sucursal, enElServidor ? { activa: true } : { activa: false, huella: null });
      setActiva(enElServidor);
    } catch {
      setActiva(leerLocal(sucursal).activa);
    }
  }, [sucursal]);

  useEffect(() => {
    recargar();
    const t = setInterval(recargar, REVISAR_MS);
    return () => clearInterval(t);
  }, [recargar]);
  // Al volver internet, se pregunta de nuevo.
  useAlPonerseAlDia(recargar);

  /**
   * @param {'cobrar'|'editar'|'anular'|'vencimiento'} motivo
   * @param {{ quien?: string, que?: string, extra?: string }} [detalle] lo que se está autorizando.
   *   Desde el 09/11 la ventana de abajo se esconde mientras se pide la clave (una sola ventana a
   *   la vista): esto es lo que queda a la vista para saber QUÉ se confirma.
   */
  const pedirClave = useCallback((motivo = 'cobrar', detalle = null) => {
    if (!activa) return Promise.resolve(true);
    return new Promise((resolver) => setPedido({ motivo, detalle, resolver }));
  }, [activa]);

  /** Ajustes acaba de ponerla, cambiarla o sacarla: esta PC se entera ya, con la huella nueva. */
  const alCambiar = useCallback(async (quedoActiva, clave = null) => {
    if (!sucursal) return;
    guardarLocal(sucursal, quedoActiva
      ? { activa: true, huella: clave ? await huellaDe(sucursal, clave) : leerLocal(sucursal).huella }
      : { activa: false, huella: null });
    setActiva(quedoActiva);
  }, [sucursal]);

  const terminar = (ok) => {
    pedido?.resolver(ok);
    setPedido(null);
  };

  const valor = useMemo(() => ({ activa, pedirClave, recargar, alCambiar }), [activa, pedirClave, recargar, alCambiar]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <PedirClaveDeCobro pedido={pedido} sucursal={sucursal} onListo={terminar} />
    </Ctx.Provider>
  );
}

/** La ventanita: la clave, y Confirmar. Va después de todo, así queda encima del cobro. */
function PedirClaveDeCobro({ pedido, sucursal, onListo }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => {
    setClave('');
    setError('');
  }, [pedido]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!clave || comprobando) return;
    setComprobando(true);
    const r = await comprobarClave(sucursal, clave);
    setComprobando(false);
    if (r.ok) {
      onListo(true);
    } else {
      setError(r.mensaje);
      setClave('');
    }
  };

  const detalle = pedido?.detalle;
  const hayDetalle = !!(detalle && (detalle.quien || detalle.que || detalle.extra));

  return (
    <Modal isOpen={!!pedido} onClose={() => onListo(false)} title="Clave para cobrar" size="small">
      <form onSubmit={enviar} noValidate className="clave-cobro">
        {/* Lo que se está autorizando, como un ticket: la ventana de abajo ya no se ve. */}
        {hayDetalle && (
          <div className="clave-cobro-ticket">
            {detalle.quien && <strong className="clave-cobro-quien">{detalle.quien}</strong>}
            {detalle.que && <span className="clave-cobro-que">{detalle.que}</span>}
            {detalle.extra && <span className="clave-cobro-extra">{detalle.extra}</span>}
          </div>
        )}
        <p className="clave-cobro-texto">Escribí la clave {PARA[pedido?.motivo] || PARA.cobrar}.</p>
        <input
          type="password" inputMode="numeric" autoComplete="off" autoFocus
          className="form-input clave-cobro-campo" aria-label="Clave para cobrar"
          placeholder="4 a 8 números"
          value={clave} onChange={(e) => setClave(e.target.value.replace(/\D/g, '').slice(0, 8))}
        />
        {error && <p className="clave-cobro-error" role="alert">{error}</p>}
        <ModalActions onCancel={() => onListo(false)} saving={comprobando} submitText="Confirmar" savingText="Comprobando..." />
      </form>
    </Modal>
  );
}
