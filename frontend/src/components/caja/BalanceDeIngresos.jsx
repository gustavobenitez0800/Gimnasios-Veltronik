import { formatCurrency, formatDate, sumarPlata } from '../../lib/utils';
import { TOTAL_DEL, numero } from '../../lib/formatoDeCaja';
import SelectorDeFechas from '../SelectorDeFechas';
import Icon from '../Icon';

/** BALANCE DE INGRESOS: EL RANGO QUE SE ELIJA. */
export default function BalanceDeIngresos({ balance, balanceAlDia, rango, balanceDesde, balanceHasta }) {
  return (
    <div className="card caja-balance">
      <div className="caja-balance-cabecera">
        <h3><Icon name="trendingUp" size="1em" /> Balance de ingresos</h3>
      </div>
      <SelectorDeFechas rango={rango} className="caja-balance-fechas" />
      {/* ⭐ Es el LIBRO DE INGRESOS: el mismo número del tablero, de Pagos y del Excel. Con el
          historial importado y las ventas adentro, cada uno dicho aparte abajo. Hasta el
          22/09 esto dejaba afuera el historial, y el año de un gimnasio recién migrado
          decía una fracción de lo que decía el tablero.
          ⚠️ Con un rango a medio escribir o mal puesto, no hay números: los de antes son de
          otras fechas que las que diría el título. Mientras llegan los del rango nuevo, los
          de antes se ven apagados. */}
      {!rango.problema && (<>
      <div className={`caja-balance-cifras${balanceAlDia ? '' : ' is-actualizando'}`} aria-busy={!balanceAlDia}>
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
      {balance && balanceAlDia && (
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
      </>)}
    </div>
  );
}
