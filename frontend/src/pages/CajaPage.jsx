// ============================================
// VELTRONIK - CIERRE DE CAJA
// ============================================
// Lo que el dueño quiere saber es una sola cosa: ¿la plata que entró al sistema es la plata
// que hay? Hoy no tiene forma de saberlo.
//
// ─── LAS DECISIONES QUE EXPLICAN ESTA PANTALLA ───
//
// ⭐ EL CONTEO ES A CIEGAS. Quien cuenta NO ve cuánto debería haber hasta después de
// declarar. Si lo viera, escribiría ese número y el arqueo no significaría nada. Esto no se
// sostiene solo acá: el backend tiene DOS endpoints y el que trae importes es solo para el
// dueño — esconderlo en la pantalla no alcanzaría, porque cualquiera puede abrir la API.
//
// SE CUENTA BILLETE POR BILLETE. Es lo que la persona ya hace con la plata en la mano, le
// saca la cuenta mental de encima —de donde sale la mitad de las diferencias— y de paso
// hace más incómodo inventar: mentir un total es fácil, inventar un desglose de billetes
// creíble no tanto.
//
// UNA SOLA OPORTUNIDAD. Se cuenta, se confirma, y recién ahí aparece la diferencia. No se
// puede volver atrás: así funciona una caja de verdad.
//
// SOLO SE DECLARA EL EFECTIVO. Una transferencia no se puede robar —va a la cuenta del
// gimnasio— y quien atiende no tiene cómo saber su total sin mirar el sistema. Pedírsela
// sería fricción diaria sin ninguna seguridad a cambio. Se muestran aparte, para que el
// dueño concilie contra el banco.

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

/**
 * En qué se gasta la plata de un gimnasio.
 *
 * Son sugerencias, no una lista cerrada: el backend guarda texto libre a propósito, porque
 * el gimnasio va a necesitar un rubro que hoy no imaginamos y eso no puede requerir una
 * migración. Estos son los que aparecen de entrada para no hacer escribir lo de todos los días.
 */
const CATEGORIAS_EGRESO = ['Limpieza', 'Adelanto', 'Proveedor', 'Mantenimiento', 'Retiro', 'Otro'];
const CATEGORIAS_INGRESO = ['Venta', 'Aporte', 'Otro'];

