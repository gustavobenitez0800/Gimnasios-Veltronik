import { useCallback, useEffect, useState } from 'react';
import { llaveroService, errorService } from '../../services';
import { useToast } from '../../contexts/ToastContext';
import { useEstaEnLinea } from '../../hooks';
import { useQuienAtiende } from '../../hooks/useQuienAtiende';
import { formatDate } from '../../lib/utils';
import { normalizarLlavero, esLlaveroValido } from '../../lib/llaveros';
import Icon from '../Icon';

/**
 * Los llaveros del socio, en su ficha (ADR-016 §6).
 *
 * <p>Se asignan <b>pasándolos por el lector</b>, nunca tecleando el número: así queda guardado
 * en el formato que escribe el lector del gimnasio, que es el que se va a comparar en la puerta.
 * (Si alguien lo teclea igual, se acepta: es la misma regla.)</p>
 *
 * <p>Va adentro del formulario de la ficha pero NO es parte de su «Guardar»: cada llavero se
 * guarda en el acto. Por eso los botones son {@code type="button"} y el Enter del lector no
 * envía el formulario.</p>
 *
 * @param {{ socioId: string, nombre: string }} props
 */
export default function LlaverosDelSocio({ socioId, nombre }) {
  const { showToast } = useToast();
  const enLinea = useEstaEnLinea();
  const quienAtiende = useQuienAtiende();

  const [llaveros, setLlaveros] = useState(null); // null = cargando
  const [noSePudo, setNoSePudo] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  // El llavero era de otro socio: se pregunta antes de sacárselo.
  const [conflicto, setConflicto] = useState(null);
  // El que se está por dar de baja: se confirma en el renglón, sin otra ventana encima.
  const [porDarDeBaja, setPorDarDeBaja] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setLlaveros(await llaveroService.delSocio(socioId));
      setNoSePudo(false);
    } catch {
      setNoSePudo(true);
    }
  }, [socioId]);

  useEffect(() => {
    if (socioId && enLinea) cargar();
  }, [socioId, enLinea, cargar]);

  const asignar = async (reasignar = false) => {
    const limpio = normalizarLlavero(codigo);
    if (!esLlaveroValido(limpio)) {
      showToast('Eso no parece el número de un llavero. Pasalo de nuevo por el lector.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const r = await llaveroService.asignar(socioId, limpio, { reasignar, hechoPor: quienAtiende() });
      showToast(
        r?.reasignadoDe
          ? `Llavero asignado. A ${r.reasignadoDe} se le dio de baja.`
          : r?.nuevo === false ? 'Ese llavero ya era suyo.' : 'Llavero asignado.',
        'success',
      );
      setCodigo('');
      setConflicto(null);
      setAsignando(false);
      await cargar();
    } catch (error) {
      const otro = error?.response?.status === 409 ? error.response.data?.socio : null;
      if (otro && !reasignar) setConflicto(otro);
      else showToast(!error?.response ? 'Sin conexión: el llavero no se asignó.' : errorService.getMessage(error), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const darDeBaja = async (llavero) => {
    setGuardando(true);
    try {
      await llaveroService.darDeBaja(llavero, { motivo: 'Lo perdió', hechoPor: quienAtiende() });
      showToast('Llavero dado de baja: ya no abre.', 'success');
      setPorDarDeBaja(null);
      await cargar();
    } catch (error) {
      showToast(!error?.response ? 'Sin conexión: el llavero sigue activo.' : errorService.getMessage(error), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const activos = (llaveros || []).filter((l) => l.activo);
  const deBaja = (llaveros || []).filter((l) => !l.activo);

  return (
    <div className="form-group full-width llavero-pila">
      <span className="form-label llavero-titulo">
        <Icon name="key" size="1em" /> Llaveros
      </span>

      {!enLinea && (
        <p className="llavero-texto">Sin internet no se pueden ver ni asignar llaveros. El socio entra igual con el que ya tiene.</p>
      )}
      {enLinea && noSePudo && (
        <p className="llavero-texto">No se pudieron traer sus llaveros. Probá de nuevo en un rato.</p>
      )}
      {enLinea && !noSePudo && llaveros === null && <p className="llavero-texto">Cargando…</p>}

      {enLinea && llaveros !== null && (
        <>
          {activos.length > 0 ? (
            <div className="llavero-lista">
              {activos.map((l) => (
                <div key={l.id} className="llavero-item">
                  <span>
                    <span className="llavero-codigo is-chico">{l.codigo}</span>
                    <span className="llavero-item-detalle">
                      Desde el {formatDate(l.asignadoEn)}{l.asignadoPor ? ` · ${l.asignadoPor}` : ''}
                    </span>
                  </span>
                  {porDarDeBaja?.id === l.id ? (
                    <span className="llavero-fila">
                      <span className="llavero-texto">¿Darlo de baja? Deja de abrir.</span>
                      <button type="button" className="btn btn-sm btn-danger" disabled={guardando} onClick={() => darDeBaja(l)}>
                        Sí, lo perdió
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPorDarDeBaja(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPorDarDeBaja(l)}>
                      Lo perdió
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="llavero-texto">No tiene llavero. Entra con su DNI o con el QR.</p>
          )}

          {conflicto && (
            <div className="llavero-aviso" role="alert">
              <div className="llavero-pila">
                <span>
                  Ese llavero es de <strong>{conflicto.nombre}</strong>. ¿Pasárselo a <strong>{nombre}</strong>?
                  A {conflicto.nombre} se le da de baja, y queda anotado.
                </span>
                <div className="llavero-fila">
                  <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => asignar(true)}>
                    Sí, pasárselo
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setConflicto(null)}>No</button>
                </div>
              </div>
            </div>
          )}

          {asignando && !conflicto ? (
            <div className="llavero-fila">
              <input
                type="text" className="form-input" autoFocus inputMode="text" autoComplete="off"
                placeholder="Pasá el llavero por el lector"
                aria-label="Número del llavero"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => {
                  // El lector termina con un Enter: es para asignar, no para guardar la ficha.
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (!guardando) asignar();
                }}
              />
              <button type="button" className="btn btn-primary" disabled={guardando || !codigo.trim()} onClick={() => asignar()}>
                Asignar
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setAsignando(false); setCodigo(''); }}>
                Cancelar
              </button>
            </div>
          ) : !conflicto && (
            <div>
              <button type="button" className="btn btn-secondary" onClick={() => setAsignando(true)}>
                <Icon name="plus" size="1em" /> Asignar llavero
              </button>
            </div>
          )}

          {deBaja.length > 0 && (
            <details>
              <summary className="llavero-texto">Dados de baja ({deBaja.length})</summary>
              <div className="llavero-lista">
                {deBaja.map((l) => (
                  <div key={l.id} className="llavero-item is-de-baja">
                    <span>
                      <span className="llavero-codigo is-chico">{l.codigo}</span>
                      <span className="llavero-item-detalle">
                        {l.motivoBaja || 'Dado de baja'} · el {formatDate(l.dadoDeBajaEn)}
                        {l.dadoDeBajaPor ? ` · ${l.dadoDeBajaPor}` : ''}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
