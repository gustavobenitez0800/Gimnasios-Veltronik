// ============================================
// VELTRONIK SALON - DASHBOARD PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { salonStatsService, salonAppointmentService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';
import CONFIG from '../../lib/config';

const STATUS_LABELS = { confirmed: 'Confirmado', in_progress: 'En curso', completed: 'Completado', cancelled: 'Cancelado', no_show: 'No vino' };
const STATUS_BADGES = { confirmed: 'badge-primary', in_progress: 'badge-warning', completed: 'badge-success', cancelled: 'badge-error', no_show: 'badge-error' };

export default function SalonDashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [todayAppts, setTodayAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const [s, appts] = await Promise.all([
        salonStatsService.getDashboardStats(),
        salonAppointmentService.getByDate(today),
      ]);
      setStats(s);
      setTodayAppts(appts || []);
    } catch { showToast('Error al cargar dashboard', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando dashboard...</div>;

  const s = stats || {};

  return (
    <div className="salon-dashboard-page">
      <PageHeader title="Dashboard" subtitle="Resumen del día" icon="dashboard" />

      {/* Stats Grid */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.SALON_AGENDA)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-primary">📅</div>
          <div className="stat-content">
            <div className="stat-value">{s.todayAppointments || 0}</div>
            <div className="stat-label">Turnos Hoy</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.SALON_CASH)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-success">💰</div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(s.todayRevenue || 0)}</div>
            <div className="stat-label">Ingresos Hoy</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.SALON_CLIENTS)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-accent">👥</div>
          <div className="stat-content">
            <div className="stat-value">{s.totalClients || 0}</div>
            <div className="stat-label">Clientes Total</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.SALON_STYLISTS)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-warning">💇</div>
          <div className="stat-content">
            <div className="stat-value">{s.activeStylists || 0}</div>
            <div className="stat-label">Estilistas Activos</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>⚡ Acciones Rápidas</h3>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate(CONFIG.ROUTES.SALON_AGENDA)}>
            <Icon name="calendar" /> Ver Agenda
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(CONFIG.ROUTES.SALON_CLIENTS)}>
            <Icon name="users" /> Clientes
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(CONFIG.ROUTES.SALON_SERVICES)}>
            <Icon name="list" /> Servicios
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(CONFIG.ROUTES.SALON_CASH)}>
            <Icon name="wallet" /> Caja
          </button>
        </div>
      </div>

      {/* Today's Mini Stats */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>📊 Estado del Día</h3>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Confirmados', value: s.confirmedToday || 0, color: '#3b82f6' },
            { label: 'En curso', value: s.inProgressToday || 0, color: '#f59e0b' },
            { label: 'Completados', value: s.completedToday || 0, color: '#22c55e' },
            { label: 'Propinas', value: formatCurrency(s.todayTips || 0), color: '#8b5cf6' },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center', padding: '0.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1.3rem', color: m.color }}>{m.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Appointments Table */}
      <div className="card">
        <div className="table-header">
          <h3 style={{ margin: 0 }}>📅 Turnos de Hoy</h3>
          <span className="badge badge-primary">{todayAppts.length}</span>
        </div>
        <div className="table-container">
          {todayAppts.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '3rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>📅</div>
              No hay turnos agendados para hoy
            </div>
          ) : (
            <table className="table">
              <thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Estilista</th><th>Precio</th><th>Estado</th></tr></thead>
              <tbody>
                {todayAppts.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.start_time?.slice(0, 5)} - {a.end_time?.slice(0, 5)}</strong></td>
                    <td>{a.client?.full_name || '-'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.service?.color || '#0EA5E9' }} />
                        {a.service?.name || '-'}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.stylist?.color || '#8B5CF6' }} />
                        {a.stylist?.full_name || '-'}
                      </div>
                    </td>
                    <td>{formatCurrency(a.price || a.service?.price || 0)}</td>
                    <td><span className={`badge ${STATUS_BADGES[a.status] || 'badge-neutral'}`}>{STATUS_LABELS[a.status] || a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
