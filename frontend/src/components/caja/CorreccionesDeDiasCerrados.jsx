import { formatCurrency, sumarPlata } from '../../lib/utils';
import { nombreDeForma } from '../../lib/formasDePago';
import { fecha, numero } from '../../lib/formatoDeCaja';
import Icon from '../Icon';

/**
 * LAS CORRECCIONES DE DÍAS YA CERRADOS (V88).
 *
 * Un cobro de un día que ya se cerró y que después se corrigió o se anuló. El cierre de ese día
 * quedó con su número y no se reescribe: la diferencia entra en este, a la vista, renglón por
 * renglón. Antes esa plata no aparecía en ningún cierre.
 */
export default function CorreccionesDeDiasCerrados({ correcciones }) {
  return (
    <div className="card caja-correcciones">
      <div className="caja-card-cabecera">
        <h3><Icon name="alertTriangle" size="1em" /> Correcciones de días ya cerrados ({correcciones.length})</h3>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Cobro del</th><th>Socio</th><th>Antes</th><th>Ahora</th><th className="caja-col-monto">Diferencia</th></tr>
          </thead>
          <tbody>
            {correcciones.map((c) => {
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
  );
}
