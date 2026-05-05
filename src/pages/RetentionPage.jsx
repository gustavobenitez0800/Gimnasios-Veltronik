// ============================================
// VELTRONIK V2 - RETENTION PAGE (Optimized & Cached)
// ============================================

import { useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { dashboardStatsService } from '../services';
import { formatDate, getInitials } from '../lib/utils';
import { useQueryCache } from '../hooks';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

export default function RetentionPage() {
  const { showToast } = useToast();

  const fetchRetentionData = useCallback(async () => {
    return await dashboardStatsService.getRetentionAnalytics();
  }, []);

  const { data, loading, isFetching } = useQueryCache(
    'retention_analytics',
    fetchRetentionData,
    { staleTime: 5 * 60 * 1000 } // 5 min stale time
  );

  const analytics = data || {
    total_members: 0,
    active_members: 0,
    inactive_members: 0,
    retention_rate: 0,
    expiring_soon: [],
    at_risk: []
  };

  const openWhatsApp = (member) => {
    if (!member.phone) { showToast('Sin teléfono registrado', 'warning'); return; }
    const phone = member.phone.replace(/\D/g, '');
    const orgName = localStorage.getItem('current_org_name') || 'tu centro';
    const msg = encodeURIComponent(`¡Hola ${member.full_name.split(' ')[0]}! Te escribimos desde ${orgName}. Tu membresía está por vencer, ¿querés renovarla?`);
    window.open(`https://wa.me/54${phone}?text=${msg}`, '_blank');
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando análisis de retención...</div>;

  return (
    <div className="retention-page">
      <PageHeader 
        title="Retención de Socios" 
        subtitle={isFetching && data ? "Actualizando datos..." : "Análisis y seguimiento de membresías"} 
        icon="shield" 
      />

      {/* Stats */}
      <div className="stats-grid mb-3">
        <div className="stat-card">
          <div className="stat-icon stat-icon-success"><Icon name="users" /></div>
          <div className="stat-content">
            <div className="stat-value">{analytics.retention_rate}%</div>
            <div className="stat-label">Tasa de Retención</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">⚠️</div>
          <div className="stat-content">
            <div className="stat-value">{(analytics.expiring_soon || []).length}</div>
            <div className="stat-label">Vencen esta semana</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>📉</div>
          <div className="stat-content">
            <div className="stat-value">{(analytics.at_risk || []).length}</div>
            <div className="stat-label">En riesgo</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary"><Icon name="check" /></div>
          <div className="stat-content">
            <div className="stat-value">{analytics.active_members}</div>
            <div className="stat-label">Socios activos</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Expiring Soon */}
        <div className="card">
          <div className="table-header">
            <h3 style={{ margin: 0 }}>⏰ Vencen Pronto</h3>
            <span className="badge badge-warning">{(analytics.expiring_soon || []).length}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 1rem 1rem' }}>
            {(!analytics.expiring_soon || analytics.expiring_soon.length === 0) ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>No hay membresías por vencer esta semana 🎉</div>
            ) : analytics.expiring_soon.map(m => {
              const diff = Math.ceil((new Date(m.membership_end) - new Date()) / (1000 * 60 * 60 * 24));
              return (
                <div key={m.id} className="checked-in-item" style={{ marginBottom: '0.5rem', opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                  <div className="member-avatar" style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, var(--warning-500), #d97706)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                    {getInitials(m.full_name)}
                  </div>
                  <div className="member-info" style={{ flex: 1 }}>
                    <div className="member-name">{m.full_name}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Vence: {formatDate(m.membership_end)}</div>
                  </div>
                  <div className={`days-countdown ${diff <= 1 ? 'days-danger' : 'days-warning'}`}>{diff}d</div>
                  {m.phone && (
                    <button className="action-btn-quick action-btn-whatsapp" onClick={() => openWhatsApp(m)} title="WhatsApp">💬</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* At Risk */}
        <div className="card">
          <div className="table-header">
            <h3 style={{ margin: 0 }}>🔴 En Riesgo</h3>
            <span className="badge badge-error">{(analytics.at_risk || []).length}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 1rem 1rem' }}>
            {(!analytics.at_risk || analytics.at_risk.length === 0) ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>Todos los socios activos han pagado recientemente 👍</div>
            ) : analytics.at_risk.slice(0, 15).map(m => (
              <div key={m.id} className="checked-in-item" style={{ marginBottom: '0.5rem', opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                <div className="member-avatar" style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                  {getInitials(m.full_name)}
                </div>
                <div className="member-info" style={{ flex: 1 }}>
                  <div className="member-name">{m.full_name}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Sin pagos en 30+ días</div>
                </div>
                {m.phone && (
                  <button className="action-btn-quick action-btn-whatsapp" onClick={() => openWhatsApp(m)} title="WhatsApp">💬</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
