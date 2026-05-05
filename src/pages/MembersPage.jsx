// ============================================
// VELTRONIK V2 - MEMBERS PAGE (Refactored)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { paymentService, errorService } from '../services';
import { useMemberController } from '../controllers/useMemberController';
import { formatDate, formatCurrency } from '../lib/utils';
import { useModal, useConfirmDialog, usePagination, useDebouncedSearch, useQueryCache } from '../hooks';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { FilterBar, Badge, DaySelector, DAY_NAMES, Pagination } from '../components/ui';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

const PAGE_SIZE = 25;

const INITIAL_FORM = {
  full_name: '',
  dni: '',
  phone: '',
  email: '',
  birth_date: '',
  membership_start: '',
  membership_end: '',
  status: 'active',
  notes: '',
  attendance_days: [],
};

const MEMBER_MAP_FN = (m) => ({
  full_name: m.full_name || '',
  dni: m.dni || '',
  phone: m.phone || '',
  email: m.email || '',
  birth_date: m.birth_date || '',
  membership_start: m.membership_start || '',
  membership_end: m.membership_end || '',
  status: m.status || 'active',
  notes: m.notes || '',
  attendance_days: m.attendance_days || [],
});

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'expired', label: 'Vencidos' },
  { value: 'suspended', label: 'Suspendidos' },
];

