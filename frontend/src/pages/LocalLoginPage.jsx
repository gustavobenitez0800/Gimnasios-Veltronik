// ============================================
// VELTRONIK - LOGIN LOCAL POR PIN (V3, ladrillo 6)
// ============================================
// El cajero entra a la caja con su PIN, sin Google ni internet. Teclado numérico
// grande, pensado para pantalla táctil de mostrador.

import { useState } from 'react';
import { localAuthService } from '../services/LocalAuthService';
import { setLocalSession } from '../lib/localSession';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
const MAX_PIN = 6;

export default function LocalLoginPage({ onLoggedIn }) {
  const { showToast } = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const press = (key) => {
    if (busy) return;
    if (key === 'clear') return setPin('');
    if (key === 'back') return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length < MAX_PIN ? p + key : p));
  };

  const submit = async () => {
    if (pin.length < 4) {
      showToast('El PIN tiene entre 4 y 6 dígitos', 'error');
      return;
    }
    setBusy(true);
    try {
      const { token, cashier } = await localAuthService.login(pin);
      setLocalSession({ token, cashier });
      showToast(`Hola, ${cashier?.name || 'cajero'}`, 'success');
      onLoggedIn?.();
    } catch (error) {
      setPin('');
      const msg = error?.response?.data?.message || 'PIN incorrecto';
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
      background: 'var(--bg, #0b1220)', padding: '1.5rem',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <img src={logoSrc} alt="Veltronik" style={{ width: 56, height: 56, borderRadius: 12 }} />
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Ingresá tu PIN</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="wifiOff" size="1em" /> Caja local — funciona sin internet
        </p>
      </div>

      {/* Puntos del PIN */}
      <div style={{ display: 'flex', gap: 12, height: 22 }}>
        {Array.from({ length: MAX_PIN }).map((_, i) => (
          <span key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < pin.length ? 'var(--primary-500)' : 'transparent',
            border: '2px solid var(--primary-500)', opacity: i < pin.length ? 1 : 0.35,
          }} />
        ))}
      </div>

      {/* Teclado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 84px)', gap: 12 }}>
        {KEYS.map((k) => (
          <button key={k} onClick={() => press(k)} disabled={busy}
            style={{
              height: 84, fontSize: k.length === 1 ? '1.6rem' : '0.85rem', fontWeight: 600,
              borderRadius: 16, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer',
            }}>
            {k === 'back' ? '⌫' : k === 'clear' ? 'Borrar' : k}
          </button>
        ))}
      </div>

      <button className="btn-primary" onClick={submit} disabled={busy || pin.length < 4}
        style={{ width: 276, height: 52, fontSize: '1.05rem', borderRadius: 14 }}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </div>
  );
}
