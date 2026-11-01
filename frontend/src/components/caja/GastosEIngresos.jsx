import { formatCurrency } from '../../lib/utils';
import { nombreDeForma, esEfectivo } from '../../lib/formasDePago';
import { fecha } from '../../lib/formatoDeCaja';
import Icon from '../Icon';

/**
 * LO QUE SALE Y ENTRA SIN SER UN COBRO.
 *
 * Va antes de la distribución, porque la cambia: un gasto pagado del cajón es plata que ya no
 * está. Los botones viven en la cabecera de su propia tarjeta; sueltos entre dos tarjetas
 * quedaban pegados a la de abajo.
 */
export default function GastosEIngresos({ movsCaja, guardando, pedirMovimiento, pedirAnulacion }) {
  return (
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
  );
}
