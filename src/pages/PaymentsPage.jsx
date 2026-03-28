// ============================================
// VELTRONIK V2 - PAYMENTS PAGE
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import {
  getMemberPayments,
  createMemberPayment,
  updateMemberPayment,
  deleteMemberPayment,
  getMembers,
  getSupabaseErrorMessage,
} from '../lib/supabase';
import {
  formatDate,
  formatCurrency,
  getMethodLabel,
} from '../lib/utils';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import Icon from '../components/Icon';

const today = new Date();
const nextMonth = new Date(today);
nextMonth.setMonth(nextMonth.getMonth() + 1);

const INITIAL_FORM = {
  member_id: '',
  amount: '',
  payment_date: today.toISOString().split('T')[0],
  payment_method: 'cash',
  status: 'paid',
  notes: '',
  period_start: today.toISOString().split('T')[0],
  period_end: nextMonth.toISOString().split('T')[0],
};

export default function PaymentsPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [payments, setPayments] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState(null);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyPayments = payments.filter(
      (p) => new Date(p.payment_date) >= startOfMonth && p.status === 'paid'
    );

    const totalMonth = monthlyPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalCount = monthlyPayments.length;

    return { totalMonth, totalCount };
  }, [payments]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [paymentsData, membersData] = await Promise.all([
        getMemberPayments(),
        getMembers(),
      ]);
      setPayments(paymentsData || []);
      setMembers(membersData || []);
    } catch (error) {
      console.error('Error loading payments:', error);
      showToast('Error al cargar pagos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-open modal
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setModalOpen(true);
    }
  }, [searchParams]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (search) {
        const memberName = p.member?.full_name?.toLowerCase() || '';
        const memberDni = p.member?.dni?.toLowerCase() || '';
        const q = search.toLowerCase();
        if (!memberName.includes(q) && !memberDni.includes(q)) return false;
      }
      if (methodFilter && p.payment_method !== methodFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [payments, search, methodFilter, statusFilter]);

  // Handlers
  const openNew = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEdit = (payment) => {
    setEditingId(payment.id);
    setForm({
      member_id: payment.member_id || '',
      amount: payment.amount || '',
      payment_date: payment.payment_date || '',
      payment_method: payment.payment_method || 'cash',
      status: payment.status || 'paid',
      notes: payment.notes || '',
      period_start: payment.period_start || '',
      period_end: payment.period_end || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };

      // Auto-calculate period_end when period_start changes (+1 month)
      if (field === 'period_start' && value) {
        const start = new Date(value + 'T12:00:00');
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        updated.period_end = end.toISOString().split('T')[0];
      }

      // Auto-fill period_start from payment_date if period_start is empty
      if (field === 'payment_date' && value && !prev.period_start) {
        updated.period_start = value;
        const start = new Date(value + 'T12:00:00');
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        updated.period_end = end.toISOString().split('T')[0];
      }

      return updated;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.member_id) {
      showToast('Selecciona un socio', 'error');
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = { ...form, amount: parseFloat(form.amount) };
      Object.keys(data).forEach((k) => { if (data[k] === '') data[k] = null; });

      if (editingId) {
        await updateMemberPayment(editingId, data);
        showToast('Pago actualizado', 'success');
      } else {
        await createMemberPayment(data);
        showToast('Pago registrado exitosamente', 'success');
      }

      closeModal();
      loadData();
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMemberPayment(deleteId);
      showToast('Pago eliminado', 'success');
      setDeleteId(null);
      loadData();
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    }
  };

  return (
    <div className="payments-page">
      <PageHeader
        title="Pagos"
        subtitle="Gestión de pagos de socios"
        icon="wallet"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" /> Registrar Pago
          </button>
        }
      />

      {/* Stats */}
      <div className="stats-grid stats-grid-2 mb-3">
        <div className="stat-card">
          <div className="stat-icon stat-icon-success"><Icon name="wallet" /></div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalMonth)}</div>
            <div className="stat-label">Ingresos este mes</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary"><Icon name="check" /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalCount}</div>
            <div className="stat-label">Pagos este mes</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="table-filters">
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por socio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <select className="form-select" value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Todos los métodos</option>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="mercadopago">Mercado Pago</option>
            </select>
            <select className="form-select" value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Todos los estados</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
            </select>
          </div>
          <span className="text-muted">{filteredPayments.length} pagos</span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Socio</th>
                <th>Monto</th>
                <th>Fecha</th>
                <th>Método</th>
                <th>Estado</th>
                <th>Período</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>
                    <span className="spinner" /> Cargando...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>
                    No se encontraron pagos
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Socio">
                      <strong>{payment.member?.full_name || 'Socio eliminado'}</strong>
                      {payment.member?.dni && (
                        <small className="text-muted" style={{ display: 'block' }}>
                          DNI: {payment.member.dni}
                        </small>
                      )}
                    </td>
                    <td data-label="Monto">
                      <span style={{ fontWeight: 600, color: 'var(--success-500)' }}>
                        {formatCurrency(payment.amount)}
                      </span>
                    </td>
                    <td data-label="Fecha">{formatDate(payment.payment_date)}</td>
                    <td data-label="Método">{getMethodLabel(payment.payment_method)}</td>
                    <td data-label="Estado">
                      <span className={`badge ${payment.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                        {payment.status === 'paid' ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                    <td data-label="Período">
                      {payment.period_start && payment.period_end
                        ? `${formatDate(payment.period_start)} - ${formatDate(payment.period_end)}`
                        : '-'}
                    </td>
                    <td data-label="Acciones">
                      <div className="table-actions">
                        <button className="action-btn-quick action-btn-payment"
                          onClick={() => openEdit(payment)} title="Editar">
                          <Icon name="edit" />
                        </button>
                        <button className="action-btn-quick"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                          onClick={() => setDeleteId(payment.id)} title="Eliminar">
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── PAYMENT MODAL ─── */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={closeModal}>
          <div className="modal-container member-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{editingId ? 'Editar Pago' : 'Registrar Pago'}</h2>
            <form onSubmit={handleSave}>
              <div className="modal-form">
                <div className="form-group full-width">
                  <label className="form-label">Socio *</label>
                  <select className="form-select" value={form.member_id}
                    onChange={(e) => handleFormChange('member_id', e.target.value)} required>
                    <option value="">Seleccionar socio...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} {m.dni ? `(${m.dni})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Monto *</label>
                  <input type="number" className="form-input" placeholder="0"
                    value={form.amount} onChange={(e) => handleFormChange('amount', e.target.value)}
                    required min="1" step="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de pago</label>
                  <input type="date" className="form-input" value={form.payment_date}
                    onChange={(e) => handleFormChange('payment_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Método de pago</label>
                  <select className="form-select" value={form.payment_method}
                    onChange={(e) => handleFormChange('payment_method', e.target.value)}>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                    <option value="mercadopago">Mercado Pago</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={form.status}
                    onChange={(e) => handleFormChange('status', e.target.value)}>
                    <option value="paid">Pagado</option>
                    <option value="pending">Pendiente</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Período desde</label>
                  <input type="date" className="form-input" value={form.period_start}
                    onChange={(e) => handleFormChange('period_start', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Período hasta</label>
                  <input type="date" className="form-input" value={form.period_end}
                    onChange={(e) => handleFormChange('period_end', e.target.value)} />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Notas</label>
                  <textarea className="form-textarea" rows="2" value={form.notes}
                    onChange={(e) => handleFormChange('notes', e.target.value)} />
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" /> Guardando...</> : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="Eliminar Pago"
        message="¿Estás seguro de eliminar este pago? Esta acción no se puede deshacer."
        icon="🗑️"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
