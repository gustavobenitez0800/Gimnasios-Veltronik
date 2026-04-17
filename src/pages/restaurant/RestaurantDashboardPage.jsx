// ============================================
// VELTRONIK RESTAURANT - DASHBOARD PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { restaurantStatsService, orderService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';
import CONFIG from '../../lib/config';

export default function RestaurantDashboardPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [s, orders] = await Promise.all([
        restaurantStatsService.getDashboardStats(),
        orderService.getActive(),
      ]);
      setStats(s);
      setActiveOrders(orders || []);
    } catch (err) {
      console.error('Dashboard error:', err);
      showToast('Error al cargar dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando dashboard...</div>;

  const s = stats || {};

  return (
    <div className="restaurant-dashboard">
      <PageHeader title="Dashboard" subtitle="Resumen del día" icon="dashboard" />

      {/* Stats Grid */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.ORDERS)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-primary">📋</div>
          <div className="stat-content">
            <div className="stat-value">{s.todayOrders || 0}</div>
            <div className="stat-label">Pedidos Hoy</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-success">💰</div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(s.todayRevenue || 0)}</div>
            <div className="stat-label">Ingresos del Día</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.TABLES)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-warning">🍽️</div>
          <div className="stat-content">
            <div className="stat-value">{s.tablesOccupied || 0} / {s.tablesTotal || 0}</div>
            <div className="stat-label">Mesas Ocupadas</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.KITCHEN)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>🔥</div>
          <div className="stat-content">
            <div className="stat-value">{s.activeOrders || 0}</div>
            <div className="stat-label">Pedidos Activos</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate(CONFIG.ROUTES.RESERVATIONS)} style={{ cursor: 'pointer' }}>
          <div className="stat-icon stat-icon-accent">📅</div>
          <div className="stat-content">
            <div className="stat-value">{s.todayReservations || 0}</div>
            <div className="stat-label">Reservas Hoy</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>⚡ Acciones Rápidas</h3>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate(CONFIG.ROUTES.ORDERS)}>
            <Icon name="clipboard" /> Nuevo Pedido
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(CONFIG.ROUTES.TABLES)}>
            <Icon name="grid" /> Ver Mesas
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(CONFIG.ROUTES.KITCHEN)}>
            <Icon name="fire" /> Cocina
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(CONFIG.ROUTES.RESERVATIONS)}>
            <Icon name="calendar" /> Reservas
          </button>
        </div>
      </div>

      {/* Active Orders */}
      <div className="card">
        <div className="table-header">
          <h3 style={{ margin: 0 }}>🔔 Pedidos Activos</h3>
          <span className="badge badge-primary">{activeOrders.length}</span>
        </div>
        <div className="table-container">
          {activeOrders.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '3rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>🍽️</div>
              No hay pedidos activos en este momento
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Mesa</th>
                  <th>Mesero</th>
                  <th>Ítems</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.slice(0, 10).map(order => {
                  const elapsed = Math.round((new Date() - new Date(order.created_at)) / 60000);
                  const statusLabels = { pending: 'Pendiente', preparing: 'Preparando', ready: 'Listo', served: 'Servido' };
                  const statusColors = { pending: 'badge-warning', preparing: 'badge-primary', ready: 'badge-success', served: 'badge-neutral' };
                  return (
                    <tr key={order.id}>
                      <td><strong>#{order.order_number}</strong></td>
                      <td>{order.table?.table_number || (order.order_type === 'takeaway' ? '📦 Para llevar' : '-')}</td>
                      <td>{order.waiter?.full_name || '-'}</td>
                      <td>{order.items?.length || 0} ítems</td>
                      <td><strong>{formatCurrency(order.total || 0)}</strong></td>
                      <td><span className={`badge ${statusColors[order.status] || 'badge-neutral'}`}>
                        {statusLabels[order.status] || order.status}
                      </span></td>
                      <td>
                        <span className={`days-countdown ${elapsed > 30 ? 'days-danger' : elapsed > 15 ? 'days-warning' : 'days-ok'}`}>
                          {elapsed} min
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
