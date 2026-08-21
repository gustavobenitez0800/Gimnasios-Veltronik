// ============================================
// VELTRONIK - ¿QUIÉN ESTÁ EN EL TURNO?
// ============================================
// Lo primero que ve quien llega al mostrador: toca su nombre, marca 4 dígitos, trabaja.
// De ahí en más cada cobro y cada acceso queda firmado con esa persona.
//
// Bloquea la operación a propósito. Si fuera opcional nadie lo marcaría, los movimientos
// quedarían sin firma y la función no serviría para nada — que es exactamente lo que pasa
// con cualquier registro de turno que se puede saltear.
//
// PERO NO BLOQUEA SI NO HAY NADIE CARGADO. Un gimnasio que todavía no dio de alta a su
// gente tiene que poder trabajar igual: la firma es una mejora, no un peaje. Se empieza a
// pedir recién cuando el dueño carga la primera persona.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cashierService, errorService } from '../services';
import { getShift, setShift } from '../lib/shift';
import Icon from './Icon';

const PIN_LARGO = 4;

export default function ShiftGate() {
  const { user, orgName } = useAuth();

  const [personas, setPersonas] = useState(null); // null = todavía no sé
  const [turno, setTurnoLocal] = useState(() => getShift());
  const [elegida, setElegida] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);

  const hayOrg = !!localStorage.getItem('current_org_id');

  const cargar = useCallback(async () => {
    try {
      setPersonas(await cashierService.listActive());
    } catch {
      // Si no se puede consultar, no se traba el mostrador: se trabaja sin firma.
      setPersonas([]);
    }
  }, []);

  useEffect(() => {
    if (user && hayOrg && !turno) cargar();
  }, [user, hayOrg, turno, cargar]);

  // Escucha el pedido de cambiar de turno (lo dispara la barra lateral).
  useEffect(() => {
    const cambiar = () => { setTurnoLocal(null); setElegida(null); setPin(''); setError(''); };
    window.addEventListener('veltronik-cambiar-turno', cambiar);
    return () => window.removeEventListener('veltronik-cambiar-turno', cambiar);
  }, []);

  const confirmar = useCallback(async (pinCompleto) => {
    setVerificando(true);
    setError('');
    try {
      const abierto = await cashierService.startShift(elegida.id, pinCompleto);
      setShift(abierto.id, abierto.name);
      setTurnoLocal({ id: abierto.id, name: abierto.name });
      // Para que la barra lateral muestre el nombre nuevo sin recargar la pantalla.
      window.dispatchEvent(new Event('veltronik-turno-cambiado'));
    } catch (e) {
      setError(errorService.getMessage(e));
      setPin('');
    } finally {
      setVerificando(false);
    }
  }, [elegida]);

  // Con el cuarto dígito se confirma solo: en un mostrador, un botón "Aceptar" después de
  // marcar 4 números es un toque de más, repetido dos veces por día.
  useEffect(() => {
    if (pin.length === PIN_LARGO && elegida && !verificando) confirmar(pin);
  }, [pin, elegida, verificando, confirmar]);

  // ── Cuándo NO se dibuja nada ──
  // Sin sesión, sin sucursal elegida (login o activación del equipo), con turno abierto,
  // o cuando el gimnasio todavía no cargó a nadie.
  if (!user || !hayOrg || turno || personas === null || personas.length === 0) return null;

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'borrar'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'var(--bg-primary, #0a0a0a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        {!elegida ? (
          <>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.4rem' }}>¿Quién está atendiendo?</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {orgName || 'Mostrador'} · tocá tu nombre para empezar el turno
            </p>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {personas.map((p) => (
                <button
                  key={p.id}
                  className="btn btn-secondary"
                  style={{ padding: '1rem', fontSize: '1.05rem', justifyContent: 'flex-start', gap: '0.7rem' }}
                  onClick={() => { setElegida(p); setPin(''); setError(''); }}
                >
                  <Icon name="user" size="1.1em" /> {p.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              className="btn btn-ghost"
              style={{ marginBottom: '0.75rem' }}
              onClick={() => { setElegida(null); setPin(''); setError(''); }}
            >
              <Icon name="chevronLeft" size="1em" /> Cambiar de persona
            </button>

            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.3rem' }}>Hola, {elegida.name}</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Marcá tu PIN</p>

            {/* Los puntos: se ve cuántos dígitos van sin mostrar cuáles. */}
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {Array.from({ length: PIN_LARGO }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: i < pin.length ? 'var(--primary-400)' : 'transparent',
                    border: '2px solid var(--primary-400)',
                  }}
                />
              ))}
            </div>

            {error && (
              <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: 'var(--font-size-sm)' }}>{error}</p>
            )}
            {verificando && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}><span className="spinner" /></p>}

            {/* Teclado numérico propio: la pantalla del mostrador puede ser táctil, y en una
                tablet un input de texto abre el teclado del sistema y tapa media pantalla. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
              {teclas.map((t, i) => t === null ? <span key={i} /> : (
                <button
                  key={i}
                  className="btn btn-secondary"
                  style={{ padding: '1.1rem', fontSize: '1.3rem', fontWeight: 600 }}
                  disabled={verificando}
                  onClick={() => {
                    setError('');
                    if (t === 'borrar') setPin((p) => p.slice(0, -1));
                    else setPin((p) => (p.length < PIN_LARGO ? p + t : p));
                  }}
                >
                  {t === 'borrar' ? <Icon name="chevronLeft" size="1.1em" /> : t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