export default function MembersPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentRole = localStorage.getItem('current_org_role');
  const orgType = localStorage.getItem('current_org_type') || 'GYM';
  const isMemberLabel = (orgType === 'PILATES' || orgType === 'ACADEMY');
  const memberLabel = isMemberLabel ? 'Alumno' : 'Socio';
  const membersLabel = isMemberLabel ? 'Alumnos' : 'Socios';
  const membersLabelLower = membersLabel.toLowerCase();
  const canDelete = currentRole === 'owner' || currentRole === 'admin';

  // Controller
  const {
    members: controllerMembers,
    loading: isFetching,
    totalRecords,
    loadMembers,
    saveMember,
    deleteMember
  } = useMemberController();

  // Local derived state for filtering
  const [members, setMembers] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const pagination = usePagination(totalRecords, PAGE_SIZE);
  const { search, handleSearchInput } = useDebouncedSearch(300, pagination.reset);

  // Modal
  const modal = useModal(INITIAL_FORM);

  // Delete confirmation
  const deleteDialog = useConfirmDialog();

  // Payments history
  const [paymentsModal, setPaymentsModal] = useState(false);
  const [paymentsMember, setPaymentsMember] = useState(null);
  const [memberPayments, setMemberPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ─── FETCH MEMBERS VIA CONTROLLER ───
  useEffect(() => {
    loadMembers(pagination.page, PAGE_SIZE, search);
  }, [pagination.page, search, loadMembers]);

  // Procesar resultado al cambiar datos o filtro local
  useEffect(() => {
    let filtered = controllerMembers;
    if (statusFilter) {
      const today = new Date();
      filtered = filtered.filter((m) => {
        if (statusFilter === 'expired') {
          return m.membership_end && new Date(m.membership_end) < today;
        }
        return m.status === statusFilter;
      });
    }
    setMembers(filtered);
  }, [controllerMembers, statusFilter]);

  // Auto-open modal if ?action=new
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      modal.open();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ─── SAVE MEMBER ───
  const handleSave = async (e) => {
    e.preventDefault();
    if (!modal.form.full_name.trim()) {
      showToast('El nombre es requerido', 'error');
      return;
    }

    modal.setSaving(true);
    try {
      const data = modal.getCleanedData();
      if (modal.editingId) {
        data.id = modal.editingId;
      }
      
      await saveMember(data);
      // Forzar recarga desde la BD para garantizar sincronización de la tabla y contador
      loadMembers(pagination.page, PAGE_SIZE, search);
      
      showToast(`${memberLabel} guardado exitosamente`, 'success');
      modal.close();
    } catch (error) {
      showToast(error.message || errorService.getMessage(error), 'error');
    } finally {
      modal.setSaving(false);
    }
  };

  // ─── DELETE MEMBER ───
  const handleDelete = async () => {
    await deleteDialog.confirm(async (id) => {
      try {
        await deleteMember(id);
        showToast(`${memberLabel} eliminado`, 'success');
      } catch (error) {
        showToast(errorService.getMessage(error), 'error');
      }
    });
  };

  // ─── PAYMENTS HISTORY ───
  const openPaymentsHistory = async (member) => {
    setPaymentsMember(member);
    setPaymentsModal(true);
    setPaymentsLoading(true);
    try {
      const payments = await paymentService.getByMemberId(member.id);
      setMemberPayments(payments || []);
    } catch {
      setMemberPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // ─── CSV EXPORT ───
  const exportCSV = () => {
    if (members.length === 0) {
      showToast('No hay datos para exportar', 'warning');
      return;
    }
    const headers = ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Inicio', 'Vencimiento', 'Días de Asistencia'];
    const rows = members.map((m) => {
      const days = Array.isArray(m.attendance_days) ? m.attendance_days.map(d => DAY_NAMES[d]).join(', ') : '';
      return [
        m.full_name, m.dni || '', m.phone || '', m.email || '',
        m.status === 'active' ? 'Activo' : m.status === 'inactive' ? 'Inactivo' : m.status === 'expired' ? 'Vencido' : 'Suspendido',
        m.membership_start || '', m.membership_end || '', days,
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socios_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado correctamente', 'success');
  };

  // ─── WHATSAPP ───
  const openWhatsApp = (member) => {
    if (!member.phone) {
      showToast(`Este ${memberLabel.toLowerCase()} no tiene teléfono registrado`, 'warning');
      return;
    }
    const phone = member.phone.replace(/\D/g, '');
    window.open(`https://wa.me/54${phone}`, '_blank');
  };

  // ─── DAYS REMAINING ───
  const getDaysInfo = (membershipEnd) => {
    if (!membershipEnd) return { text: '-', className: 'days-none' };
    const today = new Date();
    const end = new Date(membershipEnd);
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { text: `${Math.abs(diff)}d vencido`, className: 'days-expired' };
    if (diff <= 3) return { text: `${diff}d`, className: 'days-danger' };
    if (diff <= 7) return { text: `${diff}d`, className: 'days-warning' };
    return { text: `${diff}d`, className: 'days-ok' };
  };

  return (
    <div className="members-page">
      <PageHeader
        title={membersLabel}
        subtitle={isFetching && members.length > 0 ? "Actualizando datos..." : `${totalRecords} ${membersLabelLower} registrados`}
        icon="users"
        actions={
          <div className="flex gap-1">
            <button className="btn btn-secondary" onClick={exportCSV}>
              <Icon name="download" /> Exportar
            </button>
            <button className="btn btn-primary" onClick={() => modal.open()}>
              <Icon name="plus" /> Nuevo {memberLabel}
            </button>
          </div>
        }
      />

      {/* Filters */}
      <FilterBar
        onSearch={handleSearchInput}
        searchPlaceholder="Buscar por nombre, DNI o email..."
        filters={[
          {
            value: statusFilter,
            onChange: (v) => { setStatusFilter(v); pagination.reset(); },
            options: STATUS_FILTER_OPTIONS,
          },
        ]}
        count={totalRecords}
        countLabel={membersLabelLower}
      />

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Asistencia</th>
                <th>Días</th>
                <th>Vencimiento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && members.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-muted" style={{ padding: '3rem' }}>
                    <span className="spinner" /> Cargando...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-muted" style={{ padding: '3rem' }}>
                    No se encontraron {membersLabelLower}
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const daysInfo = getDaysInfo(member.membership_end);
                  return (
                    <tr key={member.id} style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                      <td data-label="Nombre"><strong>{member.full_name}</strong></td>
                      <td data-label="DNI">{member.dni || '-'}</td>
                      <td data-label="Teléfono">{member.phone || '-'}</td>
                      <td data-label="Estado"><Badge status={member.status} /></td>
                      <td data-label="Asistencia">
                        <DaySelector selectedDays={member.attendance_days || []} readOnly />
                      </td>
                      <td data-label="Días">
                        <span className={`days-countdown ${daysInfo.className}`}>{daysInfo.text}</span>
                      </td>
                      <td data-label="Vencimiento">{formatDate(member.membership_end)}</td>
                      <td data-label="Acciones">
                        <div className="table-actions">
                          <button
                            className="action-btn-quick"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                            onClick={() => navigate(`${CONFIG.ROUTES.PAYMENTS}?action=new&member_id=${member.id}`)}
                            title="Cobrar cuota"
                          >💰</button>
                          {member.phone && (
                            <button
                              className="action-btn-quick action-btn-whatsapp"
                              onClick={() => openWhatsApp(member)}
                              title="WhatsApp"
                            >💬</button>
                          )}
                          <button
                            className="action-btn-quick action-btn-history"
                            onClick={() => openPaymentsHistory(member)}
                            title="Historial de pagos"
                          >💳</button>
                          <button
                            className="action-btn-quick action-btn-payment"
                            onClick={() => modal.open(member, MEMBER_MAP_FN)}
                            title="Editar"
                          ><Icon name="edit" /></button>
                          {canDelete && (
                            <button
                              className="action-btn-quick"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                              onClick={() => deleteDialog.open(member.id, member.full_name)}
                              title="Eliminar"
                            ><Icon name="trash" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination {...pagination} totalCount={totalRecords} />
      </div>

      {/* ─── MEMBER MODAL ─── */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.isEditing ? `Editar ${memberLabel}` : `Nuevo ${memberLabel}`}
      >
        <form onSubmit={handleSave} noValidate>
          <div className="modal-form">
            <div className="form-group full-width">
              <label className="form-label">Nombre completo *</label>
              <input type="text" className="form-input" value={modal.form.full_name}
                onChange={(e) => modal.handleChange('full_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">DNI</label>
              <input type="text" className="form-input" placeholder="12345678" pattern="\d*"
                onInput={(e) => e.target.value = e.target.value.replace(/\D/g, '')}
                value={modal.form.dni} onChange={(e) => modal.handleChange('dni', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input type="tel" className="form-input" placeholder="11-1234-5678"
                value={modal.form.phone} onChange={(e) => modal.handleChange('phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input"
                value={modal.form.email} onChange={(e) => modal.handleChange('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de nacimiento</label>
              <input type="date" className="form-input"
                value={modal.form.birth_date} onChange={(e) => modal.handleChange('birth_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Inicio de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membership_start} onChange={(e) => modal.handleChange('membership_start', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fin de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membership_end} onChange={(e) => modal.handleChange('membership_end', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={modal.form.status}
                onChange={(e) => modal.handleChange('status', e.target.value)}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="expired">Vencido</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            <div className="form-group full-width">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" rows="2"
                value={modal.form.notes} onChange={(e) => modal.handleChange('notes', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Días de Asistencia</label>
              <DaySelector
                selectedDays={modal.form.attendance_days}
                onChange={(days) => modal.handleChange('attendance_days', days)}
              />
            </div>
          </div>
          <ModalActions onCancel={modal.close} saving={modal.saving} />
        </form>
      </Modal>

      {/* ─── PAYMENTS HISTORY MODAL ─── */}
      <Modal
        isOpen={paymentsModal}
        onClose={() => setPaymentsModal(false)}
        title="💳 Historial de Pagos"
        actions={
          <button className="btn btn-secondary" onClick={() => setPaymentsModal(false)}>Cerrar</button>
        }
      >
        <p className="text-muted mb-2">{paymentsMember?.full_name || ''}</p>
        <div className="payment-history-list">
          {paymentsLoading ? (
            <div className="text-center text-muted" style={{ padding: '2rem' }}>
              <span className="spinner" /> Cargando...
            </div>
          ) : memberPayments.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '2rem' }}>
              Sin pagos registrados
            </div>
          ) : (
            memberPayments.map((p) => (
              <div key={p.id} className="payment-history-item">
                <div className="payment-info">
                  <span className="payment-amount">{formatCurrency(p.amount)}</span>
                  <span className="payment-date">{formatDate(p.payment_date)}</span>
                </div>
                <Badge status={p.status} />
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* ─── DELETE CONFIRMATION ─── */}
      <ConfirmDialog
        open={deleteDialog.isOpen}
        title={`Eliminar ${memberLabel}`}
        message={`¿Estás seguro de eliminar a "${deleteDialog.itemName}"? Esta acción no se puede deshacer.`}
        icon="🗑️"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </div>
  );
}
