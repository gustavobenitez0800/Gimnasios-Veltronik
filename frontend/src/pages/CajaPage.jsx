// ============================================
// VELTRONIK - CIERRE DE CAJA DIARIO
// ============================================
// Una pregunta: ¿la plata que entró al sistema es la plata que hay?
//
// ─── EL CAMBIO DEL 2026-09-02, Y POR QUÉ ───
//
// Esta pantalla era un ARQUEO A CIEGAS: quien cerraba contaba la plata, escribía el monto
// sin poder ver lo esperado, y recién ahí el sistema mostraba la diferencia. La idea era
// que no se pudiera "ajustar" el número al esperado.
//
// El dueño lo cambió, y el motivo es bueno: el sistema YA SABE cuánto entró por efectivo y
// cuánto por transferencia —cada cobro tiene su forma de pago— así que hacer que una
// persona lo vuelva a averiguar y lo tipee es rehacer a mano una cuenta ya hecha. Ahora la
// pantalla lo muestra sumado, y lo único que decide una persona es CUÁNTO SE LLEVA.
//
// ⚠️ LO QUE SE PIERDE, DICHO EN CLARO: sin conteo declarado el sistema no puede avisar que
// falta plata del cajón. Se decidió sabiendo el costo — contar y tipear todos los días
// también tiene el suyo, y es que la caja deje de cerrarse. Una caja que no se cierra no
// detecta nada.
//
// ─── LO QUE NO CAMBIÓ, Y NO HAY QUE TOCAR ───
//
// EL FONDO. En el cajón está el cambio de ayer MÁS lo cobrado hoy. Sin sumarlo, todos los
// cierres daban sobrante por el mismo monto. Ahora no lo declara nadie: es lo que el cierre
// de ayer decidió DEJAR en el cajón, y por eso desapareció el paso de "abrir caja".
//
// LOS EGRESOS. Del cajón también sale plata. Sin restarlos, el día que se le paga a la
// limpieza el cierre decía FALTANTE y acusaba a quien atendió.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { cajaService } from '../services/CajaService';
import { errorService } from '../services';
import { formatCurrency } from '../lib/utils';
import { getShift } from '../lib/shift';
import { PageHeader } from '../components/Layout';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';

const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—');

const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);

/** Los mismos nombres que muestra la pantalla de Pagos: si difieren, parecen cosas distintas. */
const NOMBRE_METODO = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
  card: 'Tarjeta',
};

/** Lo que va al cajón contra lo que va al banco: es la separación que ordena la pantalla. */
const ES_EFECTIVO = (metodo) => String(metodo || '').toUpperCase() === 'CASH';

/**
 * En qué se gasta la plata de un gimnasio.
 *
 * Son sugerencias, no una lista cerrada: el backend guarda texto libre a propósito, porque
 * el gimnasio va a necesitar un rubro que hoy no imaginamos y eso no puede requerir una
 * migración.
 */
const CATEGORIAS_EGRESO = ['Limpieza', 'Adelanto', 'Proveedor', 'Mantenimiento', 'Retiro', 'Otro'];
const CATEGORIAS_INGRESO = ['Venta', 'Aporte', 'Otro'];

const numero = (v) => Number(v || 0);

