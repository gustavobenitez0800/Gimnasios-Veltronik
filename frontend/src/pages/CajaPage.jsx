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
import { formatCurrency, formatDate, toLocalDateString, sumarPlata, horaDe } from '../lib/utils';
// Los nombres de las formas de pago y qué pasa por el cajón: los mismos de Pagos y del Excel.
import { nombreDeForma, esEfectivo } from '../lib/formasDePago';
import { getShift } from '../lib/shift';
import { descargarExcelDeCaja } from '../lib/excelDeCaja';
import { useRangoDeFechas } from '../hooks/useRangoDeFechas';
import { PageHeader, EmptyState } from '../components/Layout';
import SelectorDeFechas from '../components/SelectorDeFechas';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';

/** "21/09, 21:54": día y hora de 24, como se lee en un mostrador argentino (no "09:54 p. m."). */
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}) : '—');

/**
 * La hora si el cobro es de hoy; día y hora si es de otro día.
 *
 * <p>⭐ Desde la V88 el cierre toma también lo que se cargó TARDE con la fecha de un día que ya
 * cerró (antes no lo contaba ningún cierre). Esos cobros tienen que verse con su día: "18:30" a
 * secas haría creer que se cobraron hoy.</p>
 */
const cuandoDe = (iso) => {
  if (!iso) return '';
  return toLocalDateString(new Date(iso)) === toLocalDateString(new Date()) ? horaDe(iso) : fecha(iso);
};

/** El título del total según el atajo del selector. */
const TOTAL_DEL = { today: 'Total de hoy', week: 'Total de la semana', month: 'Total del mes', year: 'Total del año' };

const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);


/**
 * En qué se gasta la plata de un gimnasio.
 *
 * Son sugerencias, no una lista cerrada: el backend guarda texto libre a propósito, porque
 * el gimnasio va a necesitar un rubro que hoy no imaginamos y eso no puede requerir una
 * migración.
 */
const CATEGORIAS_EGRESO = ['Limpieza', 'Adelanto', 'Proveedor', 'Mantenimiento', 'Retiro', 'Otro'];
const CATEGORIAS_INGRESO = ['Venta', 'Aporte', 'Otro'];

