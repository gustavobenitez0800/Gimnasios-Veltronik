// ============================================
// VELTRONIK V2 - PAYMENTS PAGE (Refactored)
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { memberService, paymentService, errorService } from '../services';
import { formatDate, formatCurrency, getMethodLabel } from '../lib/utils';
import { useModal, useConfirmDialog, useFilteredData } from '../hooks';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { StatCard, FilterBar, Badge } from '../components/ui';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';

function getInitialForm() {
  const now = new Date();
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return {
    member_id: '',
    amount: '',
    payment_date: now.toISOString().split('T')[0],
    payment_method: 'cash',
    status: 'paid',
    notes: '',
    period_start: now.toISOString().split('T')[0],
    period_end: next.toISOString().split('T')[0],
  };
}

const PAYMENT_MAP_FN = (p) => ({
  member_id: p.member_id || '',
  amount: p.amount || '',
  payment_date: p.payment_date || '',
  payment_method: p.payment_method || 'cash',
  status: p.status || 'paid',
  notes: p.notes || '',
  period_start: p.period_start || '',
  period_end: p.period_end || '',
});

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

  // Modal & Dialog
  const modal = useModal(getInitialForm());
  const deleteDialog = useConfirmDialog();

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyPayments = payments.filter(
      (p) => new Date(p.payment_date) >= startOfMonth && p.status === 'paid'
    );

    return {
      totalMonth: monthlyPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      totalCount: monthlyPayments.length,
    };
  }, [payments]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [paymentsData, membersData] = await Promise.all([
        paymentService.getAll(),
        memberService.getAll(),
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

  // Auto-open modal with optional pre-selected member
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      const memberId = searchParams.get('member_id');
      if (memberId) {
        modal.setForm((prev) => ({ ...prev, member_id: memberId }));
      }
      modal.open();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Filtered payments
  const filteredPayments = useFilteredData(payments, {
    search,
    methodFilter,
    statusFilter,
    customFilter: (p) => {
      if (methodFilter && p.payment_method !== methodFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    },
  }, {
    searchFields: ['member.full_name', 'member.dni'],
  });

  // Form change handler with auto-period calculation
  const handleFormChange = (field, value) => {
    modal.setForm((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === 'period_start' && value) {
        const start = new Date(value + 'T12:00:00');
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        updated.period_end = end.toISOString().split('T')[0];
      }

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
    if (!modal.form.member_id) {
      showToast('Selecciona un socio', 'error');
      return;
    }
    if (!modal.form.amount || parseFloat(modal.form.amount) <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }

    modal.setSaving(true);
    try {
      const data = { ...modal.form, amount: parseFloat(modal.form.amount) };
      Object.keys(data).forEach((k) => { if (data[k] === '') data[k] = null; });

      if (modal.editingId) {
        await paymentService.update(modal.editingId, data);
        showToast('Pago actualizado', 'success');
      } else {
        await paymentService.create(data);
        showToast('Pago registrado exitosamente', 'success');
      }

      modal.close();
      loadData();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      modal.setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteDialog.confirm(async (id) => {
      try {
        await paymentService.delete(id);
        showToast('Pago eliminado', 'success');
        loadData();
      } catch (error) {
        showToast(errorService.getMessage(error), 'error');
      }
    });
  };

  return (
    <div className="payments-page">
      <PageHeader
        title="Pagos"
        subtitle="Gestión de pagos de socios"
        icon="wallet"
        actions={
          <button className="btn btn-primary" onClick={() => modal.open()}>
            <Icon name="plus" /> Registrar Pago
          </button>
        }
      />

      {/* Stats */}
      <div className="stats-grid stats-grid-2 mb-3">
        <StatCard icon="wallet" label="Ingresos este mes" value={formatCurrency(stats.totalMonth)} color="success" />
        <StatCard icon="check" label="Pagos este mes" value={stats.totalCount} color="primary" />
      </div>

      {/* Filters */}
      <FilterBar
        onSearch={(e) => setSearch(e.target.value)}
        searchPlaceholder="Buscar por socio..."
        searchMaxWidth={280}
        filters={[
          {
            value: methodFilter,
            onChange: setMethodFilter,
            options: [
              { value: '', label: 'Todos los métodos' },
              { value: 'cash', label: 'Efectivo' },
              { value: 'card', label: 'Tarjeta' },
              { value: 'transfer', label: 'Transferencia' },
              { value: 'mercadopago', label: 'Mercado Pago' },
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: '', label: 'Todos los estados' },
              { value: 'paid', label: 'Pagados' },
              { value: 'pending', label: 'Pendientes' },
            ],
          },
        ]}
        count={filteredPayments.length}
        countLabel="pagos"
      />

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
                    <td data-label="Estado"><Badge status={payment.status} /></td>
                    <td data-label="Período">
                      {payment.period_start && payment.period_end
                        ? `${formatDate(payment.period_start)} - ${formatDate(payment.period_end)}`
                        : '-'}
                    </td>
                    <td data-label="Acciones">
                      <div className="table-actions">
                        <button className="action-btn-quick action-btn-payment"
                          onClick={() => modal.open(payment, PAYMENT_MAP_FN)} title="Editar">
                          <Icon name="edit" />
                        </button>
                        <button className="action-btn-quick"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                          onClick={() => deleteDialog.open(payment.id)} title="Eliminar">
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
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.isEditing ? 'Editar Pago' : 'Registrar Pago'}
      >
        <form onSubmit={handleSave}>
          <div className="modal-form">
            <div className="form-group full-width">
              <label className="form-label">Socio *</label>
              <select className="form-select" value={modal.form.member_id}
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
                value={modal.form.amount} onChange={(e) => handleFormChange('amount', e.target.value)}
                required min="1" step="1" />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de pago</label>
              <input type="date" className="form-input" value={modal.form.payment_date}
                onChange={(e) => handleFormChange('payment_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Método de pago</label>
              <select className="form-select" value={modal.form.payment_method}
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
              <select className="form-select" value={modal.form.status}
                onChange={(e) => handleFormChange('status', e.target.value)}>
                <option value="paid">Pagado</option>
                <option value="pending">Pendiente</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Período desde</label>
              <input type="date" className="form-input" value={modal.form.period_start}
                onChange={(e) => handleFormChange('period_start', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Período hasta</label>
              <input type="date" className="form-input" value={modal.form.period_end}
                onChange={(e) => handleFormChange('period_end', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" rows="2" value={modal.form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)} />
            </div>
          </div>
          <ModalActions onCancel={modal.close} saving={modal.saving} />
        </form>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialog.isOpen}
        title="Eliminar Pago"
        message="¿Estás seguro de eliminar este pago? Esta acción no se puede deshacer."
        icon="🗑️"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </div>
  );
}
