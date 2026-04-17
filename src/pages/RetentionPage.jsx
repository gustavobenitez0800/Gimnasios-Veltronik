// ============================================
// VELTRONIK V2 - RETENTION PAGE (Refactored)
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { memberService, paymentService } from '../services';
import { formatDate, getInitials } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';

export default function RetentionPage() {
  const { showToast } = useToast();
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [m, p] = await Promise.all([memberService.getAll(), paymentService.getAll()]);
      setMembers(m || []);
      setPayments(p || []);
    } catch { showToast('Error al cargar datos', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const analytics = useMemo(() => {
    const today = new Date();
    const active = members.filter(m => m.status === 'active');
    const inactive = members.filter(m => m.status === 'inactive');
    const expired = members.filter(m => {
      if (!m.membership_end) return false;
      return new Date(m.membership_end) < today;
    });

    // Expiring soon (next 7 days)
    const expiringSoon = members.filter(m => {
      if (!m.membership_end) return false;
      const end = new Date(m.membership_end);
      const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    }).sort((a, b) => new Date(a.membership_end) - new Date(b.membership_end));

    // At risk: not expired but haven't paid in 30+ days
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentPayers = new Set(
      payments.filter(p => new Date(p.payment_date) >= thirtyDaysAgo).map(p => p.member_id)
    );
    const atRisk = active.filter(m => !recentPayers.has(m.id));

    // Retention rate
    const retentionRate = members.length > 0
      ? Math.round((active.length / members.length) * 100)
      : 0;

    // Churn (inactive in last 30 days)
    const recentlyLost = inactive.filter(m => {
      if (!m.updated_at) return false;
      return new Date(m.updated_at) >= thirtyDaysAgo;
    });

    return { active, inactive, expired, expiringSoon, atRisk, retentionRate, recentlyLost };
  }, [members, payments]);

  const openWhatsApp = (member) => {
    if (!member.phone) { showToast('Sin teléfono registrado', 'warning'); return; }
    const phone = member.phone.replace(/\D/g, '');
    const msg = encodeURIComponent(`¡Hola ${member.full_name.split(' ')[0]}! Te escribimos desde el gimnasio. Tu membresía está por vencer, ¿querés renovarla?`);
    window.open(`https://wa.me/54${phone}?text=${msg}`, '_blank');
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando análisis de retención...</div>;

  return (
    <div className="retention-page">
      <PageHeader title="Retención de Socios" subtitle="Análisis y seguimiento de membresías" icon="shield" />

      {/* Stats */}
      <div className="stats-grid mb-3">
        <div className="stat-card">
          <div className="stat-icon stat-icon-success"><Icon name="users" /></div>
          <div className="stat-content">
            <div className="stat-value">{analytics.retentionRate}%</div>
            <div className="stat-label">Tasa de Retención</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">⚠️</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.expiringSoon.length}</div>
            <div className="stat-label">Vencen esta semana</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>📉</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.atRisk.length}</div>
            <div className="stat-label">En riesgo</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary"><Icon name="check" /></div>
          <div className="stat-content">
            <div className="stat-value">{analytics.active.length}</div>
            <div className="stat-label">Socios activos</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Expiring Soon */}
        <div className="card">
          <div className="table-header">
            <h3 style={{ margin: 0 }}>⏰ Vencen Pronto</h3>
            <span className="badge badge-warning">{analytics.expiringSoon.length}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 1rem 1rem' }}>
            {analytics.expiringSoon.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>No hay membresías por vencer esta semana 🎉</div>
            ) : analytics.expiringSoon.map(m => {
              const diff = Math.ceil((new Date(m.membership_end) - new Date()) / (1000 * 60 * 60 * 24));
              return (
                <div key={m.id} className="checked-in-item" style={{ marginBottom: '0.5rem' }}>
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
            <span className="badge badge-error">{analytics.atRisk.length}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 1rem 1rem' }}>
            {analytics.atRisk.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '2rem' }}>Todos los socios activos han pagado recientemente 👍</div>
            ) : analytics.atRisk.slice(0, 15).map(m => (
              <div key={m.id} className="checked-in-item" style={{ marginBottom: '0.5rem' }}>
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
