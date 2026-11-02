import { useRef, useState } from 'react';
import { memberService, llaveroService, errorService } from '../../services';
import { useToast } from '../../contexts/ToastContext';
import { useEstaEnLinea } from '../../hooks';
import { useQuienAtiende } from '../../hooks/useQuienAtiende';
import { crearDetectorDeRafagas } from '../../lib/rafagaDelLector';
import { normalizarLlavero, esLlaveroValido } from '../../lib/llaveros';
import Icon from '../Icon';

/**
 * Ajustes → Llaveros (ADR-016).
 *
 * <p><b>Probar el lector</b>, para todos: se pasa un llavero y dice qué número escribió el lector,
 * si lo reconoció como lector (o parece tecleado a mano) y de quién es. Es la prueba que hay que
 * hacer al instalar uno, y la que compara el número contra el que traía el sistema anterior.</p>
 *
 * <p><b>Los llaveros que vinieron en el DNI</b>, solo dueño o admin: ControlFit guardaba el
 * llavero en el campo DNI/ID. Esos socios ya entran con el llavero (la puerta también busca en el
 * documento), pero pasarlo a llavero deja el DNI libre para corregirlo y permite darlo de baja si
 * lo pierden. Es una lista para revisar, nunca una conversión automática: un número largo puede
 * ser también un documento extranjero.</p>
 */
export default function LlaverosSettings({ puedeAdministrar = false }) {
  return (
    <div className="settings-section">
      <h2 className="settings-section-title llavero-titulo">
        <Icon name="key" size="1.1em" /> Llaveros
      </h2>
      <div className="llavero-pila">
        <p className="llavero-texto">
          Los socios pueden entrar pasando su llavero por un lector USB, sin teclear el DNI. Sirve
          un lector «tipo teclado»: el que escribe el número y el Enter solo, como un lector de
          códigos de barras. En Accesos el socio pasa el llavero, aparece su cartel y, si hay cajita
          del molinete, se abre. El llavero de cada socio se asigna desde su ficha, o en Accesos la
          primera vez que lo pasa.
        </p>
        <ProbarElLector />
        {puedeAdministrar && <LosQueVinieronEnElDni />}
      </div>
    </div>
  );
}

