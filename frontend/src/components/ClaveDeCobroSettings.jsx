import { useState } from 'react';
import { claveDeCobroService, errorService } from '../services';
import { useClaveDeCobro } from '../contexts/ClaveDeCobroContext';
import Icon from './Icon';

/** Solo números, hasta 8: lo mismo que acepta el servidor. */
const soloNumeros = (v) => v.replace(/\D/g, '').slice(0, 8);

/**
 * Ajustes → Clave para cobrar (dueño o admin). Opcional (08/11/2026).
 *
 * <p>Lo pidió un gimnasio: «a veces los socios se renuevan solos la cuota». Con la clave puesta,
 * el mostrador la pide para registrar un cobro, para editarlo o anularlo y para cambiar a mano el
 * vencimiento de un socio. Para cambiarla o sacarla hay que saber la actual: la sesión del
 * mostrador suele ser la del dueño, y el que se renueva solo la cuota no puede poder borrarla.</p>
 */
export default function ClaveDeCobroSettings() {
  const { activa, alCambiar } = useClaveDeCobro();
  // null = mirando · 'poner' · 'cambiar' · 'sacar'
  const [modo, setModo] = useState(null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = (m) => {
    setModo(m);
    setActual('');
    setNueva('');
    setRepetida('');
    setError('');
    setAviso('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (modo !== 'sacar') {
      if (nueva.length < 4) return setError('La clave tiene que ser de 4 a 8 números.');
      if (nueva !== repetida) return setError('Las dos claves nuevas no coinciden.');
    }
    setGuardando(true);
    try {
      if (modo === 'sacar') {
        await claveDeCobroService.sacar(actual);
        await alCambiar(false);
        setAviso('Listo: ya no se pide clave para cobrar.');
      } else {
        await claveDeCobroService.fijar(nueva, modo === 'cambiar' ? actual : null);
        await alCambiar(true, nueva);
        setAviso(modo === 'cambiar' ? 'Listo: la clave cambió.' : 'Listo: desde ahora se pide la clave para cobrar.');
      }
      setModo(null);
    } catch (err) {
      setError(!err?.response ? 'Sin conexión: la clave se cambia con internet.' : errorService.getMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const campo = (id, etiqueta, valor, setValor) => (
    <div>
      <label className="form-label" htmlFor={id}>{etiqueta}</label>
      <input id={id} type="password" inputMode="numeric" autoComplete="new-password" className="form-input"
        value={valor} onChange={(e) => setValor(soloNumeros(e.target.value))} />
    </div>
  );

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="lock" size="1.1em" /> Clave para cobrar
      </h2>
      <div className="ajuste-pila">
        <p className="ajuste-nota">
          Opcional. Con la clave puesta, la computadora del mostrador la pide para registrar un cobro,
          para editarlo o anularlo, y para cambiar a mano el vencimiento de un socio. Sirve para que
          nadie se renueve la cuota solo. Para cambiarla o sacarla hay que saber la actual.
        </p>
        <p className={`ajuste-estado ${activa ? 'is-ok' : ''}`}>
          {activa ? 'Está puesta: se pide para cobrar.' : 'No está puesta: se cobra sin clave.'}
        </p>
        {aviso && <p className="ajuste-estado is-ok" role="status">{aviso}</p>}

        {!modo && (
          <div className="ajuste-fila">
            {!activa && <button type="button" className="btn btn-primary" onClick={() => abrir('poner')}>Poner una clave</button>}
            {activa && <button type="button" className="btn btn-secondary" onClick={() => abrir('cambiar')}>Cambiar la clave</button>}
            {activa && <button type="button" className="btn btn-secondary" onClick={() => abrir('sacar')}>Sacar la clave</button>}
          </div>
        )}

        {modo && (
          <form className="ajuste-pila" onSubmit={guardar} noValidate>
            {modo !== 'poner' && campo('clave-actual', 'La clave actual', actual, setActual)}
            {modo !== 'sacar' && campo('clave-nueva', 'La clave nueva (de 4 a 8 números)', nueva, setNueva)}
            {modo !== 'sacar' && campo('clave-repetida', 'Repetila', repetida, setRepetida)}
            {error && <p className="ajuste-estado is-mal" role="alert">{error}</p>}
            <div className="ajuste-fila">
              <button type="submit" className="btn btn-primary" disabled={guardando}>
                {modo === 'sacar' ? 'Sacar la clave' : 'Guardar la clave'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setModo(null)} disabled={guardando}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
