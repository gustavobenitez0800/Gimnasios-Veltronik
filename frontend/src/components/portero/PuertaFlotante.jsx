import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CONFIG from '../../lib/config';
import AvisosMostrador from '../AvisosMostrador';
import Icon from '../Icon';

/**
 * ⭐ LA PUERTA, MIENTRAS SE ATIENDE OTRA COSA (03/11/2026).
 *
 * <p>El profe está cobrando en Pagos o armando la grilla de Clases, y un socio pasa el llavero o
 * escanea el QR. La puerta la sigue atendiendo el portero (`PorteroContext`): esto es lo que se
 * ve de ella fuera de Accesos, en el rincón de abajo a la derecha.</p>
 *
 * <ul>
 *   <li><b>El último que pasó</b>, chico y por unos segundos, como el cartel de Accesos. No se
 *       puede tocar: el clic tiene que llegar a lo que hay debajo.</li>
 *   <li><b>Los que necesitan atención</b> (entraron solos sin estar al día, o la puerta los
 *       frenó), con «Cobrar» y «OK». Se quedan hasta que alguien los atienda, y se pueden plegar
 *       para que no tapen el trabajo.</li>
 * </ul>
 */
export default function PuertaFlotante({ avisos = [], rechazos = [], carteles = [], onCobrar, onAtendido }) {
  const navigate = useNavigate();
  const [plegado, setPlegado] = useState(false);
  const cuantos = avisos.length + rechazos.length;
  const ultimo = carteles[0] || null;

  if (!cuantos && !ultimo) return null;

  return (
    <div className="puerta-flotante">
      {cuantos > 0 && (
        <section className="puerta-flotante-atencion" aria-label="La puerta necesita atención">
          <div className="puerta-flotante-barra">
            <button type="button" className="puerta-flotante-titulo" onClick={() => setPlegado((p) => !p)}
              aria-expanded={!plegado}>
              <Icon name="doorEnter" size="1em" />
              {cuantos === 1 ? '1 socio necesita atención' : `${cuantos} socios necesitan atención`}
              <Icon name={plegado ? 'chevronUp' : 'chevronDown'} size="0.95em" />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate(CONFIG.ROUTES.ACCESS)}>
              Ir a Accesos
            </button>
          </div>
          {!plegado && (
            <div className="puerta-flotante-lista">
              <AvisosMostrador avisos={rechazos} variante="rechazo" compacto onCobrar={onCobrar} onAtendido={onAtendido} />
              <AvisosMostrador avisos={avisos} compacto onCobrar={onCobrar} onAtendido={onAtendido} />
            </div>
          )}
        </section>
      )}

      {/* El último que pasó, como el cartel de Accesos pero chico. aria-live: el lector de pantalla
          lo dice, y nadie tiene que mover el foco para enterarse. */}
      <div aria-live="polite">
        {ultimo && (
          <div key={ultimo.id} className={`puerta-flotante-cartel ${ultimo.type}${ultimo.saliendo ? ' saliendo' : ''}`}>
            <div className="acceso-aviso-inicial">{ultimo.initials}</div>
            <div className="puerta-flotante-cartel-texto">
              <strong>{ultimo.name}</strong>
              <span>
                {ultimo.accion}
                {ultimo.valor != null ? ` · ${ultimo.valor} ${ultimo.unidad}` : ultimo.unidad ? ` · ${ultimo.unidad}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
