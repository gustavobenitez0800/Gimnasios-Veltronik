// ============================================
// VELTRONIK - CONFIRMACIÓN DE BORRAR LA CUENTA
// ============================================
// Vive en el LOBBY, no adentro de una sucursal.
//
// POR QUÉ IMPORTA DÓNDE ESTÁ
// Esto borra TODAS las sucursales. Ofrecerlo adentro de una —como estaba— era incoherente:
// entrabas a "Centro", tocabas un botón, y desaparecían Centro, Norte y Sur. En el Lobby, en
// cambio, el dueño está mirando la lista completa de lo que está por perder.
//
// Modal propio y no ConfirmDialog porque exige ESCRIBIR el nombre. La fricción es deliberada:
// de todos los botones del sistema este es el único donde equivocarse no tiene arreglo
// después de 30 días, y escribir obliga a leer.

import { useState } from 'react';
import { accountService } from '../services/AccountService';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icon';

/** Frase exacta que hay que escribir. Fija y no un nombre propio: acá se borran TODAS las
 *  sucursales, así que pedir el nombre de una sola sería confuso — ¿cuál? */
export const FRASE_CONFIRMACION = 'BORRAR MI CUENTA';

export default function BorrarCuentaModal({ gimnasios = 0, onClose, onBorrado }) {
  const { showToast } = useToast();
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);

  const puedeBorrar = texto.trim().toUpperCase() === FRASE_CONFIRMACION && !borrando;

  const borrar = async () => {
    if (!puedeBorrar) return;
    setBorrando(true);
    try {
      await accountService.requestDeletion();
      onBorrado?.();
    } catch (e) {
      // El caso que importa: no se pudo cortar el cobro, así que NO se marcó nada. El
      // backend manda el porqué y ese texto sí es para el cliente.
      showToast(e.response?.data?.error || 'No pudimos procesar el borrado. Probá de nuevo.', 'error');
      setBorrando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !borrando && onClose?.()}>
      <div className="modal-container borrado-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title borrado-modal-titulo">
          <Icon name="alertTriangle" size="1.2em" /> Borrar mi cuenta
        </h2>

        <p>
          Esto elimina <strong>todo</strong>, y no se puede deshacer después de 30 días:
        </p>
        <ul className="borrado-modal-lista">
          <li>
            {gimnasios === 1 ? 'Tu gimnasio' : `Tus ${gimnasios} gimnasios`} y todos sus datos
          </li>
          <li>Socios, pagos y accesos</li>
          <li>Tu forma de entrar al sistema</li>
        </ul>
        <p>
          Damos de baja el cobro automático ahora mismo. Tenés <strong>30 días</strong> para
          arrepentirte: durante ese tiempo vas a poder entrar solo para cancelar el borrado.
        </p>

        <p className="borrado-modal-aparte">
          <Icon name="info" size="0.95em" />
          <span>
            ¿Solo querés cerrar <strong>una</strong> sucursal? Cerrá esta ventana y usá el botón
            de eliminar en la tarjeta de esa sucursal.
          </span>
        </p>

        <label className="borrado-modal-label" htmlFor="confirmar-borrado-cuenta">
          Para confirmar, escribí <strong>{FRASE_CONFIRMACION}</strong>
        </label>
        <input
          id="confirmar-borrado-cuenta"
          className="form-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={FRASE_CONFIRMACION}
          // Sin autocorrección: el corrector del teléfono "arregla" el texto hasta que no
          // coincide nunca. Ya pasó con el borrado de sucursal.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck="false"
        />

        <div className="modal-actions">
          <button className="btn btn-secondary" disabled={borrando} onClick={onClose}>
            Mejor no
          </button>
          <button className="btn btn-danger" disabled={!puedeBorrar} onClick={borrar}>
            {borrando ? 'Procesando…' : 'Sí, borrar mi cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}