/** Aporte y retiro son plata del dueño: mueven el cajón, pero no son ingreso ni gasto del negocio. */
const ES_DE_FONDOS = (rubro) => ['aporte', 'retiro'].includes(String(rubro || '').trim().toLowerCase());

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

  // ─── El balance de ingresos: el rango que elige el dueño ───
  //
  // Es una pregunta DISTINTA de "¿qué hay sin cerrar?". Si nadie cerró ayer, el período
  // abierto arrastra dos días y esto sigue diciendo lo de hoy. Por eso son dos pedidos y no
  // una resta sobre el mismo número. El selector es el mismo de Pagos (Hoy, Semana, Mes, Año
  // o dos fechas a mano).
  const rango = useRangoDeFechas('today');
  const { desde: balanceDesde, hasta: balanceHasta } = rango;
  const [balance, setBalance] = useState(null);
  const [hayBalance, setHayBalance] = useState(true);

  // ─── El Excel para el contador ───
  // Un día elegido (arranca en hoy), o el rango del balance. Lo que se baja es lo que dice el
  // servidor: la misma cuenta que esta pantalla y que el cierre.
  const hoy = toLocalDateString(new Date());
  const [diaExcel, setDiaExcel] = useState(hoy);
  const [exportando, setExportando] = useState(false);

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

  const cargarBalance = useCallback(async (desde, hasta) => {
    // Una fecha a medio escribir, o el "hasta" antes del "desde": no se pregunta nada.
    if (!desde || !hasta || desde > hasta) return;
    try {
      setBalance(await cajaService.balanceDeRango(desde, hasta));
      setHayBalance(true);
    } catch {
      // Backend viejo o sin conexión: el bloque se esconde y el cierre sigue funcionando.
      setBalance(null);
      setHayBalance(false);
    }
  }, []);

  const exportar = async (desde, hasta) => {
    if (!desde || !hasta || desde > hasta) {
      showToast('Elegí un día válido para el Excel.', 'error');
      return;
    }
    setExportando(true);
    try {
      await descargarExcelDeCaja(await cajaService.reporte(desde, hasta));
      showToast('Excel descargado.', 'success');
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setExportando(false);
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);

    // ⚠️ LOS MOVIMIENTOS SE CARGAN PRIMERO Y APARTE, Y AHORA NO ES SOLO PRECAUCIÓN.
    //
    // Nació así para que un backend sin esta función no dejara el cierre inutilizable. Con
    // los egresos sin internet pasó a ser necesario: sin conexión, el período abierto falla
    // —lo calcula el servidor— y dentro del mismo try eso se llevaba puesta la lista. Quien
    // acaba de anotar un gasto no lo vería, y lo cargaría de nuevo.
    try {
      setMovsCaja((await cajaService.movimientosDeCaja()) || []);
      setHayMovimientos(true);
    } catch {
      setMovsCaja([]);
      setHayMovimientos(false);
    }

    // ⚠️⚠️ ACÁ NO VA UN Promise.all, Y COSTÓ UNA PRUEBA EN UNA MÁQUINA DESCUBRIRLO.
    //
    // `Promise.all` se cae ENTERO si una sola de sus promesas falla. Los totales ya sabían
    // resolverse sin conexión —salen del espejo local— pero viajaban en el mismo Promise.all
    // que la lista de cobros, que iba derecho al servidor. Sin internet la lista explotaba y
    // se llevaba puestos los totales: la caja aparecía con TODO EN CERO, sin el cartel que
    // avisa, y ofreciendo cerrar un día que no había podido leer.
    //
    // Y es la MISMA trampa que el bloque de arriba ya había resuelto para los movimientos,
    // una llamada más allá. Por eso ahora las tres van separadas por lo que valen:
    //
    //   · los TOTALES mandan. Sin ellos no se puede cerrar, y no se debe ofrecer.
    //   · la lista de cobros y el historial son complemento: si faltan, se cierra igual.
    const [tot, lista] = await Promise.allSettled([
      cajaService.abierto(),
      cajaService.movimientos(),
    ]);

    if (tot.status === 'fulfilled') {
      setAbierto(tot.value);
    } else {
      setFallo(true);
      showToast(errorService.getMessage(tot.reason), 'error');
    }

    setCobros(lista.status === 'fulfilled' ? (lista.value || []) : []);

    if (esDueno) {
      try {
        setHistorial(await cajaService.historial(60));
      } catch {
        // El historial es del dueño y no hace falta para cerrar el día. Que no ande sin
        // conexión no puede trabar a quien está con el cajón adelante.
      }
    }

    setCargando(false);
  }, [esDueno, showToast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarBalance(balanceDesde, balanceHasta); }, [cargarBalance, balanceDesde, balanceHasta]);

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
      const guardado = await cajaService.registrarMovimiento({
        tipo: movTipo,
        categoria: movCategoria,
        detalle: movDetalle.trim() || null,
        monto: parseFloat(movMonto),
        metodo: movMetodo,
        hechoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setAnotando(false);
      // ⚠️ SIN INTERNET NO SE DICE "ANOTADO" A SECAS. El renglón está guardado y la plata
      // salió del cajón —eso es cierto y hay que decirlo— pero el servidor todavía no lo
      // sabe. Decir lo mismo en los dos casos es la mentira chiquita que después vuelve
      // como "lo anoté y no está".
      const queEs = movTipo === 'EGRESO' ? 'Gasto' : 'Ingreso';
      showToast(
        guardado?.encolado
          ? `${queEs} guardado sin conexión. Sube solo cuando vuelva el internet.`
          : `${queEs} anotado.`,
        'success',
      );
      cargar();
      cargarBalance(balanceDesde, balanceHasta);
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Anular un movimiento pide el motivo en un diálogo NUESTRO. Acá había un `window.prompt`:
  // el cartel gris del navegador, sin el aspecto del sistema, que además bloquea toda la
  // pantalla y en el escritorio (Electron) puede ni aparecer.
  const [anulando, setAnulando] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const pedirAnulacion = (mov) => {
    setMotivoAnulacion('');
    setAnulando(mov);
  };

  const confirmarAnulacion = async (e) => {
    e?.preventDefault();
    if (!anulando) return;
    // El motivo queda registrado a la vista de todos: es lo que hace que anular no sea
    // borrar. Sin motivo no se anula.
    if (!motivoAnulacion.trim()) {
      showToast('Escribí por qué se anula. Queda registrado.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const turno = getShift();
      await cajaService.anularMovimiento(anulando.id, {
        motivo: motivoAnulacion.trim(),
        anuladoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setAnulando(null);
      showToast('Movimiento anulado.', 'success');
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
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
        // ⭐ LO QUE ESTA PANTALLA MOSTRÓ, no lo que el servidor va a calcular. Viaja para
        // quedar guardado AL LADO del número del servidor: si las dos cuentas difieren, eso
        // queda registrado en vez de desaparecer. El que decide la plata sigue siendo el del
        // servidor, que cuando recibe esto ya recibió todos los cobros del día.
        esperadoSegunTerminal: enElCajon,
        cobrosSegunTerminal: numero(abierto?.cantidadCobros),
      });
      setConfirmando(false);
      setRetiro('');
      setResultado(cierre);
      if (cierre?.encolado) {
        showToast('Caja cerrada. Se manda sola cuando vuelva internet.', 'success');
      }
      cargar();
      cargarBalance(balanceDesde, balanceHasta);
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const sinCerrarHace = diasDesde(abierto?.ultimoCierre);
  // En centavos: 0,1 + 0,2 no da 0,3 en JavaScript.
  const totalCobrado = sumarPlata([abierto?.efectivo, abierto?.digital, abierto?.tarjeta, abierto?.otros]);

  return (
    <div className="caja-page">
      <PageHeader
        title="Cierre de caja"
        subtitle="El sistema cuenta; vos decidís cuánto se retira"
        icon="receipt"
        actions={esDueno && (
          /* ─── EL EXCEL DEL DÍA, SIEMPRE A MANO ───
             Es lo que el dueño le manda al contador todos los días. Arriba y en el título,
             que queda fijo al scrollear: se elige el día (arranca en hoy) y se baja. */
          <form
            className="caja-excel"
            onSubmit={(e) => { e.preventDefault(); exportar(diaExcel, diaExcel); }}
          >
            <label className="caja-excel-dia">
              <span>Día</span>
              <input
                type="date" className="form-input" value={diaExcel} max={hoy}
                aria-label="Día del Excel"
                onChange={(e) => setDiaExcel(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={exportando || !diaExcel}>
              {exportando
                ? <><span className="spinner" /> Armando…</>
                : <><Icon name="download" size="1em" /> Excel del día</>}
            </button>
          </form>
        )}
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

      {/* ─── BALANCE DE INGRESOS: EL RANGO QUE SE ELIJA ─── */}
      {hayBalance && (
        <div className="card caja-balance">
          <div className="caja-balance-cabecera">
            <h3><Icon name="trendingUp" size="1em" /> Balance de ingresos</h3>
            {esDueno && (
              <button
                type="button" className="btn btn-sm btn-secondary"
                disabled={exportando}
                onClick={() => exportar(balanceDesde, balanceHasta)}
              >
                <Icon name="download" size="1em" /> Excel de este período
              </button>
            )}
          </div>
          <SelectorDeFechas rango={rango} className="caja-balance-fechas" />
          {/* ⭐ Es el LIBRO DE INGRESOS: el mismo número del tablero, de Pagos y del Excel. Con el
              historial importado y las ventas adentro, cada uno dicho aparte abajo. Hasta el
              22/09 esto dejaba afuera el historial, y el año de un gimnasio recién migrado
              decía una fracción de lo que decía el tablero. */}
          <div className="caja-balance-cifras">
            {/* La cantidad de cobros va con el total, en su aclaración: sola en su casillero
                quedaba huérfana en un segundo renglón, al lado de nada. */}
            <div className="caja-cifra es-total">
              <span className="caja-cifra-valor">{formatCurrency(numero(balance?.total))}</span>
              <span className="caja-cifra-label">
                {TOTAL_DEL[rango.periodo]
                  || `Total del ${formatDate(balanceDesde)} al ${formatDate(balanceHasta)}`}
                {' · '}
                {numero(balance?.cantidadCobros) === 1 ? '1 cobro' : `${numero(balance?.cantidadCobros)} cobros`}
              </span>
            </div>
            <div className="caja-cifra es-efectivo">
              <span className="caja-cifra-valor">{formatCurrency(numero(balance?.efectivo))}</span>
              <span className="caja-cifra-label">Efectivo</span>
            </div>
            <div className="caja-cifra es-digital">
              <span className="caja-cifra-valor">{formatCurrency(numero(balance?.digital))}</span>
              <span className="caja-cifra-label">Transferencia y Mercado Pago</span>
            </div>
            {/* Tarjeta y otros medios, si hubo: sin este casillero, efectivo + digital no daba
                el total y parecía que faltaba plata. */}
            {sumarPlata([balance?.tarjeta, balance?.otros]) > 0 && (
              <div className="caja-cifra">
                <span className="caja-cifra-valor">{formatCurrency(sumarPlata([balance?.tarjeta, balance?.otros]))}</span>
                <span className="caja-cifra-label">Tarjeta y otros medios</span>
              </div>
            )}

          </div>
          {/* De dónde salió el total. Las tres partes suman exactamente el total de arriba. */}
          {balance && (
            <ul className="caja-balance-origen">
              <li>
                <span>Cuotas cobradas en Veltronik</span>
                <strong>{formatCurrency(numero(balance.cuotas))}</strong>
              </li>
              {numero(balance.historial) > 0 && (
                <li title="Importado del sistema anterior: suma en los ingresos, pero no pasó por esta caja ni entra en ningún cierre.">
                  <span>Historial importado <small className="text-muted">(no pasó por esta caja)</small></span>
                  <strong>{formatCurrency(numero(balance.historial))}</strong>
                </li>
              )}
              {numero(balance.otrosIngresos) > 0 && (
                <li>
                  <span>Ventas y otros ingresos</span>
                  <strong>{formatCurrency(numero(balance.otrosIngresos))}</strong>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* ─── LOS COBROS DEL PERÍODO ───
           Un total que no se puede abrir es un número en el que hay que creer. Acá está cada
           cobro que lo forma. Lo ve quien cierra, que ahora también es recepción. */}
      <div className="card caja-cobros">
        <div className="caja-card-cabecera">
          <h3><Icon name="list" size="1em" /> Cobros a cerrar ({cobros.length})</h3>
          <span className="caja-card-total">{formatCurrency(totalCobrado)}</span>
        </div>
        {cargando ? (
          <p className="text-muted caja-cargando"><span className="spinner" /> Cargando...</p>
        ) : !cobros.length ? (
          <EmptyState icon="cash" title="Todavía no se cobró nada" description="Los cobros del día aparecen acá a medida que se registran." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Hora</th><th>Socio</th><th>Forma de pago</th><th className="caja-col-monto">Monto</th></tr>
              </thead>
              <tbody>
                {cobros.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Hora" className="caja-hora">{cuandoDe(m.fecha)}</td>
                    <td data-label="Socio">{m.socio || <span className="text-muted">Sin socio</span>}</td>
                    <td data-label="Forma de pago">
                      <span className={`caja-metodo ${esEfectivo(m.metodo) ? 'es-efectivo' : 'es-digital'}`}>
                        {nombreDeForma(m.metodo) || 'Sin dato'}
                      </span>
                    </td>
                    <td data-label="Monto" className="caja-monto-celda caja-col-monto">{formatCurrency(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── RESUMEN POR FORMA DE PAGO ───
           Lo que antes había que averiguar mirando cobro por cobro. Es la cuenta que el
           dueño quería hacer de un vistazo: de 20 cobros, cuántos por transferencia y
           cuántos en efectivo. */}
      <div className="card caja-resumen">
        <h3><Icon name="cash" size="1em" /> Resumen por forma de pago</h3>
        {/* En el mismo orden que el balance de arriba: el total, y después de dónde está. */}
        <div className="caja-resumen-grid">
          <div className="caja-cifra es-total">
            <span className="caja-cifra-valor">{formatCurrency(totalCobrado)}</span>
            <span className="caja-cifra-label">
              Total del período · {numero(abierto?.cantidadCobros) === 1 ? '1 cobro' : `${numero(abierto?.cantidadCobros)} cobros`}
            </span>
          </div>
          <div className="caja-cifra es-efectivo">
            <span className="caja-cifra-valor">{formatCurrency(numero(abierto?.efectivo))}</span>
            <span className="caja-cifra-label">Efectivo (está en el cajón)</span>
          </div>
          <div className="caja-cifra es-digital">
            <span className="caja-cifra-valor">{formatCurrency(numero(abierto?.digital))}</span>
            <span className="caja-cifra-label">Transferencia y Mercado Pago (está en el banco)</span>
          </div>
          {/* Como en el balance: sin este casillero, efectivo + digital no daba el total. */}
          {sumarPlata([abierto?.tarjeta, abierto?.otros]) > 0 && (
            <div className="caja-cifra">
              <span className="caja-cifra-valor">{formatCurrency(sumarPlata([abierto?.tarjeta, abierto?.otros]))}</span>
              <span className="caja-cifra-label">Tarjeta y otros medios</span>
            </div>
          )}
        </div>
        {/* Una venta por transferencia no toca el cajón, pero es plata que entró en el período. */}
        {numero(abierto?.ingresosOtrosMedios) > 0 && (
          <p className="form-hint caja-nota">
            Además entraron {formatCurrency(numero(abierto.ingresosOtrosMedios))} de ventas y otros
            ingresos por transferencia, Mercado Pago o tarjeta.
          </p>
        )}
      </div>

      {/* ─── LAS CORRECCIONES DE DÍAS YA CERRADOS (V88) ───
           Un cobro de un día que ya se cerró y que después se corrigió o se anuló. El cierre de
           ese día quedó con su número y no se reescribe: la diferencia entra en este, a la
           vista, renglón por renglón. Antes esa plata no aparecía en ningún cierre. */}
      {!!abierto?.correcciones?.length && (
        <div className="card caja-correcciones">
          <div className="caja-card-cabecera">
            <h3><Icon name="alertTriangle" size="1em" /> Correcciones de días ya cerrados ({abierto.correcciones.length})</h3>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Cobro del</th><th>Socio</th><th>Antes</th><th>Ahora</th><th className="caja-col-monto">Diferencia</th></tr>
              </thead>
              <tbody>
                {abierto.correcciones.map((c) => {
                  const diferencia = sumarPlata([c.montoDespues, -numero(c.montoAntes)]);
                  const metodo = nombreDeForma;
                  const mismoMedio = String(c.metodoAntes) === String(c.metodoDespues);
                  return (
                    <tr key={c.pagoId}>
                      <td data-label="Cobro del">{fecha(c.fecha)}</td>
                      <td data-label="Socio">{c.socio || <span className="text-muted">Sin socio</span>}</td>
                      <td data-label="Antes">{formatCurrency(c.montoAntes)} · {metodo(c.metodoAntes)}</td>
                      <td data-label="Ahora">
                        {numero(c.montoDespues) === 0 ? 'Anulado' : `${formatCurrency(c.montoDespues)} · ${metodo(c.metodoDespues)}`}
                      </td>
                      <td data-label="Diferencia" className="caja-monto-celda caja-col-monto">
                        {mismoMedio || numero(c.montoDespues) === 0
                          ? <span className={diferencia < 0 ? 'caja-falta' : 'caja-entra'}>
                              {diferencia < 0 ? '−' : '+'}{formatCurrency(Math.abs(diferencia))}
                            </span>
                          : <span>Cambió la forma de pago</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── LO QUE SALE Y ENTRA SIN SER UN COBRO ───
           Antes de la distribución, porque la cambia: un gasto pagado del cajón es plata que
           ya no está. Los botones viven en la cabecera de su propia tarjeta; sueltos entre dos
           tarjetas quedaban pegados a la de abajo. */}
      {hayMovimientos && (
        <div className="card caja-movimientos">
          <div className="caja-card-cabecera">
            <h3><Icon name="receipt" size="1em" /> Gastos e ingresos ({movsCaja.length})</h3>
            <div className="caja-acciones">
              <button className="btn btn-sm btn-secondary" onClick={() => pedirMovimiento('EGRESO')} disabled={guardando}>
                <Icon name="trendingDown" size="1em" /> Anotar un gasto
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => pedirMovimiento('INGRESO')} disabled={guardando}>
                <Icon name="trendingUp" size="1em" /> Anotar un ingreso
              </button>
            </div>
          </div>
          {/* ⚠️ Los anulados quedan TACHADOS, no desaparecen. Un egreso que se puede hacer
               desaparecer de la lista es justamente lo que no queremos que se pueda hacer. */}
          {!movsCaja.length ? (
            <p className="text-muted caja-vacio">
              Todavía no se anotó ningún gasto ni ingreso. Si se pagó algo con plata del cajón,
              anotalo: si no, la cuenta de abajo espera esa plata.
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Qué</th><th className="caja-col-monto">Monto</th><th>Forma</th><th>Quién</th><th>Cuándo</th><th aria-label="Acciones" /></tr>
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
                          {/* ⭐ El que se anotó sin internet SE VE IGUAL, con su aclaración. Que no
                              apareciera era el agujero: quien lo cargó no lo veía en la lista y lo
                              cargaba otra vez, y el arqueo terminaba con un faltante inventado. */}
                          {m.sinSubir && (
                            <div className="form-hint">Guardado sin conexión · sube solo</div>
                          )}
                          {anulado && (
                            <div className="form-hint">
                              Anulado por {m.anuladoPorNombre || 'alguien sin identificar'}
                              {m.motivoAnulacion ? ` · ${m.motivoAnulacion}` : ''}
                            </div>
                          )}
                        </td>
                        <td data-label="Monto" className="caja-monto-celda caja-col-monto">
                          <span className={egreso ? 'caja-falta' : 'caja-entra'}>
                            {egreso ? '−' : '+'}{formatCurrency(m.monto)}
                          </span>
                        </td>
                        <td data-label="Forma">
                          {nombreDeForma(m.metodo) || 'Sin dato'}
                          {/* Lo que no pasa por el cajón se anota pero NO mueve la cuenta. */}
                          {!esEfectivo(m.metodo) && <div className="form-hint">no toca el cajón</div>}
                        </td>
                        <td data-label="Quién">{m.hechoPorNombre || 'Sin identificar'}</td>
                        <td data-label="Cuándo">{fecha(m.fecha)}</td>
                        <td data-label="Acciones">
                          {/* ⚠️ Lo que todavía no subió NO se puede anular, y fue una decisión
                              tomada a propósito (decisión 2 de docs/FASE3-CAMINOS.md): anular es
                              un pedido contra una fila que del otro lado no existe. */}
                          {!anulado && !m.sinSubir && (
                            <button className="btn btn-sm btn-secondary" onClick={() => pedirAnulacion(m)}>
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
        </div>
      )}

      {/* ─── DISTRIBUCIÓN DEL EFECTIVO EN CAJA ───
           La única decisión del cierre. Todo lo de arriba lo calculó el sistema. */}
      <div className="card caja-distribucion">
        <h3><Icon name="cash" size="1em" /> Distribución del efectivo en caja</h3>
        {/* Desde cuándo cuenta: si nadie cerró ayer, el período arrastra dos días y hay que
            saberlo antes de retirar. */}
        {abierto?.ultimoCierre && (
          <p className="form-hint caja-desde">Desde el cierre del {fecha(abierto.ultimoCierre)}.</p>
        )}

        {/* ⭐ REGLA 6 DE LA FASE 3: ningún total se muestra como si fuera completo cuando no
            lo es. Sin conexión estos números salen de lo último que bajó más lo que este
            equipo tiene sin subir — le falta lo que haya entrado por el portal o por Mercado
            Pago durante el corte. Para el CAJÓN no cambia nada (esa plata nunca pasó por
            ahí), y por eso se puede cerrar igual; pero decirlo sin aclararlo sería inventar
            una precisión que no hubo.

            En ámbar y no en rojo, y sin tocar los números: es el estado de la casa, no un
            problema con la plata. Mismo criterio que el cartel del mostrador. */}
        {abierto?.incompleto && (
          <p className="form-hint caja-sin-conexion">
            Sin conexión: la cuenta sale de los datos de{' '}
            {/* Solo la hora: sin conexión el espejo es siempre del mismo día de trabajo. */}
            <strong>{horaDe(abierto.bajadoEn)}</strong>
            {abierto.enCola > 0 && <> más {abierto.enCola} movimiento{abierto.enCola === 1 ? '' : 's'} de este equipo</>}
            . El efectivo del cajón está completo; puede faltar lo que haya entrado por el
            portal o por Mercado Pago. Se puede cerrar igual.
          </p>
        )}

        {/* La cuenta a la vista: sin esto, "en el cajón" es un número que hay que creer. */}
        <ul className="caja-cuenta">
          <li><span>Quedó del cierre anterior</span><strong className={numero(abierto?.fondo) < 0 ? 'caja-falta' : undefined}>{formatCurrency(numero(abierto?.fondo))}</strong></li>
          <li><span>Cobrado en efectivo</span><strong>+ {formatCurrency(numero(abierto?.efectivo))}</strong></li>
          {numero(abierto?.ingresosManuales) > 0 && (
            <li><span>Otros ingresos en efectivo</span><strong>+ {formatCurrency(numero(abierto?.ingresosManuales))}</strong></li>
          )}
          {numero(abierto?.egresos) > 0 && (
            <li><span>Gastos pagados del cajón</span><strong className="caja-falta">− {formatCurrency(numero(abierto?.egresos))}</strong></li>
          )}
          {/* Un cobro en efectivo de un día ya cerrado que se anuló (se devolvió la plata) o se
              corrigió: esa diferencia pasa HOY por el cajón. */}
          {numero(abierto?.ajustesEfectivo) !== 0 && (
            <li>
              <span>Correcciones de días ya cerrados</span>
              <strong className={numero(abierto.ajustesEfectivo) < 0 ? 'caja-falta' : undefined}>
                {numero(abierto.ajustesEfectivo) < 0 ? '−' : '+'} {formatCurrency(Math.abs(numero(abierto.ajustesEfectivo)))}
              </strong>
            </li>
          )}
          {/* En rojo si da negativo: se anotaron más gastos que la plata que había. No se
              esconde ni se redondea a cero: es lo primero que hay que mirar. */}
          <li className="caja-cuenta-total"><span>Hay en el cajón</span><strong className={enElCajon < 0 ? 'caja-falta' : undefined}>{formatCurrency(enElCajon)}</strong></li>
        </ul>

        {/* Un form, para que Enter en el retiro lleve a confirmar como el botón. */}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!(guardando || cargando || fallo || retiroExcedido)) setConfirmando(true);
          }}
        >
          <div className="caja-reparto">
            <div className="form-group">
              <label className="form-label" htmlFor="caja-retiro">Retiro en efectivo</label>
              <input
                id="caja-retiro"
                type="number" inputMode="decimal" min="0" step="any"
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
            <p className="caja-falta caja-aviso-retiro">
              <Icon name="alertTriangle" size="0.9em" /> No podés retirar más de lo que hay en el
              cajón. Lo cobrado por transferencia está en el banco, no acá.
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary caja-cerrar"
            disabled={guardando || cargando || fallo || retiroExcedido}
          >
            <Icon name="checkCircle" size="1em" /> Cerrar caja diaria
          </button>
        </form>
      </div>

      {/* ─── EL HISTORIAL: solo el dueño, y es donde está el valor ─── */}
      {esDueno && (
        <div className="card caja-historial">
          <h3><Icon name="fileText" size="1em" /> Cierres anteriores</h3>
          {!historial.length ? (
            <EmptyState icon="fileText" title="Todavía no se cerró ninguna caja" description="Cuando cierres el primer día, el historial queda acá." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cuándo</th><th>Quién</th><th>Efectivo</th><th>Transf. y MP</th>
                    <th className="col-gastos">Gastos</th><th>Retiro</th><th>Quedó en caja</th><th aria-label="Excel del día" />
                  </tr>
                </thead>
                <tbody>
                  {historial.map((c) => {
                    const dia = c.hasta ? toLocalDateString(new Date(c.hasta)) : null;
                    return (
                      <tr key={c.id}>
                        <td data-label="Cuándo">{fecha(c.hasta)}</td>
                        <td data-label="Quién">{c.cerradoPorNombre || 'Sin identificar'}</td>
                        <td data-label="Efectivo">{formatCurrency(c.esperadoEfectivo)}</td>
                        <td data-label="Transf. y MP">
                          {formatCurrency(numero(c.esperadoTransferencia) + numero(c.esperadoMercadopago))}
                        </td>
                        <td data-label="Gastos" className="col-gastos">
                          {numero(c.egresosEfectivo) > 0
                            ? <span className="caja-falta">− {formatCurrency(c.egresosEfectivo)}</span>
                            : formatCurrency(0)}
                          {/* Las correcciones de días anteriores que entraron en este cierre. */}
                          {numero(c.cantidadAjustes) > 0 && (
                            <div className="form-hint">
                              Correcciones: {numero(c.ajustesEfectivo) < 0 ? '−' : '+'}
                              {formatCurrency(Math.abs(numero(c.ajustesEfectivo)))} en efectivo
                            </div>
                          )}
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
                            : <span className={numero(c.quedaEnCaja) < 0 ? 'caja-falta' : undefined}>{formatCurrency(c.quedaEnCaja)}</span>}
                        </td>
                        <td data-label="Excel">
                          {dia && (
                            <button
                              type="button" className="btn btn-sm btn-secondary"
                              disabled={exportando}
                              title={`Bajar el Excel del ${formatDate(dia)}`}
                              aria-label={`Bajar el Excel del ${formatDate(dia)}`}
                              onClick={() => exportar(dia, dia)}
                            >
                              <Icon name="download" size="0.9em" /> <span className="caja-excel-texto">Excel</span>
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
              {numero(resultado.ajustesEfectivo) !== 0 && (
                <li>
                  <span>Correcciones de días ya cerrados</span>
                  <strong>{numero(resultado.ajustesEfectivo) < 0 ? '−' : '+'} {formatCurrency(Math.abs(numero(resultado.ajustesEfectivo)))}</strong>
                </li>
              )}
              <li><span>Retirado</span><strong>{formatCurrency(resultado.retiroEfectivo)}</strong></li>
              <li className="caja-cuenta-total">
                <span>Queda en caja para mañana</span>
                <strong>{formatCurrency(resultado.quedaEnCaja)}</strong>
              </li>
            </ul>
          </div>
        )}
      </Modal>

      {/* ─── ANULAR UN MOVIMIENTO: el motivo queda registrado ─── */}
      <Modal
        isOpen={!!anulando}
        onClose={() => setAnulando(null)}
        title="Anular movimiento"
        actions={<ModalActions onCancel={() => setAnulando(null)} saving={guardando} submitText="Anular" />}
      >
        <form onSubmit={confirmarAnulacion} noValidate>
          {anulando && (
            <p className="form-hint" style={{ marginBottom: '1rem' }}>
              {anulando.categoria} · {formatCurrency(anulando.monto)}
              {anulando.detalle ? ` · ${anulando.detalle}` : ''}
            </p>
          )}
          <div className="form-group">
            <label className="form-label">¿Por qué se anula?</label>
            <input
              className="form-input" value={motivoAnulacion} autoFocus
              placeholder="Cargado dos veces, monto equivocado…"
              onChange={(e) => setMotivoAnulacion(e.target.value)}
            />
            <small className="form-hint">
              No se borra: queda tachado, con este motivo y quién lo anuló. Un gasto que se
              puede hacer desaparecer de la lista es justamente lo que no queremos.
            </small>
          </div>
        </form>
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
            <label className="form-label">{movTipo === 'EGRESO' ? '¿De dónde salió?' : '¿Cómo entró?'}</label>
            <select className="form-input" value={movMetodo} onChange={(e) => setMovMetodo(e.target.value)}>
              <option value="CASH">Efectivo (del cajón)</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="MERCADOPAGO">Mercado Pago</option>
            </select>
            {/* Solo el efectivo mueve la cuenta del cajón: lo que se paga desde el banco no
                salió de ahí, y restarlo daría un faltante inventado. */}
            {movMetodo !== 'CASH' && (
              <small className="form-hint">
                Esto no cambia la cuenta del cajón: {movTipo === 'EGRESO' ? 'no salió plata de ahí' : 'no entró plata ahí'}. Queda anotado igual.
              </small>
            )}
            {/* El aporte es plata del dueño: entra al cajón, pero no es un ingreso del gimnasio. */}
            {movTipo === 'INGRESO' && ES_DE_FONDOS(movCategoria) && (
              <small className="form-hint">
                Un aporte es plata del dueño: suma en el cajón, pero no cuenta como ingreso del gimnasio.
              </small>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
