import { formatDate } from '../../lib/utils';
import Modal from '../ui/Modal';
import Icon from '../Icon';

/**
 * LA PAPELERA.
 *
 * Un modal y no una pantalla aparte a propósito: se usa pocas veces al año y siempre por el
 * mismo motivo ("borré a fulano sin querer"), así que tiene que estar donde uno lo busca —en
 * Socios— y no ser un módulo más en el menú.
 */
export default function Papelera({ papelera, setPapelera, cargandoPapelera, restaurando, restaurarSocio }) {
  return (
    <Modal
      isOpen={papelera !== null}
      onClose={() => setPapelera(null)}
      title="Papelera"
      size="large"
      className="papelera-modal"
    >
      <p className="text-muted" style={{ marginTop: 0 }}>
        {cargandoPapelera
          ? 'Buscando…'
          : papelera?.length
            ? 'Estos socios están eliminados. Recuperarlos los devuelve al padrón con sus pagos y sus visitas.'
            : 'No hay socios eliminados.'}
      </p>

      {/* Una lista y no una tabla: con cuatro columnas, en el celular el nombre, el DNI y la
          fecha quedaban pegados uno al otro y partidos en dos renglones. Cada socio es un
          renglón: quién es arriba, el DNI y cuándo se borró abajo, y el botón a la derecha. */}
      {!cargandoPapelera && papelera?.length > 0 && (
        <ul className="papelera-lista">
          {papelera.map((m) => (
            <li key={m.id} className="papelera-item">
              <div className="papelera-datos">
                <span className="papelera-nombre">
                  {m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Sin nombre'}
                </span>
                <span className="papelera-detalle">{m.dni ? `DNI ${m.dni}` : 'Sin DNI'}</span>
                {m.deletedAt && (
                  <span className="papelera-detalle">Eliminado el {formatDate(m.deletedAt)}</span>
                )}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={restaurando === m.id}
                onClick={() => restaurarSocio(m)}
              >
                <Icon name="refresh" size="1em" /> {restaurando === m.id ? 'Recuperando…' : 'Recuperar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
