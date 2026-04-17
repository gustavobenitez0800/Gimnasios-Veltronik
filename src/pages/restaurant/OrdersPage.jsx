// ============================================
// VELTRONIK RESTAURANT - ORDERS PAGE
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { orderService, tableService, menuService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';

const STATUS_LABELS = { pending: 'Pendiente', preparing: 'Preparando', ready: 'Listo', served: 'Servido', paid: 'Pagado', cancelled: 'Cancelado' };
const STATUS_BADGE = { pending: 'badge-warning', preparing: 'badge-primary', ready: 'badge-success', served: 'badge-neutral', paid: 'badge-success', cancelled: 'badge-error' };

export default function OrdersPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');

  // New order
  const [newOrderModal, setNewOrderModal] = useState(false);
  const [orderType, setOrderType] = useState('dine_in');
  const [selectedTable, setSelectedTable] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCount, setCustomerCount] = useState(1);

  // Add items modal
  const [addItemsModal, setAddItemsModal] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [currentOrderItems, setCurrentOrderItems] = useState([]);
  const [menuSearch, setMenuSearch] = useState('');

  // Close order
  const [closeModal, setCloseModal] = useState(false);
  const [closeOrderId, setCloseOrderId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [tipAmount, setTipAmount] = useState(0);

  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [o, t, m] = await Promise.all([
        tab === 'active' ? orderService.getActive() : orderService.getAll(),
        tableService.getAll(),
        menuService.getItems(),
      ]);
      setOrders(o || []);
      setTables(t || []);
      setMenuItems(m || []);
    } catch { showToast('Error al cargar pedidos', 'error'); }
    finally { setLoading(false); }
  }, [showToast, tab]);

  useEffect(() => { loadData(); }, [loadData]);

  const availableTables = tables.filter(t => t.status === 'available');

  const handleCreateOrder = async () => {
    if (orderType === 'dine_in' && !selectedTable) { showToast('Seleccioná una mesa', 'error'); return; }
    setCreating(true);
    try {
      const order = await orderService.create({
        table_id: orderType === 'dine_in' ? selectedTable : null,
        order_type: orderType,
        customer_name: customerName || null,
        customer_count: parseInt(customerCount) || 1,
      });
      showToast('Pedido creado', 'success');
      setNewOrderModal(false);
      setSelectedTable('');
      setCustomerName('');
      setCustomerCount(1);
      // Open add items immediately
      setCurrentOrderId(order.id);
      setCurrentOrderItems([]);
      setAddItemsModal(true);
      loadData();
    } catch (err) {
      showToast(err.message || 'Error al crear pedido', 'error');
    } finally { setCreating(false); }
  };

  const openAddItems = async (orderId) => {
    setCurrentOrderId(orderId);
    try {
      const items = await orderService.getItems(orderId);
      setCurrentOrderItems(items || []);
    } catch { setCurrentOrderItems([]); }
    setMenuSearch('');
    setAddItemsModal(true);
  };

  const handleAddItem = async (menuItem) => {
    try {
      await orderService.addItem(currentOrderId, {
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        unit_price: menuItem.price,
        quantity: 1,
      });
      const items = await orderService.getItems(currentOrderId);
      setCurrentOrderItems(items || []);
      loadData();
      showToast(`${menuItem.name} agregado`, 'success');
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await orderService.removeItem(itemId, currentOrderId);
      const items = await orderService.getItems(currentOrderId);
      setCurrentOrderItems(items || []);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await orderService.update(orderId, { status: newStatus });
      showToast('Estado actualizado', 'success');
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const handleCloseOrder = async () => {
    if (!closeOrderId) return;
    try {
      await orderService.close(closeOrderId, paymentMethod, parseFloat(tipAmount) || 0);
      showToast('Pedido cobrado 💰', 'success');
      setCloseModal(false);
      setCloseOrderId(null);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const openCloseModal = (order) => {
    setCloseOrderId(order.id);
    setPaymentMethod('cash');
    setTipAmount(0);
    setCloseModal(true);
  };

  const filteredMenu = menuSearch
    ? menuItems.filter(m => m.name.toLowerCase().includes(menuSearch.toLowerCase()) && m.is_available)
    : menuItems.filter(m => m.is_available);

  return (
    <div className="orders-page">
      <PageHeader title="Pedidos" subtitle="Gestión de comandas" icon="clipboard"
        actions={<button className="btn btn-primary" onClick={() => setNewOrderModal(true)}><Icon name="plus" /> Nuevo Pedido</button>}
      />

      {/* Tabs */}
      <div className="team-tabs mb-3">
        <button className={`team-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>🔥 Activos</button>
        <button className={`team-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>📋 Todos</button>
      </div>

      {loading ? (
        <div className="dashboard-loading"><span className="spinner" /> Cargando pedidos...</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📋</div>
          <h3>No hay pedidos {tab === 'active' ? 'activos' : ''}</h3>
          <p className="text-muted mb-2">Creá un nuevo pedido para empezar</p>
          <button className="btn btn-primary" onClick={() => setNewOrderModal(true)}><Icon name="plus" /> Nuevo Pedido</button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Tipo</th><th>Mesa</th><th>Mesero</th><th>Total</th><th>Estado</th><th>Tiempo</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const elapsed = Math.round((new Date() - new Date(order.created_at)) / 60000);
                  return (
                    <tr key={order.id}>
                      <td><strong>#{order.order_number}</strong></td>
                      <td>{{ dine_in: '🍽️ Mesa', takeaway: '📦 Llevar', delivery: '🛵 Delivery' }[order.order_type] || order.order_type}</td>
                      <td>{order.table?.table_number || '-'}</td>
                      <td>{order.waiter?.full_name || '-'}</td>
                      <td><strong>{formatCurrency(order.total || 0)}</strong></td>
                      <td><span className={`badge ${STATUS_BADGE[order.status] || 'badge-neutral'}`}>{STATUS_LABELS[order.status] || order.status}</span></td>
                      <td>
                        <span className={`days-countdown ${elapsed > 30 ? 'days-danger' : elapsed > 15 ? 'days-warning' : 'days-ok'}`}>
                          {elapsed} min
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="action-btn-quick action-btn-payment" onClick={() => openAddItems(order.id)} title="Ver/Agregar ítems">📋</button>
                          {order.status === 'pending' && <button className="action-btn-quick" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }} onClick={() => handleStatusChange(order.id, 'preparing')} title="Enviar a cocina">🔥</button>}
                          {order.status === 'ready' && <button className="action-btn-quick" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }} onClick={() => handleStatusChange(order.id, 'served')} title="Marcar servido">✅</button>}
                          {(order.status === 'served' || order.status === 'ready') && (
                            <button className="action-btn-quick" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }} onClick={() => openCloseModal(order)} title="Cobrar">💰</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {newOrderModal && (
        <div className="modal-overlay modal-show" onClick={() => setNewOrderModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h2 className="modal-title">Nuevo Pedido</h2>
            <div className="form-group mb-2">
              <label className="form-label">Tipo de pedido</label>
              <div className="flex gap-1">
                {[{ id: 'dine_in', label: '🍽️ Mesa' }, { id: 'takeaway', label: '📦 Para llevar' }, { id: 'delivery', label: '🛵 Delivery' }].map(t => (
                  <button key={t.id} className={`btn btn-sm ${orderType === t.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setOrderType(t.id)}>{t.label}</button>
                ))}
              </div>
            </div>
            {orderType === 'dine_in' && (
              <div className="form-group mb-2">
                <label className="form-label">Mesa *</label>
                <select className="form-select" value={selectedTable} onChange={e => setSelectedTable(e.target.value)}>
                  <option value="">Seleccionar mesa</option>
                  {availableTables.map(t => <option key={t.id} value={t.id}>Mesa {t.table_number} (👥 {t.capacity})</option>)}
                </select>
                {availableTables.length === 0 && <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>No hay mesas libres</p>}
              </div>
            )}
            <div className="form-group mb-2">
              <label className="form-label">Cliente</label>
              <input type="text" className="form-input" placeholder="Nombre (opcional)"
                value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Comensales</label>
              <input type="number" className="form-input" min="1" max="20"
                value={customerCount} onChange={e => setCustomerCount(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setNewOrderModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateOrder} disabled={creating}>
                {creating ? <><span className="spinner" /> Creando...</> : 'Crear Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Items Modal */}
      {addItemsModal && (
        <div className="modal-overlay modal-show" onClick={() => setAddItemsModal(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <h2 className="modal-title">Pedido — Ítems</h2>

            {/* Current items */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>📋 Ítems del pedido ({currentOrderItems.length})</h4>
              {currentOrderItems.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>Sin ítems — agregá platos del menú</p>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {currentOrderItems.map(item => (
                    <div key={item.id} className="payment-history-item">
                      <span>{item.item_name || item.menu_item?.name || 'Ítem'} × {item.quantity}</span>
                      <div className="flex items-center gap-1">
                        <strong>{formatCurrency(item.unit_price * item.quantity)}</strong>
                        <button className="action-btn-quick" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', width: 24, height: 24, padding: 0, fontSize: '0.7rem' }}
                          onClick={() => handleRemoveItem(item.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add from menu */}
            <div>
              <div className="search-box mb-1">
                <input type="text" className="search-input" placeholder="Buscar en el menú..."
                  value={menuSearch} onChange={e => setMenuSearch(e.target.value)} />
              </div>
              <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                {filteredMenu.slice(0, 20).map(item => (
                  <div key={item.id} className="search-result-item" onClick={() => handleAddItem(item)} style={{ cursor: 'pointer' }}>
                    <div className="member-info" style={{ flex: 1 }}>
                      <div className="member-name">{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.category?.name || 'Sin categoría'} · ⏱️ {item.prep_time_min} min</div>
                    </div>
                    <strong style={{ color: 'var(--primary-400)' }}>{formatCurrency(item.price)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setAddItemsModal(false)}>Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Close/Pay Modal */}
      {closeModal && (
        <div className="modal-overlay modal-show" onClick={() => setCloseModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 className="modal-title">💰 Cobrar Pedido</h2>
            <div className="form-group mb-2">
              <label className="form-label">Método de pago</label>
              <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="cash">💵 Efectivo</option>
                <option value="card">💳 Tarjeta</option>
                <option value="transfer">🏦 Transferencia</option>
                <option value="mercadopago">📱 MercadoPago</option>
                <option value="mixed">🔄 Mixto</option>
              </select>
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Propina (opcional)</label>
              <input type="number" className="form-input" step="0.01" min="0"
                value={tipAmount} onChange={e => setTipAmount(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setCloseModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCloseOrder}>Confirmar Pago</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
