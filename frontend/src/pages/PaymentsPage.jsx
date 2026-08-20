// ============================================
// VELTRONIK V2 - PAGOS (gym)
// ============================================
// Cobro de cuotas: alta/edición de pagos filtrados por rango de fecha, con el
// período de membresía que se renueva solo al registrar el pago.
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { memberService, errorService } from '../services';
import { usePaymentController } from '../controllers/usePaymentController';
import { formatDate, formatCurrency, getMethodLabel, toLocalDateString } from '../lib/utils';
import { useModal, useConfirmDialog } from '../hooks';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { StatCard, FilterBar, Badge } from '../components/ui';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';

// Suma 1 mes a una fecha 'YYYY-MM-DD' (mediodía para evitar saltos por DST), devuelve local.
function addOneMonth(dateStr) {
  const d = new Date(`${String(dateStr).split('T')[0]}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  return toLocalDateString(d);
}

function getQuickDates(period) {
  const today = new Date();
  let from, to;
  switch (period) {
    case 'today': from = to = toLocalDateString(today); break;
    case 'week': {
      const ws = new Date(today);
      ws.setDate(today.getDate() - today.getDay() + 1);
      from = toLocalDateString(ws);
      to = toLocalDateString(today);
      break;
    }
    case 'month':
      from = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
      to = toLocalDateString(today); break;
    case 'year':
      from = toLocalDateString(new Date(today.getFullYear(), 0, 1));
      to = toLocalDateString(today); break;
    default: break;
  }
  return { from, to };
}

/**
 * Compara el estado de un pago sin depender de mayúsculas.
 *
 * Durante mucho tiempo convivieron dos cajas en la misma columna: los pagos cargados desde
 * la app quedaron en minúscula ("paid") y los que tomaron el default viejo del backend, en
 * mayúscula ("PAID"). Comparar exacto hacía que los totales de esta pantalla se saltearan
 * los pagos de una de las dos épocas. El backend ya normaliza al guardar, pero los que ya
 * están en la base quedaron como quedaron.
 */
function esEstado(pago, estado) {
  return (pago?.status || '').toLowerCase() === estado;
}

function getInitialForm() {
  const today = toLocalDateString(new Date());
  return {
    member_id: '',
    amount: '',
    paymentDate: today,
    paymentMethod: 'cash',
    status: 'paid',
    notes: '',
    periodStart: today,
    periodEnd: addOneMonth(today),
  };
}

const PAYMENT_MAP_FN = (p) => ({
  member_id: p.member_id || '',
  amount: p.amount || '',
  paymentDate: p.paymentDate || '',
  paymentMethod: p.paymentMethod || 'cash',
  // En minúscula: si no, un pago viejo con "PAID" no coincide con ninguna opción del
  // select de estado y el campo aparece en blanco al editarlo.
  status: (p.status || 'paid').toLowerCase(),
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

  // Búsqueda de socios con debounce. `cancelled` descarta la respuesta de una búsqueda
  // vieja que llegue tarde: si tarda más que el debounce, pisaba a la búsqueda nueva.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (memberSearch.length < 2) { setFilteredMembers([]); return; }
      try {
        const results = await memberService.searchForAccess(memberSearch);
        if (!cancelled) setFilteredMembers(results);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [memberSearch]);

  // Modal & Dialog
  // El form inicial se congela al montar: recalcularlo en cada render le cambiaba la
  // identidad a los callbacks de useModal (que dependen de él) render por medio.
  const [initialForm] = useState(getInitialForm);
  // Deep-link desde Socios ("Cobrar cuota") o del Dashboard: ?action=new[&member_id=…].
  // Se lee UNA sola vez, al montar: es un parámetro de entrada, no un estado que cambie.
  const [deepLink] = useState(() => ({
    wantsNew: searchParams.get('action') === 'new',
    memberId: searchParams.get('member_id') || '',
  }));
  // Sin socio en la URL el modal ya puede abrir en el primer render; con socio abre
  // recién cuando llega el fetch de abajo, para nacer con el período calculado.
  const modal = useModal(initialForm, deepLink.wantsNew && !deepLink.memberId);
  const openModal = modal.open;
  const deleteDialog = useConfirmDialog();

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
    const paidInPeriod = payments.filter((p) => esEstado(p, 'paid'));
    const pendingInPeriod = payments.filter((p) => esEstado(p, 'pending'));

    return {
      totalPeriod: paidInPeriod.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      totalCount: paidInPeriod.length,
      pendingCount: pendingInPeriod.length,
      pendingTotal: pendingInPeriod.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
    };
  }, [payments]);

  // Deep-link con socio: lo trae por ID y abre el modal ya preseleccionado.
  useEffect(() => {
    if (!deepLink.wantsNew) return;
    // La URL se limpia siempre, incluso sin socio: un F5 no debe reabrir el modal.
    setSearchParams({}, { replace: true });
    if (!deepLink.memberId) return;

    let cancelled = false;
    // Por ID directo. (Antes se usaba searchForAccess(memberId), que busca por
    // nombre/DNI/email: un UUID nunca matchea → el socio NO quedaba preseleccionado.)
    memberService.getMemberById(deepLink.memberId).then(member => {
      if (cancelled || !member) return;
      setSelectedMember({
        ...member,
        fullName: member.fullName || `${member.firstName || ''} ${member.lastName || ''}`.trim(),
        dni: member.dni || member.document || '',
      });
      // El período nuevo arranca donde termina la membresía vigente (o hoy si no tiene).
      const startStr = (member.membershipEnd || toLocalDateString(new Date())).split('T')[0];
      openModal({ id: null }, () => ({
        ...initialForm,
        member_id: deepLink.memberId,
        periodStart: startStr,
        periodEnd: addOneMonth(startStr),
      }));
    }).catch(err => {
      if (cancelled) return;
      console.error('No se pudo cargar el socio para el pago:', err);
      showToast('No se pudo cargar el socio seleccionado', 'error');
      openModal();
    });
    return () => { cancelled = true; };
  }, [deepLink, initialForm, openModal, setSearchParams, showToast]);

  // Form change handler with auto-period calculation
  const handleFormChange = (field, value) => {
    modal.setForm((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === 'periodStart' && value) {
        updated.periodEnd = addOneMonth(value);
      }

      if (field === 'paymentDate' && value && !prev.periodStart) {
        updated.periodStart = value;
        updated.periodEnd = addOneMonth(value);
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
      
      // Correr el vencimiento del socio ya NO se hace acá. Antes había una segunda
      // request envuelta en un catch vacío ("best-effort"): si fallaba, el pago quedaba
      // guardado y el socio seguía figurando como vencido, sin que nadie se enterara.
      // Ahora el backend guarda el pago y la cobertura en una sola operación.
      //
      // Sacarlo no es solo limpieza: el backend nunca mueve la fecha HACIA ATRÁS (un
      // pago correctivo no puede acortarle la membresía a alguien al día), y esta llamada
      // la movía sin esa regla — o sea que deshacía la protección.
      await savePayment(data);
      showToast(modal.editingId ? 'Pago actualizado' : 'Pago registrado exitosamente', 'success');

      modal.close();
      // Recarga con el filtro de fecha ACTIVO → la lista queda consistente con lo que se ve.
      loadPayments(dateFrom, dateTo, debouncedSearch, methodFilter, statusFilter);
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
        // Fecha LOCAL: con toISOString(), un pago cobrado después de las 21:00 quedaba
        // registrado con la fecha de mañana (y desaparecía del filtro del día).
        paymentDate: toLocalDateString(),
      });
      showToast('Pago marcado como pagado', 'success');
      // El vencimiento lo corre el backend al guardar el pago (ver handleSubmit).
      loadPayments(dateFrom, dateTo, debouncedSearch, methodFilter, statusFilter);
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
                        {esEstado(payment, 'pending') && (
                          <button className="action-btn-quick action-btn-success"
                            onClick={() => handleMarkPaid(payment)} title="Marcar como pagado">
                            <Icon name="check" />
                          </button>
                        )}
                        <button className="action-btn-quick action-btn-payment"
                          onClick={() => openEditModal(payment)} title="Editar">
                          <Icon name="edit" />
                        </button>
                        <button className="action-btn-quick action-btn-delete"
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
        icon="trash"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </div>
  );
}
