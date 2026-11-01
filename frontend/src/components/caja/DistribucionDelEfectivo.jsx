import { formatCurrency, horaDe } from '../../lib/utils';
import { fecha, numero } from '../../lib/formatoDeCaja';
import Icon from '../Icon';

/**
 * DISTRIBUCIÓN DEL EFECTIVO EN CAJA.
 *
 * La única decisión del cierre. Todo lo de arriba lo calculó el sistema.
 */
export default function DistribucionDelEfectivo({
  abierto, enElCajon, retiro, setRetiro, quedaEnCaja, retiroExcedido,
  guardando, cargando, fallo, setConfirmando,
}) {
  return (
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
  );
}
