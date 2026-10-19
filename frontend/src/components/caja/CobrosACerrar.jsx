import { formatCurrency } from '../../lib/utils';
import { nombreDeForma, esEfectivo } from '../../lib/formasDePago';
import { cuandoDe } from '../../lib/formatoDeCaja';
import { EmptyState } from '../Layout';
import Icon from '../Icon';

/**
 * LOS COBROS DEL PERÍODO.
 *
 * Un total que no se puede abrir es un número en el que hay que creer. Acá está cada cobro que
 * lo forma. Lo ve quien cierra, que ahora también es recepción.
 */
export default function CobrosACerrar({ cobros, cargando, totalCobrado }) {
  return (
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
  );
}
