import { formatCurrency, sumarPlata } from '../../lib/utils';
import { numero } from '../../lib/formatoDeCaja';
import Icon from '../Icon';

/**
 * RESUMEN POR FORMA DE PAGO.
 *
 * Lo que antes había que averiguar mirando cobro por cobro. Es la cuenta que el dueño quería
 * hacer de un vistazo: de 20 cobros, cuántos por transferencia y cuántos en efectivo.
 */
export default function ResumenPorForma({ abierto, totalCobrado }) {
  return (
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
  );
}
