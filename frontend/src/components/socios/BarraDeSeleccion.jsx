import { formatCurrency } from '../../lib/utils';
import { SACAR_ARANCEL } from '../../lib/listaDeSocios';
import Icon from '../Icon';

/**
 * LA BARRA DE SELECCIÓN.
 *
 * Aparece sola cuando hay algo marcado y desaparece cuando no. Una barra siempre visible con
 * "0 seleccionados" es ruido permanente para una acción que se usa una vez cada tanto.
 */
export default function BarraDeSeleccion({ seleccion, setSeleccion, asignandoMasivo, setConfirmandoMasivo, aranceles }) {
  return (
    <div className="seleccion-barra">
      <span className="seleccion-cuantos">
        <Icon name="users" size="1em" /> {seleccion.size} seleccionado{seleccion.size === 1 ? '' : 's'}
      </span>
      <select
        className="form-select seleccion-arancel"
        value=""
        disabled={asignandoMasivo}
        onChange={(e) => {
          // No se aplica al elegir: se pregunta primero. Escribir sobre doscientas
          // fichas no puede pasar por un cambio de desplegable.
          if (e.target.value !== '') setConfirmandoMasivo({ planId: e.target.value });
        }}
      >
        <option value="">Asignarles un arancel…</option>
        {aranceles.map((a) => (
          <option key={a.id} value={a.id}>{a.name} · {formatCurrency(a.price)}</option>
        ))}
        <option value={SACAR_ARANCEL}>Sacarles el arancel</option>
      </select>
      <button className="btn btn-sm btn-secondary" onClick={() => setSeleccion(new Set())}>
        Limpiar
      </button>
    </div>
  );
}