export default function CajaPage() {
  const { showToast } = useToast();
  const { orgRole, profile } = useAuth();
  const esDueno = ['owner', 'admin'].includes(orgRole);

  const [abierto, setAbierto] = useState(null);
  const [cobros, setCobros] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Un pedido que falló no es un período vacío. Mostrar "0 cobros" cuando no se pudo
  // preguntar hace que alguien cierre una caja creyendo que no entró nada.
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // ─── El balance de ingresos: hoy y el mes ───
  //
  // Es una pregunta DISTINTA de "¿qué hay sin cerrar?". Si nadie cerró ayer, el período
  // abierto arrastra dos días y esto sigue diciendo lo de hoy. Por eso son dos pedidos y no
  // una resta sobre el mismo número.
  const [periodo, setPeriodo] = useState('hoy');
  const [balance, setBalance] = useState(null);
  const [hayBalance, setHayBalance] = useState(true);

  // Lo único que se declara al cerrar.
  const [retiro, setRetiro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // ─── Los movimientos de caja: lo que sale y entra sin ser un cobro ───
  //
  // ⚠️ ESTO ES LO QUE EVITA QUE LA CAJA MIENTA TODOS LOS DÍAS. Se le pagan $15.000 a la
  // chica de la limpieza del cajón; si no queda anotado, el sistema espera esa plata igual.
  const [movsCaja, setMovsCaja] = useState([]);
  // ¿El backend de este gimnasio sabe de movimientos? Uno que todavía no actualizó responde
  // 404, y ahí los botones se esconden en vez de ofrecer algo que va a fallar.
  const [hayMovimientos, setHayMovimientos] = useState(true);
  const [anotando, setAnotando] = useState(false);
  const [movTipo, setMovTipo] = useState('EGRESO');
  const [movCategoria, setMovCategoria] = useState('');
  const [movDetalle, setMovDetalle] = useState('');
  const [movMonto, setMovMonto] = useState('');
  const [movMetodo, setMovMetodo] = useState('CASH');

  const cargarBalance = useCallback(async (cual) => {
    try {
      setBalance(await cajaService.balance(cual));
      setHayBalance(true);
    } catch {
      // Backend viejo: el bloque se esconde y el cierre sigue funcionando.
      setBalance(null);
      setHayBalance(false);
    }
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);
    try {
      // El período abierto y sus cobros: los dos los necesita quien cierra, sea el dueño o
      // recepción. Antes los importes eran solo del dueño, por el conteo a ciegas.
      const [a, c] = await Promise.all([cajaService.abierto(), cajaService.movimientos()]);
      setAbierto(a);
      setCobros(c || []);

      // ⚠️ LOS MOVIMIENTOS NO PUEDEN TUMBAR LA PANTALLA ENTERA: si viajaran en el mismo
      // Promise.all, un backend sin esa función dejaría el cierre inutilizable.
      try {
        setMovsCaja((await cajaService.movimientosDeCaja()) || []);
        setHayMovimientos(true);
      } catch {
        setMovsCaja([]);
        setHayMovimientos(false);
      }

      if (esDueno) setHistorial(await cajaService.historial(60));
    } catch (e) {
      setFallo(true);
      showToast(errorService.getMessage(e), 'error');
    } finally {
      setCargando(false);
    }
  }, [esDueno, showToast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarBalance(periodo); }, [cargarBalance, periodo]);

  // ─── La cuenta del cajón, en un solo lugar ───
  //
  // El backend manda `esperadoEnElCajon` ya calculado (fondo + efectivo + ingresos −
  // egresos). Acá NO se recalcula: una cuenta de plata copiada en dos lados es una cuenta
  // que en algún lado va a estar mal, y este proyecto ya se comió esa lección tres veces.
  const enElCajon = numero(abierto?.esperadoEnElCajon);
  const retiroNum = useMemo(() => {
    const n = parseFloat(retiro);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [retiro]);
  const quedaEnCaja = Math.max(0, enElCajon - retiroNum);
  const retiroExcedido = retiroNum > enElCajon;

  const pedirMovimiento = (tipo) => {
    setMovTipo(tipo);
    setMovCategoria('');
    setMovDetalle('');
    setMovMonto('');
    setMovMetodo('CASH');
    setAnotando(true);
  };

  const anotarMovimiento = async (e) => {
    e?.preventDefault();
    if (!movCategoria) {
      showToast('Elegí en qué fue el gasto.', 'error');
      return;
    }
    if (movMonto.trim() === '' || !(parseFloat(movMonto) > 0)) {
      showToast('Escribí cuánta plata fue.', 'error');
      return;
    }
    // ⚠️ El detalle es obligatorio en los egresos y no es burocracia: es lo ÚNICO que hace
    // la lista revisable. "Proveedor — agua, factura 4412" se puede verificar; "Proveedor",
    // no. Un egreso inventado es el robo perfecto de este módulo.
    if (movTipo === 'EGRESO' && !movDetalle.trim()) {
      showToast('Escribí en qué se gastó. Sin eso no se puede verificar después.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const turno = getShift();
      await cajaService.registrarMovimiento({
        tipo: movTipo,
        categoria: movCategoria,
        detalle: movDetalle.trim() || null,
        monto: parseFloat(movMonto),
        metodo: movMetodo,
        hechoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setAnotando(false);
      showToast(movTipo === 'EGRESO' ? 'Gasto anotado.' : 'Ingreso anotado.', 'success');
      cargar();
      cargarBalance(periodo);
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const anularMovimiento = async (mov) => {
    const motivo = window.prompt('¿Por qué se anula? (queda registrado)');
    if (motivo === null) return;
    try {
      const turno = getShift();
      await cajaService.anularMovimiento(mov.id, {
        motivo,
        anuladoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      showToast('Movimiento anulado.', 'success');
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    }
  };

  const cerrarCaja = async () => {
    setGuardando(true);
    try {
      const turno = getShift();
      const cierre = await cajaService.cerrar({
        retiroEfectivo: retiroNum,
        nota: null,
        cerradoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setConfirmando(false);
      setRetiro('');
      setResultado(cierre);
      cargar();
      cargarBalance(periodo);
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const sinCerrarHace = diasDesde(abierto?.ultimoCierre);
  const totalCobrado = numero(abierto?.efectivo) + numero(abierto?.digital)
    + numero(abierto?.tarjeta) + numero(abierto?.otros);

  return (
    <div className="caja-page">
      <PageHeader
        title="Cierre de caja"
        subtitle="El sistema cuenta lo que entró; vos decidís cuánto se retira"
        icon="dollarSign"
      />

      {/* La forma más fácil de esconder algo no es mentir en el cierre: es no cerrar. */}
      {sinCerrarHace !== null && sinCerrarHace >= 2 && (
        <div className="caja-alerta">
          <Icon name="alertTriangle" size="1em" />
          <span>Hace {sinCerrarHace} días que no se cierra la caja.</span>
        </div>
      )}

      {fallo && (
        <div className="caja-alerta">
          <Icon name="alertTriangle" size="1em" />
          <span>No pudimos traer los datos de la caja. Probá de nuevo: cerrar sin esto sería a ciegas.</span>
        </div>
      )}

      {/* ─── BALANCE DE INGRESOS: HOY Y EL MES ─── */}
      {hayBalance && (
        <div className="card caja-balance">
          <div className="caja-balance-cabecera">
            <h3><Icon name="trendingUp" size="1em" /> Balance de ingresos</h3>
            <div className="caja-tabs">
              <button
                className={`btn btn-sm ${periodo === 'hoy' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPeriodo('hoy')}
              >Hoy</button>
              <button
                className={`btn btn-sm ${periodo === 'mes' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPeriodo('mes')}
              >Mes</button>
            </div>
          </div>
          <div className="caja-balance-cifras">
            <div className="caja-cifra">
              <span className="caja-cifra-valor">{formatCurrency(numero(balance?.total))}</span>
              <span className="caja-cifra-label">
                Total {periodo === 'hoy' ? 'de hoy' : 'del mes'}
              </span>
            </div>
            <div className="caja-cifra">
              <span className="caja-cifra-valor">{formatCurrency(numero(balance?.efectivo))}</span>
              <span className="caja-cifra-label">Efectivo</span>
            </div>
            <div className="caja-cifra">
              <span className="caja-cifra-valor">{formatCurrency(numero(balance?.digital))}</span>
              <span className="caja-cifra-label">Transferencia y MP</span>
            </div>
            <div className="caja-cifra">
              <span className="caja-cifra-valor">{numero(balance?.cantidadCobros)}</span>
              <span className="caja-cifra-label">Cobros</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── LOS COBROS DEL PERÍODO ───
           Un total que no se puede abrir es un número en el que hay que creer. Acá está cada
           cobro que lo forma. Lo ve quien cierra, que ahora también es recepción. */}
      <div className="card caja-cobros">
        <div className="table-header">
          <h3><Icon name="list" size="1em" /> Cobros a cerrar ({cobros.length})</h3>
          <span className="text-muted">{formatCurrency(totalCobrado)}</span>
        </div>
        {cargando ? (
          <p className="text-muted" style={{ padding: '1rem' }}><span className="spinner" /> Cargando...</p>
        ) : !cobros.length ? (
          <p className="text-muted" style={{ padding: '1rem' }}>Todavía no se cobró nada en este período.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Socio</th><th>Forma de pago</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {cobros.map((m) => (
                <tr key={m.id}>
                  <td data-label="Socio">{m.socio || <span className="text-muted">—</span>}</td>
                  <td data-label="Forma de pago">
                    <span className={`caja-metodo ${ES_EFECTIVO(m.metodo) ? 'es-efectivo' : 'es-digital'}`}>
                      {NOMBRE_METODO[String(m.metodo || '').toLowerCase()] || m.metodo || '—'}
                    </span>
                  </td>
                  <td data-label="Monto" className="caja-monto-celda">{formatCurrency(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── RESUMEN POR FORMA DE PAGO ───
           Lo que antes había que averiguar mirando cobro por cobro. Es la cuenta que el
           dueño quería hacer de un vistazo: de 20 cobros, cuántos por transferencia y
           cuántos en efectivo. */}
      <div className="card caja-resumen">
        <h3><Icon name="wallet" size="1em" /> Resumen por forma de pago</h3>
        <div className="caja-resumen-grid">
          <div className="caja-cifra es-efectivo">
            <span className="caja-cifra-valor">{formatCurrency(numero(abierto?.efectivo))}</span>
            <span className="caja-cifra-label">Efectivo — está en el cajón</span>
          </div>
          <div className="caja-cifra es-digital">
            <span className="caja-cifra-valor">{formatCurrency(numero(abierto?.digital))}</span>
            <span className="caja-cifra-label">Transferencia y Mercado Pago — está en el banco</span>
          </div>
          <div className="caja-cifra">
            <span className="caja-cifra-valor">{formatCurrency(totalCobrado)}</span>
            <span className="caja-cifra-label">
              Total del período · {numero(abierto?.cantidadCobros)} cobros
            </span>
          </div>
        </div>
      </div>

      {/* ─── DISTRIBUCIÓN DEL EFECTIVO EN CAJA ───
           La única decisión del cierre. Todo lo de arriba lo calculó el sistema. */}
      <div className="card caja-distribucion">
        <h3><Icon name="dollarSign" size="1em" /> Distribución del efectivo en caja</h3>

        {/* La cuenta a la vista: sin esto, "en el cajón" es un número que hay que creer. */}
        <ul className="caja-cuenta">
          <li><span>Quedó de ayer en el cajón</span><strong>{formatCurrency(numero(abierto?.fondo))}</strong></li>
          <li><span>Cobrado hoy en efectivo</span><strong>+ {formatCurrency(numero(abierto?.efectivo))}</strong></li>
          {numero(abierto?.ingresosManuales) > 0 && (
            <li><span>Otros ingresos en efectivo</span><strong>+ {formatCurrency(numero(abierto?.ingresosManuales))}</strong></li>
          )}
          {numero(abierto?.egresos) > 0 && (
            <li><span>Gastos pagados del cajón</span><strong className="caja-falta">− {formatCurrency(numero(abierto?.egresos))}</strong></li>
          )}
          <li className="caja-cuenta-total"><span>Hay en el cajón</span><strong>{formatCurrency(enElCajon)}</strong></li>
        </ul>

        <div className="caja-reparto">
          <div className="form-group">
            <label className="form-label">Retiro en efectivo</label>
            <input
              type="number" inputMode="decimal" min="0"
              className="form-input caja-monto"
              value={retiro} placeholder="0"
              onChange={(e) => setRetiro(e.target.value)}
            />
            <small className="form-hint">
              Lo que te llevás del cajón. Si no retirás nada, dejalo en 0.
            </small>
          </div>

          <div className="caja-queda">
            <span className="caja-cifra-label">Queda en caja</span>
            <span className="caja-cifra-valor">{formatCurrency(quedaEnCaja)}</span>
            <small className="form-hint">Es el cambio con el que arranca mañana.</small>
          </div>
        </div>

        {retiroExcedido && (
          <p className="caja-falta">
            <Icon name="alertTriangle" size="0.9em" /> No podés retirar más de lo que hay en el
            cajón. Lo cobrado por transferencia está en el banco, no acá.
          </p>
        )}

        <button
          className="btn btn-primary caja-cerrar"
          onClick={() => setConfirmando(true)}
          disabled={guardando || cargando || fallo || retiroExcedido}
        >
          <Icon name="checkCircle" size="1em" /> Cerrar caja diaria
        </button>
      </div>

      {/* ─── LO QUE SALE Y ENTRA SIN SER UN COBRO ─── */}
      {hayMovimientos && (
        <div className="caja-acciones">
          <button className="btn btn-secondary" onClick={() => pedirMovimiento('EGRESO')} disabled={guardando}>
            <Icon name="trendingDown" size="1em" /> Anotar un gasto
          </button>
          <button className="btn btn-secondary" onClick={() => pedirMovimiento('INGRESO')} disabled={guardando}>
            <Icon name="trendingUp" size="1em" /> Anotar un ingreso
          </button>
        </div>
      )}

      {/* ⚠️ Los anulados quedan TACHADOS, no desaparecen. Un egreso que se puede hacer
           desaparecer de la lista es justamente lo que no queremos que se pueda hacer. */}
      {movsCaja.length > 0 && (
        <div className="card caja-movimientos">
          <h3><Icon name="wallet" size="1em" /> Movimientos de caja ({movsCaja.length})</h3>
          <table className="table">
            <thead>
              <tr><th>Qué</th><th>Monto</th><th>Método</th><th>Quién</th><th>Cuándo</th><th /></tr>
            </thead>
            <tbody>
              {movsCaja.map((m) => {
                const anulado = !!m.anuladoAt;
                const egreso = m.tipo === 'EGRESO';
                return (
                  <tr key={m.id} className={anulado ? 'caja-mov-anulado' : ''}>
                    <td data-label="Qué">
                      <strong>{m.categoria}</strong>
                      {m.detalle && <div className="form-hint">{m.detalle}</div>}
                      {anulado && (
                        <div className="form-hint">
                          Anulado por {m.anuladoPorNombre || '—'}
                          {m.motivoAnulacion ? ` · ${m.motivoAnulacion}` : ''}
                        </div>
                      )}
                    </td>
                    <td data-label="Monto" className="caja-monto-celda">
                      <span className={egreso ? 'caja-falta' : 'caja-sobra'}>
                        {egreso ? '−' : '+'}{formatCurrency(m.monto)}
                      </span>
                    </td>
                    <td data-label="Método">
                      {NOMBRE_METODO[String(m.metodo || '').toLowerCase()] || m.metodo || '—'}
                      {/* Lo que no pasa por el cajón se anota pero NO mueve la cuenta. */}
                      {!ES_EFECTIVO(m.metodo) && <div className="form-hint">no toca el cajón</div>}
                    </td>
                    <td data-label="Quién">{m.hechoPorNombre || '—'}</td>
                    <td data-label="Cuándo">{fecha(m.fecha)}</td>
                    <td>
                      {!anulado && (
                        <button className="btn btn-sm btn-secondary" onClick={() => anularMovimiento(m)}>
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── EL HISTORIAL: solo el dueño, y es donde está el valor ─── */}
      {esDueno && (
        <div className="card caja-historial">
          <h3><Icon name="fileText" size="1em" /> Cierres anteriores</h3>
          {!historial.length ? (
            <p className="text-muted">Todavía no se cerró ninguna caja.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Cuándo</th><th>Quién</th><th>Efectivo</th><th>Transf. y MP</th>
                  <th>Retiro</th><th>Quedó en caja</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Cuándo">{fecha(c.hasta)}</td>
                    <td data-label="Quién">{c.cerradoPorNombre || '—'}</td>
                    <td data-label="Efectivo">{formatCurrency(c.esperadoEfectivo)}</td>
                    <td data-label="Transf. y MP">
                      {formatCurrency(numero(c.esperadoTransferencia) + numero(c.esperadoMercadopago))}
                    </td>
                    {/* Los cierres viejos son de la época del arqueo a ciegas: no tienen
                        retiro. Se muestran igual, con el guion, en vez de un cero que
                        diría que ese día no se retiró nada. */}
                    <td data-label="Retiro">
                      {c.retiroEfectivo == null
                        ? <span className="text-muted">—</span>
                        : formatCurrency(c.retiroEfectivo)}
                    </td>
                    <td data-label="Quedó en caja">
                      {c.quedaEnCaja == null
                        ? <span className="text-muted">—</span>
                        : formatCurrency(c.quedaEnCaja)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── CONFIRMAR CIERRE ───
           Cerrar el día no se deshace: el período siguiente arranca acá y el cajón queda
           encadenado a este número. Un clic de más no puede alcanzar. */}
      <Modal
        isOpen={confirmando}
        onClose={() => setConfirmando(false)}
        title="Confirmar cierre"
      >
        <div className="caja-confirmar">
          <p>
            Se cierra la caja con <strong>{formatCurrency(totalCobrado)}</strong> cobrados
            en {numero(abierto?.cantidadCobros)} operaciones.
          </p>
          <ul className="caja-cuenta">
            <li><span>Retirás en efectivo</span><strong>{formatCurrency(retiroNum)}</strong></li>
            <li className="caja-cuenta-total"><span>Queda en caja</span><strong>{formatCurrency(quedaEnCaja)}</strong></li>
          </ul>
          <p className="form-hint">
            Lo que queda es el cambio con el que arranca mañana. Después de cerrar no se
            puede volver atrás.
          </p>
          <div className="caja-confirmar-botones">
            <button className="btn caja-si" onClick={cerrarCaja} disabled={guardando}>
              {guardando ? <><span className="spinner" /> Cerrando…</> : <>Sí, cerrar caja</>}
            </button>
            <button className="btn caja-no" onClick={() => setConfirmando(false)} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── EL CIERRE RECIÉN HECHO ─── */}
      <Modal
        isOpen={!!resultado}
        onClose={() => setResultado(null)}
        title="Caja cerrada"
      >
        {resultado && (
          <div className="caja-resultado">
            <ul className="caja-cuenta">
              <li><span>Cobrado en efectivo</span><strong>{formatCurrency(resultado.esperadoEfectivo)}</strong></li>
              <li>
                <span>Transferencia y Mercado Pago</span>
                <strong>{formatCurrency(numero(resultado.esperadoTransferencia) + numero(resultado.esperadoMercadopago))}</strong>
              </li>
              <li><span>Retirado</span><strong>{formatCurrency(resultado.retiroEfectivo)}</strong></li>
              <li className="caja-cuenta-total">
                <span>Queda en caja para mañana</span>
                <strong>{formatCurrency(resultado.quedaEnCaja)}</strong>
              </li>
            </ul>
          </div>
        )}
      </Modal>

      {/* ─── ANOTAR UN GASTO O UN INGRESO ─── */}
      <Modal
        isOpen={anotando}
        onClose={() => setAnotando(false)}
        title={movTipo === 'EGRESO' ? 'Anotar un gasto' : 'Anotar un ingreso'}
        actions={<ModalActions onCancel={() => setAnotando(false)} saving={guardando} submitText="Anotar" />}
      >
        <form onSubmit={anotarMovimiento} noValidate>
          <div className="form-group">
            <label className="form-label">¿En qué?</label>
            <div className="caja-rubros">
              {(movTipo === 'EGRESO' ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO).map((c) => (
                <button
                  key={c} type="button"
                  className={`btn btn-sm ${movCategoria === c ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setMovCategoria(c)}
                >{c}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">¿Cuánto?</label>
            <input
              type="number" inputMode="decimal" min="0"
              className="form-input caja-monto"
              value={movMonto} placeholder="0" autoFocus
              onChange={(e) => setMovMonto(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              ¿En qué se gastó?{movTipo === 'INGRESO' && <span className="text-muted"> (opcional)</span>}
            </label>
            <input
              className="form-input" value={movDetalle}
              placeholder="Agua, factura 4412"
              onChange={(e) => setMovDetalle(e.target.value)}
            />
            {movTipo === 'EGRESO' && (
              <small className="form-hint">
                Escribilo con detalle: es lo que después permite verificar el gasto.
              </small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">¿De dónde salió?</label>
            <select className="form-input" value={movMetodo} onChange={(e) => setMovMetodo(e.target.value)}>
              <option value="CASH">Efectivo (del cajón)</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="MERCADOPAGO">Mercado Pago</option>
            </select>
            {/* Solo el efectivo mueve la cuenta del cajón: lo que se paga desde el banco no
                salió de ahí, y restarlo daría un faltante inventado. */}
            {movMetodo !== 'CASH' && (
              <small className="form-hint">
                Esto no cambia la cuenta del cajón — no salió plata de ahí. Queda anotado igual.
              </small>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