export default function CajaPage() {
  const { showToast } = useToast();
  const { orgRole, profile } = useAuth();
  const esDueno = ['owner', 'admin'].includes(orgRole);

  const [pendiente, setPendiente] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Un pedido que falló no es un período vacío. Mostrar "0 cobros" cuando no se pudo
  // preguntar hace que alguien cierre una caja creyendo que no entró nada.
  const [fallo, setFallo] = useState(false);

  // El conteo: un número. Nada más.
  //
  // Acá había una grilla para cargar cuántos billetes de cada denominación. Era más
  // preciso en teoría, pero un arqueo de kiosco es UNA pregunta —¿cuánta plata hay?— y
  // nueve casilleros todos los días es exactamente la clase de fricción que hace que la
  // gente deje de cerrar caja. Y una caja que no se cierra no sirve para nada.
  const [contando, setContando] = useState(false);
  const [efectivo, setEfectivo] = useState('');
  // Transferencias y Mercado Pago van en un solo campo: quien cuenta abre la app del banco
  // o de MP y mira cuánto entró. Es un solo gesto; pedir dos números para la misma
  // revisión es fricción sin nada a cambio.
  const [digital, setDigital] = useState('');
  const [guardando, setGuardando] = useState(false);

  // La caja abierta: desde cuándo, quién y con cuánto cambio arrancó el cajón.
  const [estado, setEstado] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [fondo, setFondo] = useState('');
  // Los cobros que forman el número. Solo el dueño: si quien va a contar ve los montos,
  // suma la lista y escribe ese número, y el arqueo deja de medir nada.
  const [movimientos, setMovimientos] = useState([]);

  // ─── Los movimientos de caja: lo que sale y entra sin ser un cobro ───
  //
  // ⚠️ ESTO ES LO QUE EVITA QUE EL ARQUEO MIENTA TODOS LOS DÍAS. Se le pagan $15.000 a la
  // chica de la limpieza del cajón; si no queda anotado, a la noche el sistema espera esa
  // plata igual, el cierre dice FALTANTE, y acusa a quien atendió sin que haya robado nada.
  // Es el mismo bug del fondo inicial con el signo cambiado, y termina igual de mal: te
  // acostumbrás a los faltantes y el día que falta plata de verdad no lo distinguís.
  //
  // A diferencia de los cobros, ESTA lista la ve cualquiera. No rompe el conteo a ciegas:
  // quien cuenta ya sabe cuánto sacó del cajón —lo sacó ella— y sabiendo el fondo y los
  // egresos todavía le falta el número grande, que es lo cobrado en efectivo. Y necesita
  // verla para no cargar dos veces el mismo gasto.
  const [movsCaja, setMovsCaja] = useState([]);
  // ¿El backend de este gimnasio sabe de movimientos? Un escritorio o un servidor que
  // todavía no actualizó responde 404, y ahí los botones se esconden en vez de ofrecer algo
  // que va a fallar. Arranca en true para no parpadear mientras carga.
  const [hayMovimientos, setHayMovimientos] = useState(true);
  const [anotando, setAnotando] = useState(false);
  const [movTipo, setMovTipo] = useState('EGRESO');
  const [movCategoria, setMovCategoria] = useState('');
  const [movDetalle, setMovDetalle] = useState('');
  const [movMonto, setMovMonto] = useState('');
  const [movMetodo, setMovMetodo] = useState('CASH');

  // El resultado, recién revelado. Es el único momento en que quien contó ve el número.
  const [resultado, setResultado] = useState(null);
  const [explicacion, setExplicacion] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);
    try {
      const [p, e] = await Promise.all([cajaService.pendiente(), cajaService.estado()]);
      setPendiente(p);
      setEstado(e);

      // ⚠️ LOS MOVIMIENTOS NO PUEDEN TUMBAR LA PANTALLA ENTERA.
      //
      // Son la parte nueva, y un backend que todavía no la tiene responde 404. Si eso
      // viajara en el mismo Promise.all que lo demás, el cierre de caja —que SÍ funciona
      // en cualquier versión— quedaría inutilizable por una función que el gimnasio ni
      // sabe que existe. Es el mismo criterio que ya se aplicó con los avisos del mostrador.
      //
      // Y no es hipotético: entre que sale el frontend nuevo y que el backend viejo deja
      // de recibir tráfico hay una ventana real en la que esto pasa.
      try {
        setMovsCaja((await cajaService.movimientosDeCaja()) || []);
        setHayMovimientos(true);
      } catch {
        // El backend de este gimnasio todavía no sabe de movimientos: se esconden los
        // botones en vez de dejar que alguien los apriete y reciba un error.
        setMovsCaja([]);
        setHayMovimientos(false);
      }

      if (esDueno) {
        setAbierto(await cajaService.abierto());
        setHistorial(await cajaService.historial(60));
        setMovimientos(await cajaService.movimientos());
      }
    } catch (e) {
      setFallo(true);
      showToast(errorService.getMessage(e), 'error');
    } finally {
      setCargando(false);
    }
  }, [esDueno, showToast]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalContado = useMemo(() => parseFloat(efectivo) || 0, [efectivo]);
  const totalDigital = useMemo(() => parseFloat(digital) || 0, [digital]);

  const pedirFondo = () => {
    setFondo('');
    setAbriendo(true);
  };

  const abrirConteo = () => {
    setEfectivo('');
    setDigital('');
    setResultado(null);
    setExplicacion('');
    setContando(true);
  };

  const abrirCaja = async (e) => {
    e?.preventDefault();
    // Vacío no es cero. Si el cajón arranca sin cambio, se escribe 0 — pero se escribe,
    // porque este número es el que hace que el arqueo cierre.
    if (fondo.trim() === '') {
      showToast('Escribí con cuánto cambio arranca el cajón. Si no hay nada, poné 0.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const turno = getShift();
      await cajaService.abrir({
        fondoInicial: parseFloat(fondo) || 0,
        abiertaPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setAbriendo(false);
      showToast('Caja abierta.', 'success');
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

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
    // no. El backend lo exige también, porque esconderlo solo acá no serviría de nada.
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

  const confirmar = async (e) => {
    e?.preventDefault();
    // Vacío no es cero: si alguien aprieta Enter sin escribir, no se cierra una caja
    // declarando que no hay plata. Para declarar cero, se escribe cero.
    if (efectivo.trim() === '') {
      showToast('Escribí cuánto efectivo hay. Si no hay nada, poné 0.', 'error');
      return;
    }
    if (digital.trim() === '') {
      showToast('Escribí cuánto entró por transferencia y Mercado Pago. Si no entró nada, poné 0.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const turno = getShift();
      const cierre = await cajaService.cerrar({
        declaradoEfectivo: totalContado,
        declaradoDigital: totalDigital,
        nota: null,
        cerradoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setContando(false);
      setResultado(cierre);
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const [confirmandoCorte, setConfirmandoCorte] = useState(false);

  const cortarSinContar = async () => {
    setConfirmandoCorte(false);
    setGuardando(true);
    try {
      await cajaService.cerrar({ declaradoEfectivo: null, declaradoDigital: null, nota: null, cerradoPor: profile?.fullName || 'Dueño' });
      showToast('Período cerrado sin conteo.', 'success');
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const explicar = async () => {
    if (!explicacion.trim()) return;
    try {
      await cajaService.explicar(resultado.id, explicacion.trim());
      showToast('Explicación guardada.', 'success');
      setResultado({ ...resultado, nota: explicacion.trim() });
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    }
  };

  const sinCerrarHace = diasDesde(abierto?.ultimoCierre);

  return (
    <div className="caja-page">
      <PageHeader
        title="Cierre de caja"
        subtitle="Contá la plata y el sistema te dice si coincide"
        icon="dollarSign"
      />

      {/* La forma más fácil de esconder algo no es mentir en el cierre: es no cerrar. */}
      {esDueno && sinCerrarHace !== null && sinCerrarHace >= 2 && (
        <div className="caja-alarma">
          <Icon name="alertTriangle" size="1em" />
          <span>Hace {sinCerrarHace} días que no se cierra la caja.</span>
        </div>
      )}

      <div className="caja-grid">
        {/* ─── El período abierto ─── */}
        <div className="card caja-abierto">
          <h3>
            <Icon name="clock" size="1em" />
            {estado?.abierta ? ' Caja abierta' : ' Caja cerrada'}
          </h3>
          {cargando ? <p className="text-muted">Cargando…</p> : fallo ? (
            <div className="caja-fallo">
              <Icon name="wifiOff" size="1.1em" />
              <div>
                <strong>No pudimos consultar el período.</strong>
                <div>Sin ese dato no se puede cerrar la caja con confianza. Probá de nuevo.</div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={cargar}>Reintentar</button>
            </div>
          ) : !estado?.abierta ? (
            /* ─── LA CAJA ESTÁ CERRADA ───
               Cobrar sigue andando con la caja cerrada, a propósito: nadie puede quedarse sin
               poder cobrarle a un socio porque a la mañana se olvidaron de abrir. Esa plata
               igual se cuenta — el período arranca donde terminó el último cierre. */
            <div className="caja-cerrada">
              <p className="text-muted">
                No hay ninguna caja abierta. Abrila para empezar el día.
              </p>
              {pendiente?.cantidadCobros > 0 && (
                <p className="form-hint">
                  Ojo: ya hay <strong>{pendiente.cantidadCobros} cobros</strong> sin cerrar desde
                  el {fecha(pendiente?.desde)}. Van a entrar en el próximo cierre igual.
                </p>
              )}
              <div className="caja-acciones">
                <button className="btn btn-primary" onClick={pedirFondo} disabled={guardando}>
                  <Icon name="doorOpen" size="1em" /> Abrir caja
                </button>
                {esDueno && pendiente?.cantidadCobros > 0 && (
                  <button className="btn btn-secondary" onClick={abrirConteo} disabled={guardando}>
                    Cerrar lo que quedó pendiente
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="caja-desde">
                Abierta por <strong>{estado.abiertaPor || '—'}</strong> el <strong>{fecha(estado.desde)}</strong>
                {' · '}{pendiente?.cantidadCobros || 0} cobros
              </p>
              <p className="caja-desde">
                Arrancó con <strong>{formatCurrency(estado.fondoInicial)}</strong> de cambio en el cajón.
              </p>

              {/* Los importes SOLO para el dueño. Quien va a contar no puede verlos. */}
              {esDueno && abierto && (
                <div className="caja-metodos">
                  <div><span>Efectivo</span><strong>{formatCurrency(abierto.efectivo)}</strong></div>
                  <div><span>Transferencia</span><strong>{formatCurrency(abierto.transferencia)}</strong></div>
                  {/* Mercado Pago tenía su casilla al cobrar pero no acá: esa plata venía
                      cayendo en "Otros", junto con los métodos raros. Un gimnasio que cobra
                      por MP no la veía en ninguna parte del arqueo. */}
                  <div><span>Mercado Pago</span><strong>{formatCurrency(abierto.mercadopago)}</strong></div>
                  <div><span>Tarjeta</span><strong>{formatCurrency(abierto.tarjeta)}</strong></div>
                  {Number(abierto.otros) > 0 && (
                    <div><span>Otros</span><strong>{formatCurrency(abierto.otros)}</strong></div>
                  )}
                  <div className="caja-metodos-total">
                    <span>Tendría que haber en el cajón</span>
                    {/* ⚠️ EL NÚMERO LO MANDA EL BACKEND, no se recalcula acá.
                        Antes esta línea sumaba fondo + efectivo por su cuenta, y ahora la
                        cuenta tiene cuatro términos (entraron los egresos y los ingresos
                        manuales). Una cuenta de plata copiada en dos lados es una cuenta que
                        en algún lado va a quedar mal — en este proyecto ya pasó con los
                        vencimientos, con getQuickDates y con addOneMonth. Vive en un solo
                        lugar: `Resumen.enElCajon()`. */}
                    <strong>{formatCurrency(
                      abierto.esperadoEnElCajon
                        ?? (Number(abierto.efectivo || 0) + Number(estado?.fondoInicial || 0)),
                    )}</strong>
                  </div>
                  {/* Los egresos van JUNTO al esperado, no escondidos: es el número que hay
                      que mirar cuando la caja cuadra demasiado bien. Un egreso inventado la
                      hace cuadrar exacto — la plata salió y el sistema la esperaba afuera. */}
                  {Number(abierto.egresos) > 0 && (
                    <div><span>Salió del cajón</span>
                      <strong className="caja-falta">−{formatCurrency(abierto.egresos)}</strong>
                    </div>
                  )}
                  {Number(abierto.ingresosManuales) > 0 && (
                    <div><span>Entró sin ser un cobro</span>
                      <strong className="caja-sobra">+{formatCurrency(abierto.ingresosManuales)}</strong>
                    </div>
                  )}
                  <div className="caja-metodos-total">
                    <span>Total cobrado</span>
                    <strong>{formatCurrency(
                      Number(abierto.efectivo || 0) + Number(abierto.transferencia || 0)
                      + Number(abierto.mercadopago || 0) + Number(abierto.tarjeta || 0)
                      + Number(abierto.otros || 0),
                    )}</strong>
                  </div>
                </div>
              )}

              <div className="caja-acciones">
                <button className="btn btn-primary" onClick={abrirConteo} disabled={guardando}>
                  <Icon name="checkCircle" size="1em" /> Contar y cerrar caja
                </button>
                {/* ⚠️ Anotar el gasto EN EL MOMENTO es lo que hace que el arqueo cierre. Si
                    espera al dueño, esa plata figura como faltante toda la tarde y le echa la
                    culpa a quien atendió. Por eso el botón está acá y no en otra pantalla.

                    Se esconden si el backend todavía no sabe de movimientos: un botón que
                    solo puede fallar es peor que no tener el botón. */}
                {hayMovimientos && (
                  <>
                    <button className="btn btn-secondary" onClick={() => pedirMovimiento('EGRESO')} disabled={guardando}>
                      <Icon name="trendingDown" size="1em" /> Anotar un gasto
                    </button>
                    <button className="btn btn-secondary" onClick={() => pedirMovimiento('INGRESO')} disabled={guardando}>
                      <Icon name="trendingUp" size="1em" /> Anotar un ingreso
                    </button>
                  </>
                )}
                {esDueno && (
                  <button className="btn btn-secondary" onClick={() => setConfirmandoCorte(true)} disabled={guardando}>
                    Cerrar sin contar
                  </button>
                )}
              </div>
              {!esDueno && (
                <p className="form-hint">
                  Contá el efectivo del cajón y fijate cuánto entró por transferencia y
                  Mercado Pago. El sistema te dice después si coincide.
                </p>
              )}
            </>
          )}
        </div>

        {/* ─── Lo que salió y entró del cajón sin ser un cobro ───

             La ve CUALQUIERA, al revés que la lista de cobros. No rompe el conteo a ciegas:
             quien cuenta ya sabe cuánto sacó del cajón —lo sacó ella— y sabiendo el fondo y
             los egresos todavía le falta el número grande, que es lo cobrado en efectivo. Y
             necesita verla para no cargar dos veces el mismo gasto.

             ⚠️ Los anulados quedan TACHADOS, no desaparecen. Un egreso que se puede hacer
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
                        {/* Lo que no pasa por el cajón se anota pero NO mueve el arqueo. */}
                        {String(m.metodo).toUpperCase() !== 'CASH' && (
                          <div className="form-hint">no toca el cajón</div>
                        )}
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

        {/* ─── De dónde sale el número ───
             Un total que no se puede abrir es un número en el que hay que creer. Acá está
             cada cobro que lo forma, con su método, igual que en la pantalla de Pagos.

             ⚠️ Solo el dueño. No es un detalle de permisos: si quien va a contar ve los
             montos, suma la lista y escribe ese número, y el arqueo deja de medir nada. */}
        {esDueno && movimientos.length > 0 && (
          <div className="card caja-movimientos">
            <h3><Icon name="list" size="1em" /> Cobros de este período ({movimientos.length})</h3>
            <table className="table">
              <thead>
                <tr><th>Socio</th><th>Monto</th><th>Método</th><th>Fecha</th></tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Socio">{m.socio || <span className="text-muted">—</span>}</td>
                    <td data-label="Monto" className="caja-monto-celda">{formatCurrency(m.monto)}</td>
                    <td data-label="Método">{NOMBRE_METODO[String(m.metodo || '').toLowerCase()] || m.metodo || '—'}</td>
                    <td data-label="Fecha">{fecha(m.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── El historial: solo el dueño, y es donde está el valor ─── */}
        {esDueno && (
          <div className="card caja-historial">
            <h3><Icon name="fileText" size="1em" /> Cierres anteriores</h3>
            {!historial.length ? (
              <p className="text-muted">Todavía no se cerró ninguna caja.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Cuándo</th><th>Quién</th><th>Sistema</th><th>Contado</th><th>Efectivo</th><th>Transf. y MP</th></tr>
                </thead>
                <tbody>
                  {historial.map((c) => {
                    const dif = c.diferencia == null ? null : Number(c.diferencia);
                    const difD = c.diferenciaDigital == null ? null : Number(c.diferenciaDigital);
                    return (
                      <tr key={c.id}>
                        <td data-label="Cuándo">{fecha(c.hasta)}</td>
                        <td data-label="Quién">{c.cerradoPorNombre || '—'}</td>
                        <td data-label="Sistema">{formatCurrency(c.esperadoEfectivo)}</td>
                        <td data-label="Contado">
                          {c.conArqueo ? formatCurrency(c.declaradoEfectivo)
                            : <span className="text-muted">sin contar</span>}
                        </td>
                        <td data-label="Efectivo">
                          {dif === null ? <span className="text-muted">—</span>
                            : dif === 0 ? <span className="caja-ok">exacto</span>
                            : <span className={dif < 0 ? 'caja-falta' : 'caja-sobra'} title={c.nota || ''}>
                                {dif > 0 ? '+' : ''}{formatCurrency(dif)}
                                {c.nota ? ' 💬' : ''}
                              </span>}
                        </td>
                        {/* Los cierres viejos —de antes de que se contara lo digital— quedan
                            en "—" a propósito: en esos días nadie lo contó, y mostrar
                            "exacto" diría que se revisó y dio bien. */}
                        <td data-label="Transf. y MP">
                          {difD === null ? <span className="text-muted">—</span>
                            : difD === 0 ? <span className="caja-ok">exacto</span>
                            : <span className={difD < 0 ? 'caja-falta' : 'caja-sobra'}>
                                {difD > 0 ? '+' : ''}{formatCurrency(difD)}
                              </span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Cerrar sin contar CONGELA el período y no se puede deshacer: un cierre no se
          edita, se corrige haciendo otro. Un clic no alcanza para algo irreversible. */}
      <Modal
        isOpen={confirmandoCorte}
        onClose={() => setConfirmandoCorte(false)}
        title="Cerrar sin contar la plata"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmandoCorte(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={cortarSinContar} disabled={guardando}>
              Cerrar igual
            </button>
          </>
        }
      >
        <p>
          Esto cierra el período <strong>sin verificar el efectivo</strong>. Queda marcado como
          &ldquo;sin contar&rdquo; en el historial, y no se puede deshacer.
        </p>
        <p className="form-hint">
          Sirve para cortar el mes desde afuera del gimnasio. Si tenés el cajón adelante,
          conviene contarlo: es el único momento en que se puede.
        </p>
      </Modal>

      {/* ─── ABRIR LA CAJA ─── */}
      <Modal
        isOpen={abriendo}
        onClose={() => setAbriendo(false)}
        title="Abrir caja"
        actions={<ModalActions onCancel={() => setAbriendo(false)} saving={guardando} submitText="Abrir caja" />}
      >
        <form onSubmit={abrirCaja} noValidate>
          <div className="form-group">
            <label className="form-label">¿Con cuánto cambio arranca el cajón?</label>
            <input
              type="number" inputMode="decimal" min="0"
              className="form-input caja-monto"
              value={fondo} placeholder="0" autoFocus
              onChange={(e) => setFondo(e.target.value)}
            />
            {/* ⚠️ ESTE NÚMERO ES POR QUÉ EL ARQUEO CUADRA O NO.
                El cajón arranca el día con el cambio de ayer. Si el sistema esperara solo lo
                cobrado hoy, ese cambio aparecería como sobrante TODOS los días — y un arqueo
                que siempre sobra es un arqueo que nadie mira. */}
            <small className="form-hint">
              Es la plata que ya está en el cajón para dar vuelto. Al cerrar, el sistema espera
              encontrar este monto más lo que se cobre en efectivo.
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
            {/* ⚠️ Obligatorio en los egresos, y no es burocracia: es lo ÚNICO que hace la
                lista revisable. "Proveedor — agua, factura 4412" se puede verificar;
                "Proveedor", no. Un egreso inventado es el robo perfecto de este módulo, y el
                detalle es la mitad de lo que lo deja a la vista. */}
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
            {/* Solo el efectivo mueve el arqueo: lo que se paga desde el banco no salió del
                cajón, y restarlo daría un faltante inventado. Se anota igual porque el dueño
                lo quiere ver. */}
            {movMetodo !== 'CASH' && (
              <small className="form-hint">
                Esto no cambia el conteo del cajón — no salió plata de ahí. Queda anotado igual.
              </small>
            )}
          </div>
        </form>
      </Modal>

      {/* ─── EL CONTEO A CIEGAS ─── */}
      <Modal
        isOpen={contando}
        onClose={() => setContando(false)}
        title="Contá la caja"
        actions={<ModalActions onCancel={() => setContando(false)} saving={guardando} submitText="Confirmar y cerrar" />}
      >
        <form onSubmit={confirmar} noValidate>
          <p className="form-hint caja-aviso">
            <Icon name="alertTriangle" size="0.9em" /> Contá primero, sin mirar el sistema.
            Después de confirmar vas a ver si coincide, y no se puede volver atrás.
          </p>

          <div className="form-group">
            <label className="form-label">Efectivo en el cajón</label>
            <input
              type="number" inputMode="decimal" min="0"
              className="form-input caja-monto"
              value={efectivo} placeholder="0" autoFocus
              onChange={(e) => setEfectivo(e.target.value)}
            />
          </div>

          {/* ⚠️ ESTE CAMPO ES EL QUE CIERRA EL AGUJERO MÁS GRANDE.
              Sin él: se cobra $48.000 en efectivo, se guarda la plata, y el cobro se
              registra como "transferencia". El cajón cuadra perfecto —el sistema no espera
              ese efectivo— y la transferencia que el sistema da por recibida nunca existió.
              Contando solo el cajón, eso no lo detecta nadie. */}
          <div className="form-group">
            <label className="form-label">Transferencias y Mercado Pago</label>
            <input
              type="number" inputMode="decimal" min="0"
              className="form-input caja-monto"
              value={digital} placeholder="0"
              onChange={(e) => setDigital(e.target.value)}
            />
            <small className="form-hint">Mirá el banco o la app de Mercado Pago: cuánto entró desde el último cierre.</small>
          </div>

          {/* Su propia cuenta, no la del sistema. */}
          <div className="caja-total-contado">
            <span>Estás declarando</span>
            <strong>{formatCurrency(totalContado + totalDigital)}</strong>
          </div>
        </form>
      </Modal>

      {/* ─── EL RESULTADO, recién revelado ─── */}
      <Modal
        isOpen={!!resultado}
        onClose={() => setResultado(null)}
        title="Caja cerrada"
        actions={<button className="btn btn-secondary" onClick={() => setResultado(null)}>Listo</button>}
      >
        {resultado && (() => {
          const dif = Number(resultado.diferencia || 0);
          const difD = Number(resultado.diferenciaDigital || 0);
          // Las dos por separado, nunca sumadas: un faltante de efectivo y un sobrante
          // digital son dos hechos distintos, y sumarlos los borra a los dos.
          // ⚠️ Sin conteo no hay nada que cuadre. Este modal solo se abre desde el arqueo,
          // pero si algún día se abriera con un corte sin contar, decir "¡Cuadra todo!"
          // sería exactamente la mentira que este módulo existe para no decir.
          const seConto = resultado.conArqueo !== false;
          const cuadraTodo = seConto && dif === 0 && difD === 0;
          const cuantas = (dif !== 0 ? 1 : 0) + (difD !== 0 ? 1 : 0);
          // Un faltante y un sobrante no son lo mismo: al que falta plata hay que buscarla.
          const hayFaltante = dif < 0 || difD < 0;
          const frase = (d) => d === 0 ? 'Cuadra'
            : d < 0 ? `Faltan ${formatCurrency(Math.abs(d))}`
            : `Sobran ${formatCurrency(d)}`;
          const clase = (d) => d === 0 ? 'ok' : d < 0 ? 'falta' : 'sobra';
          const esperadoDigital = Number(resultado.esperadoTransferencia || 0)
            + Number(resultado.esperadoMercadopago || 0);
          // ⚠️ LA CUENTA COMPLETA, con sus CUATRO términos. Si acá se mostrara solo lo
          // cobrado, el cartel diría "cuadra" al lado de dos números que no dan — y el que
          // lee deja de confiar en la pantalla.
          //
          //   fondo inicial        el cambio de ayer     (sin esto: SOBRABA siempre)
          // + cobrado en efectivo  lo de la ventanilla
          // + ingresos manuales    plata que entró sin ser un cobro
          // - egresos              lo que se gastó       (sin esto: FALTABA siempre)
          //
          // El backend guarda estos números CONGELADOS en el cierre justamente para que este
          // cálculo se pueda rehacer igual dentro de seis meses.
          const fondo = Number(resultado.fondoInicial || 0);
          const esperadoEnElCajon = fondo
            + Number(resultado.esperadoEfectivo || 0)
            + Number(resultado.ingresosEfectivo || 0)
            - Number(resultado.egresosEfectivo || 0);
          return (
            <div className="caja-resultado">
              <div className={`caja-resultado-cifra ${
                cuadraTodo ? 'ok' : hayFaltante ? 'falta' : 'sobra'
              }`}>
                {!seConto ? 'Cerrado sin contar'
                  : cuadraTodo ? '¡Cuadra todo!'
                  : cuantas === 1 ? 'Hay una diferencia'
                  : 'Hay diferencias'}
              </div>

              <div className="caja-linea">
                <div className="caja-linea-titulo">
                  <span>Efectivo</span>
                  <strong className={clase(dif)}>{frase(dif)}</strong>
                </div>
                <div className="caja-metodos">
                  {fondo > 0 && (
                    <div><span>Cambio con el que abriste</span><strong>{formatCurrency(fondo)}</strong></div>
                  )}
                  <div><span>Cobrado en efectivo</span><strong>{formatCurrency(resultado.esperadoEfectivo)}</strong></div>
                  {/* El desglose tiene que EXPLICAR el número de abajo. Si los gastos no
                      aparecieran, el que lee vería "cobré 50.000" arriba y "tendría que
                      haber 35.000" abajo, sin nada que una las dos cosas — y dejaría de
                      confiar en la pantalla, que es lo peor que le puede pasar a un arqueo. */}
                  {Number(resultado.ingresosEfectivo) > 0 && (
                    <div><span>Entró sin ser un cobro</span>
                      <strong className="caja-sobra">+{formatCurrency(resultado.ingresosEfectivo)}</strong>
                    </div>
                  )}
                  {Number(resultado.egresosEfectivo) > 0 && (
                    <div><span>Salió del cajón (gastos)</span>
                      <strong className="caja-falta">−{formatCurrency(resultado.egresosEfectivo)}</strong>
                    </div>
                  )}
                  <div className="caja-metodos-total">
                    <span>Tendría que haber</span><strong>{formatCurrency(esperadoEnElCajon)}</strong>
                  </div>
                  <div><span>Vos contaste</span><strong>{formatCurrency(resultado.declaradoEfectivo)}</strong></div>
                </div>
              </div>

              <div className="caja-linea">
                <div className="caja-linea-titulo">
                  <span>Transferencias y Mercado Pago</span>
                  <strong className={clase(difD)}>{frase(difD)}</strong>
                </div>
                <div className="caja-metodos">
                  <div><span>El sistema esperaba</span><strong>{formatCurrency(esperadoDigital)}</strong></div>
                  <div><span>Vos contaste</span><strong>{formatCurrency(resultado.declaradoDigital)}</strong></div>
                </div>
                {difD < 0 && (
                  /* No es un descuido de conteo: la plata digital no se cae del cajón. O el
                     cobro se registró con el método equivocado, o esa transferencia nunca
                     llegó. Las dos cosas hay que mirarlas hoy, no a fin de mes. */
                  <p className="form-hint caja-aviso">
                    <Icon name="alertTriangle" size="0.9em" /> El sistema da por cobrada plata
                    que no está en la cuenta. Revisá si algún cobro se registró con el método
                    equivocado.
                  </p>
                )}
              </div>

              {!cuadraTodo && !resultado.nota && (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">¿Qué pasó? (opcional)</label>
                  <input
                    className="form-input" value={explicacion}
                    placeholder="Di mal un vuelto, entró un billete falso…"
                    onChange={(e) => setExplicacion(e.target.value)}
                  />
                  <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: '0.5rem' }}
                    onClick={explicar} disabled={!explicacion.trim()}>
                    Guardar explicación
                  </button>
                  <small className="form-hint">Se puede escribir una sola vez.</small>
                </div>
              )}
              {resultado.nota && <p className="form-hint">💬 {resultado.nota}</p>}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
