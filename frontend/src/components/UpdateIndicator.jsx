// ============================================
// VELTRONIK - INDICADOR DE ACTUALIZACIONES (Lobby)
// ============================================
// Muestra la versión actual y el estado del autoupdate de forma discreta y
// corporativa. El autoupdate ocurre solo; este indicador solo INFORMA y, cuando
// hay una versión descargada, ofrece "Actualizar ahora" (1 clic, sin cerrar la app).
// En la web (no-Electron) muestra solo la versión. Sin emojis.

import { useState, useEffect, useCallback } from 'react';
import Icon from './Icon';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

// Estados del indicador
const STATE = {
  IDLE: 'idle',            // al día
  AVAILABLE: 'available',  // hay update, descargando
  DOWNLOADING: 'downloading',
  READY: 'ready',          // descargada, lista para instalar
  ERROR: 'error',
};

export default function UpdateIndicator() {
  // Web: la versión ya se conoce en build-time (Vite define __APP_VERSION__) →
  // nace como estado inicial, sin pasar por un effect. Electron la resuelve
  // async (IPC) en el effect de abajo.
  const [version, setVersion] = useState(() =>
    !isElectron && typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
  );
  const [state, setState] = useState(STATE.IDLE);
  const [newVersion, setNewVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [restarting, setRestarting] = useState(false);

  // Carga inicial (solo Electron): versión + estado actual (por si ya había una descarga lista).
  useEffect(() => {
    if (!isElectron) return;
    let mounted = true;
    (async () => {
      try {
        const v = await window.electronAPI.getAppVersion();
        if (mounted) setVersion(v);
        const status = await window.electronAPI.getUpdateStatus?.();
        if (mounted && status?.updateDownloaded) {
          setState(STATE.READY);
          setNewVersion(status.downloadedVersion || '');
        }
      } catch { /* noop */ }
    })();
    return () => { mounted = false; };
  }, []);

  // Suscripción a los eventos del updater (solo Electron).
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.onUpdateAvailable?.((info) => {
      setState(STATE.DOWNLOADING);
      setNewVersion(info?.version || '');
    });
    window.electronAPI.onDownloadProgress?.((p) => {
      setState(STATE.DOWNLOADING);
      setProgress(Math.round(p?.percent || 0));
    });
    window.electronAPI.onUpdateDownloaded?.((info) => {
      setState(STATE.READY);
      setNewVersion(info?.version || '');
    });
    window.electronAPI.onUpdateError?.(() => setState(STATE.ERROR));
  }, []);

  const handleInstall = useCallback(async () => {
    setRestarting(true);
    try {
      await window.electronAPI.forceUpdateRestart?.();
    } catch {
      setRestarting(false);
    }
  }, []);

  // No renderizar nada si no hay versión que mostrar.
  if (!version && state === STATE.IDLE) return null;

  // ─── Estado: lista para instalar → banner de acción ───
  if (state === STATE.READY) {
    return (
      <div className="update-indicator update-indicator-ready" role="status">
        <span className="update-indicator-dot" />
        <div className="update-indicator-text">
          <span className="update-indicator-title">Actualización lista</span>
          <span className="update-indicator-sub">Versión {newVersion} disponible para instalar</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={handleInstall} disabled={restarting}>
          {restarting ? <><span className="spinner" /> Instalando</> : <><Icon name="rotateCw" size="0.9em" /> Actualizar ahora</>}
        </button>
      </div>
    );
  }

  // ─── Estado: descargando → barra de progreso (estilo Discord/Steam, sin tocar nada) ───
  if (state === STATE.DOWNLOADING) {
    return (
      <div className="update-indicator" role="status">
        <div className="update-indicator-text" style={{ width: '100%' }}>
          <span className="update-indicator-title">Actualizando Veltronik…</span>
          <span className="update-indicator-sub">Versión {newVersion} · {progress}%</span>
          <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary-500, #3b82f6)', borderRadius: 999, transition: 'width .2s ease' }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Estado: error ───
  if (state === STATE.ERROR) {
    return (
      <div className="update-indicator update-indicator-error" role="status">
        <Icon name="alertTriangle" size="0.9em" />
        <span className="update-indicator-sub">No se pudo verificar actualizaciones</span>
      </div>
    );
  }

  // ─── Estado: al día (solo versión) ───
  // Marca de agua: sin caja, sin ícono, casi transparente. Es un dato de soporte
  // ("¿qué versión tenés?"), no una notificación — no debería ganarle la atención a
  // nada de lo que hay en pantalla. Se aclara al pasarle el mouse por encima.
  return (
    <div className="update-indicator update-indicator-idle" role="status" title="Tu sistema está actualizado">
      <span className="update-indicator-sub">v{version}{isElectron ? ' · al día' : ''}</span>
    </div>
  );
}
