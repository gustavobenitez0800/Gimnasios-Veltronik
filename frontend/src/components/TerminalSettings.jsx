// ============================================
// VELTRONIK - PREFERENCIAS DE ESTA COMPUTADORA (Fase 5)
// ============================================
// Ajustes → Este equipo. Lo que se configura acá es de la MÁQUINA, no de la cuenta: si
// arranca con Windows y qué pasa al cerrar la ventana. Viven en un JSON local, nunca
// viajan al servidor — el mismo dueño puede querer que el terminal del mostrador arranque
// solo y su notebook no.
//
// Solo se dibuja en la app de escritorio y solo si el puente de Electron está disponible:
// en el navegador no hay nada que configurar y un interruptor muerto es peor que ninguno.
// ============================================

import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';

/** Interruptor simple, con el texto explicando la consecuencia y no la mecánica. */
function Preferencia({ titulo, detalle, valor, onChange, disabled }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.9rem',
        padding: '0.85rem 0', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ marginTop: '0.2rem', width: '1.05rem', height: '1.05rem', flexShrink: 0, cursor: 'inherit' }}
      />
      <span>
        <span style={{ display: 'block', fontWeight: 600 }}>{titulo}</span>
        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '0.2rem', lineHeight: 1.5 }}>
          {detalle}
        </span>
      </span>
    </label>
  );
}

export default function TerminalSettings() {
  const { showToast } = useToast();
  const api = typeof window !== 'undefined' ? window.electronAPI?.terminalSettings : null;

  const [prefs, setPrefs] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.get().then(setPrefs).catch(() => setPrefs(null));
  }, [api]);

  // Sin puente de Electron (o versión vieja de la app sin estos canales) no hay sección.
  if (!api || !prefs) return null;

  const cambiar = async (cambios) => {
    const previo = prefs;
    setPrefs({ ...prefs, ...cambios }); // optimista: el interruptor responde al toque
    setGuardando(true);
    try {
      const res = await api.set(cambios);
      if (!res?.ok) throw new Error(res?.error || 'No se pudo guardar la preferencia.');
    } catch (error) {
      setPrefs(previo); // se revierte: el interruptor no puede mentir sobre el estado real
      showToast(error.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="monitor" size="1.1em" /> Esta computadora
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
        Ajustes de esta máquina en particular. No afectan a las demás computadoras del gimnasio.
      </p>

      <Preferencia
        titulo="Abrir Veltronik al encender la computadora"
        detalle="El sistema queda listo cuando llega el primero a abrir, sin que nadie tenga que acordarse de arrancarlo."
        valor={!!prefs.openAtLogin}
        onChange={(v) => cambiar({ openAtLogin: v })}
        disabled={guardando}
      />
    </div>
  );
}