/** Se pasa un llavero y dice qué escribió el lector, si es un lector, y de quién es. */
function ProbarElLector() {
  const [texto, setTexto] = useState('');
  const [prueba, setPrueba] = useState(null);
  const detector = useRef(crearDetectorDeRafagas());

  const alTeclear = async (e) => {
    if (e.key !== 'Enter') {
      detector.current.tecla(e.key, e.timeStamp);
      return;
    }
    e.preventDefault();
    const rafaga = detector.current.tecla('Enter', e.timeStamp);
    const codigo = normalizarLlavero(rafaga?.codigo ?? texto);
    setTexto('');
    if (!codigo) return;
    let socios = [];
    try {
      ({ socios } = await memberService.buscarPorLlavero(codigo));
    } catch {
      socios = [];
    }
    setPrueba({ codigo, fueLector: !!rafaga, valido: esLlaveroValido(codigo), socios });
  };

  return (
    <div className="llavero-pila">
      <label className="form-label" htmlFor="llavero-prueba">Probar el lector</label>
      <input
        id="llavero-prueba" type="text" className="form-input" autoComplete="off"
        placeholder="Hacé clic acá y pasá un llavero por el lector"
        value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={alTeclear}
      />
      {prueba && (
        <div className="llavero-pila" role="status">
          <span>
            El lector escribió <span className="llavero-codigo is-chico">{prueba.codigo}</span>
          </span>
          {prueba.fueLector ? (
            <span className="llavero-prueba-ok">
              Lo reconocí como un lector: en Accesos va a andar solo.
            </span>
          ) : (
            <span className="llavero-prueba-mal">
              Eso parece tecleado a mano. Si lo escribió el lector, revisá que esté en modo teclado y
              que termine con Enter; si no, en Accesos se va a tomar como una persona escribiendo.
            </span>
          )}
          {!prueba.valido && (
            <span className="llavero-prueba-mal">No tiene forma de llavero: no se va a poder asignar.</span>
          )}
          {prueba.valido && (
            <span className="llavero-texto">
              {prueba.socios.length === 0 && 'No es de ningún socio todavía: asignáselo desde su ficha, o pasándolo en Accesos.'}
              {prueba.socios.length === 1 && <>Es de <strong>{prueba.socios[0].fullName}</strong>.</>}
              {prueba.socios.length > 1 && `Coincide con ${prueba.socios.length} socios: el llavero de uno y el DNI de otro.`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Solo dueño o admin: los socios con el número del llavero guardado en el DNI. */
function LosQueVinieronEnElDni() {
  const { showToast } = useToast();
  const enLinea = useEstaEnLinea();
  const quienAtiende = useQuienAtiende();
  const [candidatos, setCandidatos] = useState(null);
  const [elegidos, setElegidos] = useState(() => new Set());
  const [ocupado, setOcupado] = useState(false);

  const buscar = async () => {
    setOcupado(true);
    try {
      const lista = await llaveroService.candidatosEnElDocumento();
      setCandidatos(lista);
      // Los que se pueden pasar, marcados: lo normal es pasarlos a todos y destildar alguno.
      setElegidos(new Set(lista.filter((c) => !c.yaEsDe).map((c) => c.socioId)));
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const alternar = (id) => setElegidos((antes) => {
    const despues = new Set(antes);
    if (despues.has(id)) despues.delete(id);
    else despues.add(id);
    return despues;
  });

  const pasar = async () => {
    setOcupado(true);
    try {
      const r = await llaveroService.pasarDelDocumento([...elegidos], { hechoPor: quienAtiende() });
      const listos = r.pasados === 1 ? 'Listo: 1 socio tiene su llavero.' : `Listo: ${r.pasados} socios tienen su llavero.`;
      // Los que no se pasaron, contados: alguien los editó en el medio, o el número ya es de otro.
      const salteados = r.salteados ? ` ${r.salteados} no se ${r.salteados === 1 ? 'pasó' : 'pasaron'}: se ${r.salteados === 1 ? 'editó' : 'editaron'} en el medio o el número ya es de otro.` : '';
      showToast(listos + salteados, r.salteados ? 'warning' : 'success');
      await buscar();
    } catch (error) {
      showToast(!error?.response ? 'Sin conexión: no se pasó nada.' : errorService.getMessage(error), 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="llavero-pila">
      <span className="form-label">Llaveros que vinieron en el DNI</span>
      <p className="llavero-texto">
        Si el gimnasio venía de otro sistema (ControlFit, por ejemplo), puede haber socios con el
        número del llavero guardado en lugar del DNI. Ya entran con el llavero; pasarlo a llavero
        deja el DNI libre para corregirlo y permite darlo de baja si lo pierden. El DNI no se toca.
      </p>
      {!enLinea && <p className="llavero-texto">Hace falta internet para buscarlos.</p>}
      {enLinea && candidatos === null && (
        <div>
          <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={buscar}>
            {ocupado ? 'Buscando…' : 'Buscarlos'}
          </button>
        </div>
      )}
      {enLinea && candidatos?.length === 0 && (
        <p className="llavero-texto">No hay socios con un número de llavero en el DNI.</p>
      )}
      {enLinea && candidatos?.length > 0 && (
        <>
          <p className="llavero-aviso">
            <Icon name="alertTriangle" size="1.1em" />
            <span>
              Revisá la lista: un número largo también puede ser un documento extranjero (un CPF de
              Brasil tiene 11 dígitos). Destildá los que sean un documento de verdad.
            </span>
          </p>
          <div className="llavero-lista llavero-candidatos">
            {candidatos.map((c) => (
              <label key={c.socioId} className={`llavero-candidato${c.yaEsDe ? ' is-ocupado' : ''}`}>
                <input
                  type="checkbox" disabled={!!c.yaEsDe}
                  checked={elegidos.has(c.socioId)} onChange={() => alternar(c.socioId)}
                />
                <span>
                  <strong>{c.nombre}</strong> · <span className="llavero-codigo is-chico">{c.documento}</span>
                  {c.yaEsDe && <span className="llavero-item-detalle">Ya es el llavero de {c.yaEsDe}: no se pasa.</span>}
                </span>
              </label>
            ))}
          </div>
          <div>
            <button type="button" className="btn btn-primary" disabled={ocupado || elegidos.size === 0} onClick={pasar}>
              {elegidos.size === 1 ? 'Pasar 1 a llavero' : `Pasar ${elegidos.size} a llavero`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
