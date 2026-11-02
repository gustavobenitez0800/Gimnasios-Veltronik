import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import Icon from '../Icon';
import { memberService, llaveroService, errorService } from '../../services';
import { useToast } from '../../contexts/ToastContext';
import { useEstaEnLinea } from '../../hooks';
import { useQuienAtiende } from '../../hooks/useQuienAtiende';
import { formatDate, getInitials } from '../../lib/utils';

/**
 * ⭐ ALGUIEN PASÓ UN LLAVERO QUE NO ES DE NADIE (ADR-016 §6.2).
 *
 * <p>Es la forma de cargar un gimnasio entero sin sentarse a hacerlo: cada socio, la primera vez
 * que pasa su llavero, aparece acá; quien atiende lo busca, se lo asigna, y el socio entra. La
 * próxima vez entra solo con el llavero.</p>
 *
 * <p><b>El molinete no se abre</b> mientras el llavero no sea de nadie: abre cuando se le registra
 * la entrada al socio, con la regla de siempre.</p>
 *
 * <p>Si el llavero se había dado de baja (se le perdió a alguien), lo dice antes que nada: que
 * aparezca un llavero perdido es algo que quien atiende tiene que saber.</p>
 *
 * @param {{codigo: string, ultimaBaja?: object|null}|null} lectura el llavero leído, o null (cerrado)
 * @param {(socio: object) => void} onAsignado se le asignó a ese socio: hay que registrarle la entrada
 */
export default function LlaveroSinAsignar({ lectura, onCerrar, onAsignado }) {
  const { showToast } = useToast();
  const enLinea = useEstaEnLinea();
  const quienAtiende = useQuienAtiende();

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  // Le iba a asignar a `socio`, pero el llavero es de `otro`: se pregunta antes de sacárselo.
  const [conflicto, setConflicto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const ultimaBusqueda = useRef('');

  // Un llavero nuevo empieza de cero: lo buscado para el anterior no tiene nada que ver.
  const codigo = lectura?.codigo || '';
  useEffect(() => {
    setBusqueda('');
    setResultados([]);
    setConflicto(null);
    ultimaBusqueda.current = '';
  }, [codigo]);

  const buscar = async (texto) => {
    setBusqueda(texto);
    const q = texto.trim();
    ultimaBusqueda.current = q;
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    let encontrados = [];
    try {
      encontrados = (await memberService.searchForAccess(q)) || [];
    } catch {
      encontrados = [];
    }
    // Solo la respuesta de lo último que se escribió: una búsqueda vieja que llega tarde no pisa.
    if (ultimaBusqueda.current === q) setResultados(encontrados.slice(0, 8));
  };

  const asignar = async (socio, reasignar = false) => {
    setGuardando(true);
    try {
      const r = await llaveroService.asignar(socio.id, codigo, { reasignar, hechoPor: quienAtiende() });
      showToast(
        r?.reasignadoDe
          ? `Listo: el llavero ahora es de ${socio.fullName} (se le dio de baja a ${r.reasignadoDe}).`
          : `Listo: el llavero es de ${socio.fullName}.`,
        'success',
      );
      setConflicto(null);
      onAsignado?.(socio);
    } catch (error) {
      const otro = error?.response?.status === 409 ? error.response.data?.socio : null;
      if (otro && !reasignar) {
        setConflicto({ socio, otro });
      } else {
        showToast(!error?.response
          ? 'Sin conexión: el llavero no se asignó. Probá de nuevo cuando vuelva internet.'
          : errorService.getMessage(error), 'error');
      }
    } finally {
      setGuardando(false);
    }
  };

  const baja = lectura?.ultimaBaja;

  return (
    <Modal isOpen={!!lectura} onClose={onCerrar} title="Llavero sin asignar"
      actions={<button type="button" className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>}>
      <div className="llavero-pila">
        <div>
          <div className="llavero-codigo">{codigo}</div>
          <p className="llavero-texto">
            Este llavero no es de ningún socio, así que el molinete no se abrió. Si es de alguien,
            buscalo y asignáselo: le registro la entrada y la próxima vez entra solo con el llavero.
          </p>
        </div>

        {baja && (
          <p className="llavero-aviso" role="status">
            <Icon name="alertTriangle" size="1.1em" />
            <span>
              Este llavero era de <strong>{baja.socio?.nombre || 'un socio que ya no está'}</strong> y
              se dio de baja el {formatDate(baja.llavero?.dadoDeBajaEn)}
              {baja.llavero?.motivoBaja ? ` (${baja.llavero.motivoBaja})` : ''}. Si apareció, se puede
              volver a asignar.
            </span>
          </p>
        )}

        {!enLinea && (
          <p className="llavero-aviso" role="status">
            <Icon name="wifiOff" size="1.1em" />
            <span>
              Sin internet no se puede asignar un llavero. Mientras tanto, buscá al socio por su DNI
              en Accesos para registrarle la entrada.
            </span>
          </p>
        )}

        {enLinea && conflicto && (
          <div className="llavero-aviso" role="alert">
            <Icon name="alertTriangle" size="1.1em" />
            <div className="llavero-pila">
              <span>
                Este llavero ya es de <strong>{conflicto.otro.nombre}</strong>. ¿Pasárselo a{' '}
                <strong>{conflicto.socio.fullName}</strong>? A {conflicto.otro.nombre} se le da de
                baja, y queda anotado en su ficha.
              </span>
              <div className="llavero-fila">
                <button type="button" className="btn btn-primary" disabled={guardando}
                  onClick={() => asignar(conflicto.socio, true)}>
                  Sí, pasárselo
                </button>
                <button type="button" className="btn btn-secondary" disabled={guardando}
                  onClick={() => setConflicto(null)}>
                  No
                </button>
              </div>
            </div>
          </div>
        )}

        {enLinea && !conflicto && (
          <div className="llavero-pila">
            <input
              type="text" className="form-input" autoFocus enterKeyHint="search"
              placeholder="¿De quién es? Buscalo por nombre o DNI"
              value={busqueda} onChange={(e) => buscar(e.target.value)}
              aria-label="Buscar al socio dueño del llavero"
            />
            {resultados.length > 0 && (
              <div className="search-results">
                {resultados.map((socio) => (
                  <div key={socio.id} className="search-result-item">
                    <div className="member-avatar">{getInitials(socio.fullName)}</div>
                    <div className="member-info">
                      <div className="member-name">{socio.fullName}</div>
                      <div className="member-dni">DNI: {socio.dni || '-'}</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-primary" disabled={guardando}
                      onClick={() => asignar(socio)}>
                      Asignárselo
                    </button>
                  </div>
                ))}
              </div>
            )}
            {busqueda.trim().length >= 2 && resultados.length === 0 && (
              <p className="llavero-texto">No encontré a nadie con «{busqueda.trim()}».</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
