// ============================================
// VELTRONIK SALON - CASH REGISTER PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { salonSaleService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';

export default function SalonCashPage() {
  const { showToast } = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const loadData = useCallback(async () => {
    try { setLoading(true); setSales((await salonSaleService.getByRange(startDate, endDate)) || []); }
    catch { showToast('Error al cargar ventas', 'error'); }
    finally { setLoading(false); }
  }, [showToast, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Aggregations
  const total = sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const tips = sales.reduce((sum, s) => sum + (parseFloat(s.tip) || 0), 0);
  const byCash = sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const byCard = sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const byTransfer = sales.filter(s => s.payment_method === 'transfer').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const byMP = sales.filter(s => s.payment_method === 'mercadopago').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

  const PAYMENT_LABELS = { cash: '💵 Efectivo', card: '💳 Tarjeta', transfer: '🏦 Transferencia', mercadopago: '📱 MercadoPago' };

  return (
    <div className="salon-cash-page">
      <PageHeader title="Caja" subtitle="Resumen de cobros" icon="wallet" />

      {/* Date Range */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="flex items-center gap-1">
            <label className="form-label" style={{ margin: 0 }}>Desde:</label>
            <input type="date" className="form-input" style={{ maxWidth: 170 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
            <label className="form-label" style={{ margin: 0 }}>Hasta:</label>
            <input type="date" className="form-input" style={{ maxWidth: 170 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <span className="text-muted">{sales.length} cobros</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-success">💰</div>
          <div className="stat-content"><div className="stat-value">{formatCurrency(total)}</div><div className="stat-label">Total Cobrado</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">🪙</div>
          <div className="stat-content"><div className="stat-value">{formatCurrency(tips)}</div><div className="stat-label">Propinas</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary">🧾</div>
          <div className="stat-content"><div className="stat-value">{sales.length}</div><div className="stat-label">Cobros</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-accent">📊</div>
          <div className="stat-content"><div className="stat-value">{sales.length > 0 ? formatCurrency(total / sales.length) : '$0'}</div><div className="stat-label">Ticket Promedio</div></div>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>💳 Desglose por Método de Pago</h4>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Efectivo', value: byCash, icon: '💵' },
            { label: 'Tarjeta', value: byCard, icon: '💳' },
            { label: 'Transferencia', value: byTransfer, icon: '🏦' },
            { label: 'MercadoPago', value: byMP, icon: '📱' },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center', padding: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{m.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatCurrency(m.value)}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sales Table */}
      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> : (
        <div className="card"><div className="table-container">
          <table className="table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Estilista</th><th>Servicios</th><th>Total</th><th>Propina</th><th>Método</th></tr></thead>
            <tbody>{sales.length === 0 ? <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>Sin cobros en este período</td></tr> :
              sales.map(s => (
                <tr key={s.id}>
                  <td>{new Date(s.sale_date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{s.client?.full_name || '-'}</td>
                  <td>{s.stylist?.full_name || '-'}</td>
                  <td>
                    {(s.items || []).map((item, i) => <span key={i} className="badge badge-neutral" style={{ fontSize: '0.65rem', marginRight: 4 }}>{item.name}</span>)}
                    {(!s.items || s.items.length === 0) && '-'}
                  </td>
                  <td><strong>{formatCurrency(s.total)}</strong></td>
                  <td>{parseFloat(s.tip) > 0 ? formatCurrency(s.tip) : '-'}</td>
                  <td>{PAYMENT_LABELS[s.payment_method] || s.payment_method}</td>
                </tr>
              ))}</tbody></table>
        </div></div>
      )}
    </div>
  );
}
