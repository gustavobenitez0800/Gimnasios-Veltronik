import { formatCurrency, formatDate } from '../../lib/utils';
import { diaDeLaCaja } from '../../lib/excelDeCaja';
import { fecha, numero } from '../../lib/formatoDeCaja';
import { EmptyState } from '../Layout';
import Icon from '../Icon';

/** EL HISTORIAL: solo el dueño, y es donde está el valor. */
export default function CierresAnteriores({ historial, exportando, exportar }) {
  return (
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
                // El día de esa caja: cerrada a las 00:30 es la del día que terminó.
                const dia = diaDeLaCaja(c.hasta);
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
  );
}
