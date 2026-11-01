// Las cuatro ventanas de la Caja. El estado y las acciones vienen de controllers/useCajaController.js.
import { formatCurrency } from '../../lib/utils';
import { CATEGORIAS_EGRESO, CATEGORIAS_INGRESO, ES_DE_FONDOS, numero } from '../../lib/formatoDeCaja';
import Modal, { ModalActions } from '../ui/Modal';

/**
 * CONFIRMAR CIERRE.
 *
 * Cerrar el día no se deshace: el período siguiente arranca acá y el cajón queda encadenado a
 * este número. Un clic de más no puede alcanzar.
 */
export function ConfirmarCierre({ confirmando, setConfirmando, totalCobrado, abierto, retiroNum, quedaEnCaja, cerrarCaja, guardando }) {
  return (
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
  );
}

/** EL CIERRE RECIÉN HECHO. */
export function CierreHecho({ resultado, setResultado }) {
  return (
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
  );
}

/**
 * ANULAR UN MOVIMIENTO: el motivo queda registrado.
 *
 * ⚠️ <ModalActions> va ADENTRO del <form>, acá y en la ventana de abajo. Del 2026-09-02 al
 * 2026-10-07 iban en la ranura `actions` del Modal, que se dibuja fuera del formulario, y un
 * <button type="submit"> fuera de su form no envía nada: "Anular" y "Anotar" se podían apretar
 * todo el día y no pasaba nada.
 */
export function AnularMovimiento({ anulando, setAnulando, confirmarAnulacion, motivoAnulacion, setMotivoAnulacion, guardando }) {
  return (
    <Modal
      isOpen={!!anulando}
      onClose={() => setAnulando(null)}
      title="Anular movimiento"
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
        <ModalActions onCancel={() => setAnulando(null)} saving={guardando} submitText="Anular" />
      </form>
    </Modal>
  );
}

/** ANOTAR UN GASTO O UN INGRESO. */
export function AnotarMovimiento({
  anotando, setAnotando, anotarMovimiento, guardando,
  movTipo, movCategoria, setMovCategoria, movDetalle, setMovDetalle,
  movMonto, setMovMonto, movMetodo, setMovMetodo,
}) {
  return (
    <Modal
      isOpen={anotando}
      onClose={() => setAnotando(false)}
      title={movTipo === 'EGRESO' ? 'Anotar un gasto' : 'Anotar un ingreso'}
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
        <ModalActions onCancel={() => setAnotando(false)} saving={guardando} submitText="Anotar" />
      </form>
    </Modal>
  );
}
