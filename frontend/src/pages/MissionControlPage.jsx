// ============================================
// VELTRONIK - MISSION CONTROL (V3, ladrillo 7)
// ============================================
// La consola del FUNDADOR sobre TODA la flota (cross-tenant): versión, última sync y
// anillo de cada equipo, + publicar la versión objetivo por anillo (rollout escalonado).
// Gateada por email de fundador en el backend.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { missionControlService } from '../services/MissionControlService';
import { timeAgo } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

const RINGS = [
  { ring: 0, label: 'Piloto', hint: 'tu local · lo sufrís vos primero' },
  { ring: 1, label: 'Amigos', hint: '~10% · clientes de confianza' },
  { ring: 2, label: 'Todos', hint: 'el resto de la flota' },
];

export default function MissionControlPage() {
  const { showToast } = useToast();
  const [isFounder, setIsFounder] = useState(null); // null = chequeando
  const [fleet, setFleet] = useState([]);
  const [rollout, setRollout] = useState({});
  const [inputs, setInputs] = useState({ 0: '', 1: '', 2: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const founder = await missionControlService.access();
      setIsFounder(founder);
      if (!founder) return;
      const [f, r] = await Promise.all([missionControlService.fleet(), missionControlService.rollout()]);
      setFleet(f);
      setRollout(r);
      setInputs({ 0: r['0'] || '', 1: r['1'] || '', 2: r['2'] || '' });
    } catch {
      setIsFounder(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const publish = async (ring) => {
    const v = (inputs[ring] || '').trim();
    if (!v) { showToast('Indicá la versión (ej: 2.7.0)', 'error'); return; }
    setBusy(true);
    try {
      await missionControlService.setRollout(ring, v);
      showToast(`Anillo ${RINGS[ring].label}: versión objetivo ${v} publicada`, 'success');
      await load();
    } catch (error) {
      showToast(error?.response?.data?.message || 'No se pudo publicar', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isFounder === null) {
    return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando…</div>;
  }
  if (!isFounder) {
    return (
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Icon name="lock" size="2rem" />
        <h2>Mission Control</h2>
        <p style={{ color: 'var(--text-muted)' }}>Esta consola es solo para el fundador.</p>
      </div>
    );
  }

  const ringLabel = (r) => (r == null ? 'Todos' : RINGS[r]?.label || String(r));

  return (
    <div style={{ padding: '1rem' }}>
      <PageHeader title="Mission Control" subtitle="La flota completa y el rollout por anillos" />

      {/* Rollout por anillos */}
      <div className="settings-section">
        <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="refresh" size="1.1em" /> Rollout — versión objetivo por anillo
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '1rem' }}>
          Publicá una versión anillo por anillo (Piloto → Amigos → Todos). Cada equipo solo se
          actualiza hasta la versión de su anillo. Anillo sin publicar = sin freno.
        </p>
        {RINGS.map(({ ring, label, hint }) => (
          <div key={ring} className="info-row" style={{ alignItems: 'center' }}>
            <span className="info-label" style={{ display: 'flex', flexDirection: 'column' }}>
              <strong>Anillo {ring} · {label}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>{hint}</span>
            </span>
            <span className="info-value" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                actual: {rollout[String(ring)] || '—'}
              </span>
              <input className="form-input" style={{ width: 110 }} placeholder="2.7.0"
                value={inputs[ring]} onChange={(e) => setInputs((s) => ({ ...s, [ring]: e.target.value }))} />
              <button className="btn-primary" disabled={busy} onClick={() => publish(ring)}>Publicar</button>
            </span>
          </div>
        ))}
      </div>

      {/* Flota */}
      <div className="settings-section">
        <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="monitor" size="1.1em" /> Flota ({fleet.length})
        </h2>
        {fleet.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>Todavía no hay equipos.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 8px' }}>Negocio</th>
                  <th style={{ padding: '6px 8px' }}>Equipo</th>
                  <th style={{ padding: '6px 8px' }}>Rol</th>
                  <th style={{ padding: '6px 8px' }}>Versión</th>
                  <th style={{ padding: '6px 8px' }}>Anillo</th>
                  <th style={{ padding: '6px 8px' }}>Última sync</th>
                  <th style={{ padding: '6px 8px' }}>Última señal</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)', opacity: d.status === 'REVOKED' ? 0.5 : 1 }}>
                    <td style={{ padding: '6px 8px' }}>{d.tenantName}</td>
                    <td style={{ padding: '6px 8px' }}>{d.displayName || `Equipo ${String(d.id).slice(0, 8)}`}</td>
                    <td style={{ padding: '6px 8px' }}>{d.role === 'ENCARGADO' ? 'Caja Madre' : d.role === 'CAJA' ? 'Caja' : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{d.lastAppVersion ? `v${d.lastAppVersion}` : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{ringLabel(d.updateRing)}</td>
                    <td style={{ padding: '6px 8px' }} title={d.lastSyncAt || ''}>{d.lastSyncAt ? timeAgo(d.lastSyncAt) : 'sin sync'}</td>
                    <td style={{ padding: '6px 8px' }} title={d.lastSeenAt || ''}>{timeAgo(d.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
