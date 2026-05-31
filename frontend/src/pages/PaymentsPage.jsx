// ============================================
// VELTRONIK V2 - PAYMENTS PAGE (Refactored for Scale & Cache)
// ============================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { memberService, errorService } from '../services';
import { usePaymentController } from '../controllers/usePaymentController';
import { formatDate, formatCurrency, getMethodLabel } from '../lib/utils';
import { useModal, useConfirmDialog } from '../hooks';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { StatCard, FilterBar, Badge } from '../components/ui';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';

function getQuickDates(period) {
  const today = new Date();
  let from, to;
  switch (period) {
    case 'today': from = to = today.toISOString().split('T')[0]; break;
    case 'week': {
      const ws = new Date(today);
      ws.setDate(today.getDate() - today.getDay() + 1);
      from = ws.toISOString().split('T')[0];
      to = today.toISOString().split('T')[0];
      break;
    }
    case 'month':
      from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      to = today.toISOString().split('T')[0]; break;
    case 'year':
      from = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      to = today.toISOString().split('T')[0]; break;
    default: break;
  }
  return { from, to };
}

function getInitialForm() {
  const now = new Date();
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return {
    member_id: '',
    amount: '',
    paymentDate: now.toISOString().split('T')[0],
    paymentMethod: 'cash',
    status: 'paid',
    notes: '',
    periodStart: now.toISOString().split('T')[0],
    periodEnd: next.toISOString().split('T')[0],
  };
}

const PAYMENT_MAP_FN = (p) => ({
  member_id: p.member_id || '',
  amount: p.amount || '',
  paymentDate: p.paymentDate || '',
  paymentMethod: p.paymentMethod || 'cash',
  status: p.status || 'paid',
  notes: p.notes || '',
  periodStart: p.periodStart || '',
  periodEnd: p.periodEnd || '',
});

