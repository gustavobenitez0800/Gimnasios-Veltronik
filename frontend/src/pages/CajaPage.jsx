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

  // El resultado, recién revelado. Es el único momento en que quien contó ve el número.
  const [resultado, setResultado] = useState(null);
  const [explicacion, setExplicacion] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);
    try {
      const p = await cajaService.pendiente();
      setPendiente(p);
      if (esDueno) {
        setAbierto(await cajaService.abierto());
        setHistorial(await cajaService.historial(60));
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

  const abrirConteo = () => {
    setEfectivo('');
    setDigital('');
    setResultado(null);
    setExplicacion('');
    setContando(true);
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
          <h3><Icon name="clock" size="1em" /> Período abierto</h3>
          {cargando ? <p className="text-muted">Cargando…</p> : fallo ? (
            <div className="caja-fallo">
              <Icon name="wifiOff" size="1.1em" />
              <div>
                <strong>No pudimos consultar el período.</strong>
                <div>Sin ese dato no se puede cerrar la caja con confianza. Probá de nuevo.</div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={cargar}>Reintentar</button>
            </div>
          ) : (
            <>
              <p className="caja-desde">
                Desde <strong>{fecha(pendiente?.desde)}</strong> · {pendiente?.cantidadCobros || 0} cobros
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
                    <span>Total del período</span>
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
                  <Icon name="checkCircle" size="1em" /> Contar y cerrar
                </button>
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
                  <div><span>El sistema esperaba</span><strong>{formatCurrency(resultado.esperadoEfectivo)}</strong></div>
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
