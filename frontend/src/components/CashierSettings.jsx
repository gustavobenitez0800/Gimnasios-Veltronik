// ============================================
// VELTRONIK - PERSONAS DEL MOSTRADOR (Ajustes)
// ============================================
// Donde el dueño carga a su gente. Cada una es un nombre y 4 dígitos — nada más: no tienen
// cuenta, no tienen email, no inician sesión.
//
// A partir de la primera que cargues, el mostrador va a pedir el PIN al empezar el turno, y
// cada cobro y cada acceso van a quedar firmados con quién los hizo. Antes de eso, todo
// sigue funcionando como siempre y sin firma: la trazabilidad se activa cuando vos querés,
// no te la imponemos el día que actualizás.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { cashierService, errorService } from '../services';
import Icon from './Icon';

export default function CashierSettings() {
  const { showToast } = useToast();

  const [personas, setPersonas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cambiandoPin, setCambiandoPin] = useState(null); // id de a quien se le cambia
  const [pinNuevo, setPinNuevo] = useState('');

  const cargar = useCallback(async () => {
    try {
      setPersonas(await cashierService.list());
    } catch {
      setPersonas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const agregar = async () => {
    setGuardando(true);
    try {
      await cashierService.create(nombre.trim(), pin);
      showToast(`${nombre.trim()} ya puede marcar turno`, 'success');
      setNombre('');
      setPin('');
      await cargar();
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const guardarPin = async (persona) => {
    try {
      await cashierService.changePin(persona.id, pinNuevo);
      showToast(`PIN de ${persona.name} actualizado`, 'success');
      setCambiandoPin(null);
      setPinNuevo('');
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    }
  };

  const cambiarEstado = async (persona) => {
    try {
      await cashierService.setActive(persona.id, !persona.active);
      showToast(persona.active ? `${persona.name} ya no puede marcar turno` : `${persona.name} vuelve al mostrador`, 'success');
      await cargar();
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    }
  };

  if (cargando) return null;

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="users" size="1.1em" /> Personas del mostrador
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Quién atiende, con un PIN de 4 números. No necesitan cuenta ni email: la sesión es de la
        computadora, el PIN solo dice quién está en el turno. Desde que cargues a la primera, cada
        cobro y cada acceso van a quedar firmados con su nombre.
      </p>

      <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
        <input
          type="text" className="form-input" placeholder="Nombre"
          value={nombre} onChange={(e) => setNombre(e.target.value)}
          style={{ flex: 1, minWidth: 160 }} disabled={guardando}
        />
        <input
          type="text" inputMode="numeric" maxLength={4} className="form-input" placeholder="PIN (4 números)"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={{ width: 150 }} disabled={guardando}
        />
        <button
          className="btn btn-primary"
          onClick={agregar}
          disabled={guardando || !nombre.trim() || pin.length !== 4}
        >
          {guardando ? <span className="spinner" /> : <><Icon name="plus" size="1em" /> Agregar</>}
        </button>
      </div>

      {personas.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Todavía no cargaste a nadie. Mientras tanto el mostrador funciona igual, pero los
          movimientos quedan sin firma.
        </p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Nombre</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                  <td data-label="Nombre">{p.name}</td>
                  <td data-label="Estado">
                    <span className={`badge ${p.active ? 'badge-success' : 'badge-neutral'}`}>
                      {p.active ? 'Activa' : 'Dada de baja'}
                    </span>
                  </td>
                  <td data-label="Acciones">
                    {cambiandoPin === p.id ? (
                      <div className="flex gap-1" style={{ alignItems: 'center' }}>
                        <input
                          type="text" inputMode="numeric" maxLength={4} className="form-input"
                          placeholder="PIN nuevo" value={pinNuevo} autoFocus
                          onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          style={{ width: 120 }}
                        />
                        <button className="btn btn-primary btn-sm" disabled={pinNuevo.length !== 4} onClick={() => guardarPin(p)}>
                          Guardar
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setCambiandoPin(null); setPinNuevo(''); }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="table-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setCambiandoPin(p.id); setPinNuevo(''); }}
                          title="Cambiar PIN"
                        >
                          Cambiar PIN
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstado(p)}>
                          {p.active ? 'Dar de baja' : 'Reactivar'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem', lineHeight: 1.5 }}>
        Dar de baja no borra a nadie: sus movimientos viejos siguen diciendo que fueron suyos.
        Y el PIN no se puede consultar — si alguien lo olvida, se le pone uno nuevo.
      </p>
    </div>
  );
}
