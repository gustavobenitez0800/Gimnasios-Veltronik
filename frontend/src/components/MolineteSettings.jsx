// ============================================
// VELTRONIK - MOLINETE FACIAL
// ============================================
// Ajustes → Molinete. La IP y la clave son de ESTA computadora: es la única que le llega al
// equipo, porque vive en la red local del gimnasio y el fabricante avisa que un solo programa
// puede manejarlo.
//
// Solo se dibuja en la app de escritorio y solo si el puente de Electron trae los canales del
// molinete: en el navegador no hay forma de hablarle al aparato, y un panel muerto es peor
// que ninguno.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { molineteService } from '../services';
import Icon from '../components/Icon';

/** Cada cuánto se le refresca la lista al equipo mientras la app está abierta. */
const CADA_MINUTOS = 5;

export default function MolineteSettings() {
  const { showToast } = useToast();
  const api = typeof window !== 'undefined' ? window.electronAPI?.molinete : null;

  const [cfg, setCfg] = useState(null);
  const [equipo, setEquipo] = useState(null);
  const [probando, setProbando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [ultima, setUltima] = useState(null);

  useEffect(() => {
    if (!api) return;
    api.getConfig().then(setCfg).catch(() => setCfg(null));
  }, [api]);

  useEffect(() => {
    if (!api?.onProgreso) return undefined;
    return api.onProgreso(setProgreso);
  }, [api]);

  const guardar = async (cambios) => {
    const res = await api.setConfig(cambios);
    if (res?.ok) setCfg(res.config);
  };

  const probar = async () => {
    setProbando(true);
    setEquipo(null);
    try {
      const r = await api.probar();
      setEquipo(r);
      if (!r.ok) showToast(r.error, 'error');
    } finally {
      setProbando(false);
    }
  };

  /**
   * Baja el padrón y se lo aplica al equipo.
   *
   * <p>Las dos mitades están separadas a propósito: si el backend no contesta, no se toca el
   * equipo. Sincronizar contra una lista incompleta sería peor que no sincronizar — puede
   * terminar cerrándole el horario a socios que están al día.</p>
   */
  const sincronizar = useCallback(async (silencioso = false) => {
    if (!api) return;
    setSincronizando(true);
    setProgreso(null);
    try {
      const padron = await molineteService.getPadron();
      const r = await api.sincronizar(padron);
      setUltima(r);
      if (!r.ok) {
        if (!silencioso) showToast(r.error, 'error');
      } else if (r.bajasFrenadas) {
        showToast(
          `Se frenaron ${r.bajasFrenadas} bajas: son demasiadas de una vez. Revisá el padrón antes de borrar caras.`,
          'error');
      } else if (!silencioso) {
        showToast(`Molinete al día: ${r.total} socios.`, 'success');
      }
    } catch (e) {
      setUltima({ ok: false, error: e.message });
      if (!silencioso) showToast(`No se pudo traer el padrón: ${e.message}`, 'error');
    } finally {
      setSincronizando(false);
      setProgreso(null);
    }
  }, [api, showToast]);

  // Mientras la app esté abierta, la lista se mantiene sola. Sin esto, un socio que paga a
  // las 9 seguiría rebotando contra el molinete hasta que alguien se acuerde de sincronizar.
  useEffect(() => {
    if (!api || !cfg?.activo || !cfg?.ip) return undefined;
    const t = setInterval(() => sincronizar(true), CADA_MINUTOS * 60 * 1000);
    return () => clearInterval(t);
  }, [api, cfg?.activo, cfg?.ip, sincronizar]);

  if (!api || !cfg) return null;

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="shield" size="1.1em" /> Molinete
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '1rem', lineHeight: 1.5 }}>
        El equipo de reconocimiento facial de la entrada. Esta computadora es la que le mantiene
        la lista de socios al día, así que tiene que estar en la misma red que él.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 12rem' }}>
          <label className="form-label" htmlFor="molinete-ip">Dirección del equipo</label>
          <input
            id="molinete-ip"
            className="form-input"
            value={cfg.ip}
            placeholder="192.168.1.50"
            onChange={(e) => setCfg({ ...cfg, ip: e.target.value })}
            onBlur={(e) => guardar({ ip: e.target.value })}
          />
        </div>
        <div style={{ flex: '1 1 9rem' }}>
          <label className="form-label" htmlFor="molinete-clave">Clave del equipo</label>
          <input
            id="molinete-clave"
            className="form-input"
            type="password"
            value={cfg.clave}
            onChange={(e) => setCfg({ ...cfg, clave: e.target.value })}
            onBlur={(e) => guardar({ clave: e.target.value })}
          />
        </div>
        <button className="btn btn-secondary" onClick={probar} disabled={probando || !cfg.ip}>
          {probando ? 'Probando...' : 'Probar conexión'}
        </button>
      </div>

      {equipo?.ok && (
        <p style={{ marginTop: '0.75rem', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
          Contesta. Serie {equipo.serie}
          {equipo.sinClave
            ? ' — falta la clave para poder cargarle socios.'
            : ` · ${equipo.personas} socios cargados, ${equipo.caras} con la cara tomada.`}
        </p>
      )}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', padding: '1rem 0', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!cfg.activo}
          onChange={(e) => guardar({ activo: e.target.checked })}
          style={{ marginTop: '0.2rem', width: '1.05rem', height: '1.05rem', flexShrink: 0 }}
        />
        <span>
          <span style={{ display: 'block', fontWeight: 600 }}>Mantener la lista al día sola</span>
          <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '0.2rem', lineHeight: 1.5 }}>
            Cada {CADA_MINUTOS} minutos, mientras Veltronik esté abierto en esta computadora. Sin
            esto, el socio que paga a la mañana sigue rebotando contra el molinete hasta que
            alguien sincronice a mano.
          </span>
        </span>
      </label>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => sincronizar(false)} disabled={sincronizando || !cfg.ip || !cfg.clave}>
          {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
        {progreso && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            {progreso.hecho} de {progreso.total}
          </span>
        )}
      </div>

      {ultima && (
        <p style={{ marginTop: '0.75rem', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {ultima.ok
            ? `Última sincronización: ${ultima.total} socios · ${ultima.creados} nuevos · ${ultima.horarios} cambios de habilitación${ultima.borrados ? ` · ${ultima.borrados} dados de baja` : ''}${ultima.errores?.length ? ` · ${ultima.errores.length} con error` : ''}.`
            : `Última sincronización: ${ultima.error}`}
        </p>
      )}

      <p style={{ marginTop: '1rem', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Sincronizar carga a los socios en el equipo, pero <strong>sin la cara</strong>: el
        molinete todavía no los reconoce. La foto se toma una vez por socio, desde su ficha, con
        la persona parada frente al equipo. La cara queda adentro del molinete y nunca pasa por
        Veltronik.
      </p>
    </div>
  );
}
