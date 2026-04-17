// ============================================
// VELTRONIK RESTAURANT - KITCHEN DISPLAY
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { orderService } from '../../services';
import { PageHeader } from '../../components/Layout';

export default function KitchenPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await orderService.getActive();
      setOrders((data || []).filter(o => ['pending', 'preparing', 'ready'].includes(o.status)));
    } catch { showToast('Error al cargar pedidos', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh cada 10 segundos
  useEffect(() => {
    const interval = setInterval(() => { loadData(); }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await orderService.update(orderId, { status: newStatus, ...(newStatus === 'ready' ? { served_at: new Date().toISOString() } : {}) });
      showToast(newStatus === 'preparing' ? '🔥 En preparación' : newStatus === 'ready' ? '✅ Listo para servir' : 'Estado actualizado', 'success');
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const pending = orders.filter(o => o.status === 'pending');
  const preparing = orders.filter(o => o.status === 'preparing');
  const ready = orders.filter(o => o.status === 'ready');

  const OrderCard = ({ order, actions }) => {
    const elapsed = Math.round((new Date() - new Date(order.created_at)) / 60000);
    const isUrgent = elapsed > 20;
    return (
      <div className={`kitchen-order-card ${isUrgent ? 'kitchen-urgent' : ''}`}>
        <div className="kitchen-order-header">
          <strong>#{order.order_number}</strong>
          <span className={`days-countdown ${elapsed > 30 ? 'days-danger' : elapsed > 15 ? 'days-warning' : 'days-ok'}`}>
            {elapsed} min
          </span>
        </div>
        <div className="kitchen-order-table">
          {order.table?.table_number ? `Mesa ${order.table.table_number}` :
            order.order_type === 'takeaway' ? '📦 Para llevar' : '🛵 Delivery'}
          {order.customer_name && ` · ${order.customer_name}`}
        </div>
        <div className="kitchen-order-items">
          {(order.items || []).map(item => (
            <div key={item.id} className="kitchen-item">
              <span className="kitchen-item-qty">{item.quantity}×</span>
              <span className="kitchen-item-name">{item.item_name || item.menu_item?.name || 'Ítem'}</span>
              {item.notes && <span className="kitchen-item-note">📝 {item.notes}</span>}
            </div>
          ))}
          {(!order.items || order.items.length === 0) && (
            <div className="text-muted" style={{ fontSize: '0.75rem', padding: '0.5rem 0' }}>Sin ítems</div>
          )}
        </div>
        <div className="kitchen-order-actions">{actions}</div>
      </div>
    );
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando cocina...</div>;

  return (
    <div className="kitchen-page">
      <PageHeader title="Pantalla de Cocina" subtitle={`${orders.length} pedidos activos · Auto-refresh cada 10s`} icon="fire" />

      <div className="kitchen-columns">
        {/* Pending */}
        <div className="kitchen-column">
          <div className="kitchen-column-header kitchen-col-pending">
            <h3>🔔 Nuevos</h3>
            <span className="badge badge-warning">{pending.length}</span>
          </div>
          <div className="kitchen-column-body">
            {pending.length === 0 ? (
              <div className="kitchen-empty">Sin pedidos nuevos</div>
            ) : pending.map(order => (
              <OrderCard key={order.id} order={order}
                actions={
                  <button className="btn btn-primary btn-sm" style={{ width: '100%' }}
                    onClick={() => handleStatusChange(order.id, 'preparing')}>🔥 Preparar</button>
                }
              />
            ))}
          </div>
        </div>

        {/* Preparing */}
        <div className="kitchen-column">
          <div className="kitchen-column-header kitchen-col-preparing">
            <h3>🔥 En Preparación</h3>
            <span className="badge badge-primary">{preparing.length}</span>
          </div>
          <div className="kitchen-column-body">
            {preparing.length === 0 ? (
              <div className="kitchen-empty">Nada en preparación</div>
            ) : preparing.map(order => (
              <OrderCard key={order.id} order={order}
                actions={
                  <button className="btn btn-success btn-sm" style={{ width: '100%' }}
                    onClick={() => handleStatusChange(order.id, 'ready')}>✅ Listo</button>
                }
              />
            ))}
          </div>
        </div>

        {/* Ready */}
        <div className="kitchen-column">
          <div className="kitchen-column-header kitchen-col-ready">
            <h3>✅ Listos</h3>
            <span className="badge badge-success">{ready.length}</span>
          </div>
          <div className="kitchen-column-body">
            {ready.length === 0 ? (
              <div className="kitchen-empty">Sin pedidos listos</div>
            ) : ready.map(order => (
              <OrderCard key={order.id} order={order}
                actions={
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%' }}
                    onClick={() => handleStatusChange(order.id, 'served')}>🍽️ Servido</button>
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
