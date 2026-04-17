// ============================================
// VELTRONIK RESTAURANT - REPORTS PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { orderService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';

export default function RestaurantReportsPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try { setLoading(true); setOrders((await orderService.getAll()) || []); }
    catch { showToast('Error al cargar reportes', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const paid = orders.filter(o => o.status === 'paid');
  const totalRevenue = paid.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const totalTips = paid.reduce((s, o) => s + parseFloat(o.tip || 0), 0);
  const avgTicket = paid.length > 0 ? totalRevenue / paid.length : 0;

  const byMethod = paid.reduce((acc, o) => {
    const m = o.payment_method || 'other';
    acc[m] = (acc[m] || 0) + parseFloat(o.total || 0);
    return acc;
  }, {});

  const methodLabels = { cash: '💵 Efectivo', card: '💳 Tarjeta', transfer: '🏦 Transferencia', mercadopago: '📱 MercadoPago', mixed: '🔄 Mixto' };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando reportes...</div>;

  return (
    <div className="restaurant-reports">
      <PageHeader title="Reportes" subtitle="Análisis de ventas" icon="chart" />

      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon stat-icon-success">💰</div>
          <div className="stat-content"><div className="stat-value">{formatCurrency(totalRevenue)}</div><div className="stat-label">Ingresos Totales</div></div></div>
        <div className="stat-card"><div className="stat-icon stat-icon-primary">📋</div>
          <div className="stat-content"><div className="stat-value">{paid.length}</div><div className="stat-label">Pedidos Cobrados</div></div></div>
        <div className="stat-card"><div className="stat-icon stat-icon-warning">🎫</div>
          <div className="stat-content"><div className="stat-value">{formatCurrency(avgTicket)}</div><div className="stat-label">Ticket Promedio</div></div></div>
        <div className="stat-card"><div className="stat-icon stat-icon-accent">💝</div>
          <div className="stat-content"><div className="stat-value">{formatCurrency(totalTips)}</div><div className="stat-label">Propinas</div></div></div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="table-header"><h3 style={{margin:0}}>💳 Ingresos por Método de Pago</h3></div>
          <div style={{padding:'0 1rem 1rem'}}>
            {Object.entries(byMethod).length === 0 ? <p className="text-muted text-center" style={{padding:'2rem'}}>Sin datos</p> :
              Object.entries(byMethod).sort((a,b) => b[1]-a[1]).map(([method, amount]) => (
                <div key={method} className="payment-history-item">
                  <span>{methodLabels[method] || method}</span>
                  <strong>{formatCurrency(amount)}</strong>
                </div>
              ))
            }
          </div>
        </div>

        <div className="card">
          <div className="table-header"><h3 style={{margin:0}}>📊 Pedidos Recientes</h3></div>
          <div style={{maxHeight:400,overflowY:'auto',padding:'0 1rem 1rem'}}>
            {paid.slice(0,15).map(o => (
              <div key={o.id} className="payment-history-item">
                <div><strong>#{o.order_number}</strong><div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>
                  {o.table?.table_number ? `Mesa ${o.table.table_number}` : o.order_type} · {new Date(o.created_at).toLocaleDateString('es-AR')}</div></div>
                <strong>{formatCurrency(o.total||0)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
