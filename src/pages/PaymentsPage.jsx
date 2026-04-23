// ============================================
// VELTRONIK V2 - PAYMENTS PAGE (Fixed & Enhanced)
// ============================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [payments, setPayments] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Member search in modal
  const [memberSearch, setMemberSearch] = useState('');
  const memberSearchRef = useRef(null);

  // Modal & Dialog
  const modal = useModal(getInitialForm());
  const deleteDialog = useConfirmDialog();

  // Track if auto-open was already handled
  const autoOpenHandled = useRef(false);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyPayments = payments.filter(
      (p) => new Date(p.payment_date) >= startOfMonth && p.status === 'paid'
    );

    const pendingPayments = payments.filter((p) => p.status === 'pending');

    return {
      totalMonth: monthlyPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      totalCount: monthlyPayments.length,
      pendingCount: pendingPayments.length,
      pendingTotal: pendingPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
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

  // Auto-open modal with optional pre-selected member (from Members page "Cobrar cuota")
  useEffect(() => {
    if (autoOpenHandled.current) return;
    if (searchParams.get('action') !== 'new') return;
    if (members.length === 0 && loading) return; // wait for members to load

    autoOpenHandled.current = true;
    const memberId = searchParams.get('member_id');

    if (memberId) {
      const member = members.find(m => m.id === memberId);
      const now = new Date();
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);

      const preFilledForm = {
        ...getInitialForm(),
        member_id: memberId,
        // Auto-set period based on member's membership_end if available
        period_start: member?.membership_end || now.toISOString().split('T')[0],
        period_end: (() => {
          if (member?.membership_end) {
            const start = new Date(member.membership_end + 'T12:00:00');
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            return end.toISOString().split('T')[0];
          }
          return next.toISOString().split('T')[0];
        })(),
      };

      // Use a synthetic item to open in "create" mode but with pre-filled data
      // We set editingId=null but pass the form data through the mapFn
      modal.open({ id: null }, () => preFilledForm);
    } else {
      modal.open();
    }

    // Clean URL params to avoid re-triggering
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, members, loading]);

  // Filtered members for member select in modal
  const filteredMembers = useMemo(() => {
    if (!memberSearch) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(m =>
      (m.full_name && m.full_name.toLowerCase().includes(q)) ||
      (m.dni && m.dni.toLowerCase().includes(q)) ||
      (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, memberSearch]);

  // Filtered payments for table
  const filteredPayments = useFilteredData(payments, {
    search,
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

  // Quick member select handler
  const handleMemberSelect = (memberId) => {
    handleFormChange('member_id', memberId);
    setMemberSearch('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!modal.form.member_id) {
      showToast('Selecciona un socio', 'error');
      return;
    }
    const amountVal = parseFloat(modal.form.amount);
    if (!modal.form.amount || isNaN(amountVal) || amountVal <= 0) {
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

        // Auto-update member membership_end if period_end is set
        if (data.period_end && data.member_id && data.status === 'paid') {
          try {
            await memberService.update(data.member_id, {
              membership_end: data.period_end,
              status: 'active',
            });
          } catch {
            // Non-critical: don't fail the payment for this
          }
        }
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

  // Mark pending as paid
  const handleMarkPaid = async (payment) => {
    try {
      await paymentService.update(payment.id, {
        status: 'paid',
        payment_date: new Date().toISOString().split('T')[0],
      });
      showToast('Pago marcado como pagado', 'success');

      // Also update member membership
      if (payment.period_end && payment.member_id) {
        try {
          await memberService.update(payment.member_id, {
            membership_end: payment.period_end,
            status: 'active',
          });
        } catch { /* non-critical */ }
      }

      loadData();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  // Get selected member name for display
  const selectedMember = useMemo(() => {
    if (!modal.form.member_id) return null;
    return members.find(m => m.id === modal.form.member_id);
  }, [modal.form.member_id, members]);

  return (
    <div className="payments-page">
      <PageHeader
        title="Pagos"
        subtitle="Gestión de pagos de socios"
        icon="wallet"
        actions={
          <button className="btn btn-primary" onClick={() => {
            autoOpenHandled.current = true;
            setMemberSearch('');
            modal.open();
          }}>
            <Icon name="plus" /> Registrar Pago
          </button>
        }
      />

      {/* Stats */}
      <div className="stats-grid stats-grid-3 mb-3">
        <StatCard icon="wallet" label="Ingresos este mes" value={formatCurrency(stats.totalMonth)} color="success" />
        <StatCard icon="check" label="Pagos cobrados" value={stats.totalCount} color="primary" />
        <StatCard icon="clock" label="Pagos pendientes" value={stats.pendingCount} color={stats.pendingCount > 0 ? 'warning' : 'neutral'} />
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
                        {payment.status === 'pending' && (
                          <button className="action-btn-quick"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                            onClick={() => handleMarkPaid(payment)} title="Marcar como pagado">
                            <Icon name="check" />
                          </button>
                        )}
                        <button className="action-btn-quick action-btn-payment"
                          onClick={() => {
                            setMemberSearch('');
                            modal.open(payment, PAYMENT_MAP_FN);
                          }} title="Editar">
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
        <form onSubmit={handleSave} noValidate>
          <div className="modal-form">
            {/* Member selector with search */}
            <div className="form-group full-width">
              <label className="form-label">Socio *</label>
              {selectedMember ? (
                <div className="selected-member-chip">
                  <div className="selected-member-info">
                    <strong>{selectedMember.full_name}</strong>
                    {selectedMember.dni && <span className="text-muted"> (DNI: {selectedMember.dni})</span>}
                  </div>
                  {!modal.isEditing && (
                    <button type="button" className="chip-remove" onClick={() => handleFormChange('member_id', '')}
                      title="Cambiar socio">✕</button>
                  )}
                </div>
              ) : (
                <div className="member-search-container">
                  <input
                    ref={memberSearchRef}
                    type="text"
                    className="form-input"
                    placeholder="Buscar socio por nombre o DNI..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {memberSearch && filteredMembers.length > 0 && (
                    <div className="member-search-dropdown">
                      {filteredMembers.slice(0, 8).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="member-search-option"
                          onClick={() => handleMemberSelect(m.id)}
                        >
                          <span className="member-option-name">{m.full_name}</span>
                          {m.dni && <span className="member-option-dni">DNI: {m.dni}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {memberSearch && filteredMembers.length === 0 && (
                    <div className="member-search-dropdown">
                      <div className="member-search-empty">No se encontraron socios</div>
                    </div>
                  )}
                  {/* Fallback: full select if no search */}
                  {!memberSearch && (
                    <select className="form-select" value={modal.form.member_id} style={{ marginTop: '0.5rem' }}
                      onChange={(e) => handleFormChange('member_id', e.target.value)}>
                      <option value="">Seleccionar socio...</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} {m.dni ? `(${m.dni})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Monto *</label>
              <input type="number" className="form-input" placeholder="0"
                value={modal.form.amount} onChange={(e) => handleFormChange('amount', e.target.value)}
                 />
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