export default function PaymentsPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getQuickDates('month').from);
  const [dateTo, setDateTo] = useState(() => getQuickDates('month').to);
  const [activePeriod, setActivePeriod] = useState('month');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const setQuickDate = (period) => {
    const { from, to } = getQuickDates(period);
    setDateFrom(from);
    setDateTo(to);
    setActivePeriod(period);
  };

  // Member search in modal
  const [memberSearch, setMemberSearch] = useState('');
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null); // Local state for modal
  const memberSearchRef = useRef(null);

  // Async member search
  useEffect(() => {
    if (memberSearch.length < 2) {
      setFilteredMembers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await memberService.searchForAccess(memberSearch);
        setFilteredMembers(results);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  // Modal & Dialog
  const modal = useModal(getInitialForm());
  const deleteDialog = useConfirmDialog();
  const autoOpenHandled = useRef(false);

  // ─── CONTROLLER ───
  const {
    payments,
    loading: isFetching,
    loadPayments,
    savePayment,
    deletePayment
  } = usePaymentController();

  useEffect(() => {
    loadPayments(dateFrom, dateTo, debouncedSearch, methodFilter, statusFilter);
  }, [dateFrom, dateTo, debouncedSearch, methodFilter, statusFilter, loadPayments]);

  // Stats computed strictly from currently fetched payments
  const stats = useMemo(() => {
    const paidInPeriod = payments.filter((p) => p.status === 'paid');
    const pendingInPeriod = payments.filter((p) => p.status === 'pending');

    return {
      totalPeriod: paidInPeriod.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      totalCount: paidInPeriod.length,
      pendingCount: pendingInPeriod.length,
      pendingTotal: pendingInPeriod.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
    };
  }, [payments]);

  // Auto-open modal with pre-selected member
  useEffect(() => {
    if (autoOpenHandled.current) return;
    if (searchParams.get('action') !== 'new') return;

    autoOpenHandled.current = true;
    const memberId = searchParams.get('member_id');

    if (memberId) {
      memberService.searchForAccess(memberId).then(results => {
        const member = results.find(m => m.id === memberId);
        if (member) {
          setSelectedMember(member);
          const now = new Date();
          const next = new Date(now);
          next.setMonth(next.getMonth() + 1);

          const preFilledForm = {
            ...getInitialForm(),
            member_id: memberId,
            periodStart: member?.membershipEnd || now.toISOString().split('T')[0],
            periodEnd: (() => {
              if (member?.membershipEnd) {
                const start = new Date(member.membershipEnd + 'T12:00:00');
                const end = new Date(start);
                end.setMonth(end.getMonth() + 1);
                return end.toISOString().split('T')[0];
              }
              return next.toISOString().split('T')[0];
            })(),
          };
          modal.open({ id: null }, () => preFilledForm);
        }
      });
    } else {
      setSelectedMember(null);
      modal.open();
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, modal, setSearchParams]);

  // Form change handler with auto-period calculation
  const handleFormChange = (field, value) => {
    modal.setForm((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === 'periodStart' && value) {
        const start = new Date(value + 'T12:00:00');
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        updated.periodEnd = end.toISOString().split('T')[0];
      }

      if (field === 'paymentDate' && value && !prev.periodStart) {
        updated.periodStart = value;
        const start = new Date(value + 'T12:00:00');
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        updated.periodEnd = end.toISOString().split('T')[0];
      }

      return updated;
    });
  };

  const handleMemberSelect = (member) => {
    handleFormChange('member_id', member.id);
    setSelectedMember(member);
    setMemberSearch('');
    setFilteredMembers([]);
  };

  const handleClearSelectedMember = () => {
    handleFormChange('member_id', '');
    setSelectedMember(null);
  };

  const openEditModal = (payment) => {
    setMemberSearch('');
    setFilteredMembers([]);
    setSelectedMember(payment.member || null);
    modal.open(payment, PAYMENT_MAP_FN);
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
        data.id = modal.editingId;
      }
      
      await savePayment(data);
      showToast(modal.editingId ? 'Pago actualizado' : 'Pago registrado exitosamente', 'success');

      if (!modal.editingId && data.periodEnd && data.member_id && data.status === 'paid') {
        try {
          await memberService.update(data.member_id, {
            membershipEnd: `${data.periodEnd}T23:59:59`,
            status: 'active',
          });
        } catch {}
      }

      modal.close();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      modal.setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteDialog.confirm(async (id) => {
      try {
        await deletePayment(id);
        showToast('Pago eliminado', 'success');
      } catch (error) {
        showToast(errorService.getMessage(error), 'error');
      }
    });
  };

  const handleMarkPaid = async (payment) => {
    try {
      await savePayment({
        ...payment,
        status: 'paid',
        paymentDate: new Date().toISOString().split('T')[0]
      });
      showToast('Pago marcado como pagado', 'success');

      if (payment.periodEnd && payment.member_id) {
        try {
          await memberService.update(payment.member_id, {
            membershipEnd: `${payment.periodEnd}T23:59:59`,
            status: 'active',
          });
        } catch {}
      }
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  return (
    <div className="payments-page">
      <PageHeader
        title="Pagos"
        subtitle={isFetching && payments.length > 0 ? "Actualizando datos..." : "Gestión de pagos de socios"}
        icon="wallet"
        actions={
          <button className="btn btn-primary" onClick={() => {
            autoOpenHandled.current = true;
            setMemberSearch('');
            setSelectedMember(null);
            modal.open();
          }}>
            <Icon name="plus" /> Registrar Pago
          </button>
        }
      />

      {/* Date Range */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="flex gap-1 items-center">
            <label className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>Desde</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod(''); }} style={{ width: 'auto' }} />
          </div>
          <div className="flex gap-1 items-center">
            <label className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>Hasta</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod(''); }} style={{ width: 'auto' }} />
          </div>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {['today', 'week', 'month', 'year'].map(p => (
              <button key={p} className={`btn btn-sm ${activePeriod === p ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQuickDate(p)}>
                {{ today: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' }[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid stats-grid-3 mb-3">
        <StatCard icon="wallet" label="Ingresos del período" value={formatCurrency(stats.totalPeriod)} color="success" />
        <StatCard icon="check" label="Pagos cobrados" value={stats.totalCount} color="primary" />
        <StatCard icon="clock" label="Pagos pendientes" value={stats.pendingCount} color={stats.pendingCount > 0 ? 'warning' : 'neutral'} />
      </div>

      {/* Filters */}
      <FilterBar
        onSearch={(e) => setSearchInput(e.target.value)}
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
        count={payments.length}
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
              {isFetching && payments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>
                    <span className="spinner" /> Cargando...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>
                    No se encontraron pagos
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                    <td data-label="Socio">
                      <strong>{payment.member?.fullName || 'Socio eliminado'}</strong>
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
                    <td data-label="Fecha">{formatDate(payment.paymentDate)}</td>
                    <td data-label="Método">{getMethodLabel(payment.paymentMethod)}</td>
                    <td data-label="Estado"><Badge status={payment.status} /></td>
                    <td data-label="Período">
                      {payment.periodStart && payment.periodEnd
                        ? `${formatDate(payment.periodStart)} - ${formatDate(payment.periodEnd)}`
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
                          onClick={() => openEditModal(payment)} title="Editar">
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
            <div className="form-group full-width">
              <label className="form-label">Socio *</label>
              {selectedMember ? (
                <div className="selected-member-chip">
                  <div className="selected-member-info">
                    <strong>{selectedMember.fullName}</strong>
                    {selectedMember.dni && <span className="text-muted"> (DNI: {selectedMember.dni})</span>}
                  </div>
                  {!modal.isEditing && (
                    <button type="button" className="chip-remove" onClick={handleClearSelectedMember}
                      title="Cambiar socio">✕</button>
                  )}
                </div>
              ) : (
                <div className="member-search-container">
                  <input
                    ref={memberSearchRef}
                    type="text"
                    className="form-input"
                    placeholder="Buscar socio por nombre o DNI (mínimo 2 letras)..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {memberSearch.length >= 2 && filteredMembers.length > 0 && (
                    <div className="member-search-dropdown">
                      {filteredMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="member-search-option"
                          onClick={() => handleMemberSelect(m)}
                        >
                          <span className="member-option-name">{m.fullName}</span>
                          {m.dni && <span className="member-option-dni">DNI: {m.dni}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {memberSearch.length >= 2 && filteredMembers.length === 0 && (
                    <div className="member-search-dropdown">
                      <div className="member-search-empty">No se encontraron socios</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Monto *</label>
              <input type="number" className="form-input" placeholder="0"
                value={modal.form.amount} onChange={(e) => handleFormChange('amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de pago</label>
              <input type="date" className="form-input" value={modal.form.paymentDate}
                onChange={(e) => handleFormChange('paymentDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Método de pago</label>
              <select className="form-select" value={modal.form.paymentMethod}
                onChange={(e) => handleFormChange('paymentMethod', e.target.value)}>
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
              <input type="date" className="form-input" value={modal.form.periodStart}
                onChange={(e) => handleFormChange('periodStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Período hasta</label>
              <input type="date" className="form-input" value={modal.form.periodEnd}
                onChange={(e) => handleFormChange('periodEnd', e.target.value)} />
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
