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
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';

const PAGE_SIZE = 25;

const INITIAL_FORM = {
  fullName: '',
  dni: '',
  phone: '',
  email: '',
  birthDate: '',
  membershipStart: '',
  membershipEnd: '',
  status: 'active',
  notes: '',
  attendanceDays: [],
};

const MEMBER_MAP_FN = (m) => ({
  fullName: m.fullName || '',
  dni: m.dni || '',
  phone: m.phone || '',
  email: m.email || '',
  birthDate: m.birthDate || '',
  membershipStart: m.membershipStart || '',
  membershipEnd: m.membershipEnd || '',
  status: m.status || 'active',
  notes: m.notes || '',
  attendanceDays: m.attendanceDays || [],
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
  const { orgRole, gym } = useAuth();
  const currentRole = orgRole;
  const orgType = gym?.type || localStorage.getItem('current_org_type') || 'GYM';
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
          return m.membershipEnd && new Date(m.membershipEnd) < today;
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
    if (!modal.form.fullName.trim()) {
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
      const days = Array.isArray(m.attendanceDays) ? m.attendanceDays.map(d => DAY_NAMES[d]).join(', ') : '';
      return [
        m.fullName, m.dni || '', m.phone || '', m.email || '',
        m.status === 'active' ? 'Activo' : m.status === 'inactive' ? 'Inactivo' : m.status === 'expired' ? 'Vencido' : 'Suspendido',
        m.membershipStart || '', m.membershipEnd || '', days,
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
                  const daysInfo = getDaysInfo(member.membershipEnd);
                  return (
                    <tr key={member.id} style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                      <td data-label="Nombre"><strong>{member.fullName}</strong></td>
                      <td data-label="DNI">{member.dni || '-'}</td>
                      <td data-label="Teléfono">{member.phone || '-'}</td>
                      <td data-label="Estado"><Badge status={member.status} /></td>
                      <td data-label="Asistencia">
                        <DaySelector selectedDays={member.attendanceDays || []} readOnly />
                      </td>
                      <td data-label="Días">
                        <span className={`days-countdown ${daysInfo.className}`}>{daysInfo.text}</span>
                      </td>
                      <td data-label="Vencimiento">{formatDate(member.membershipEnd)}</td>
                      <td data-label="Acciones">
                        <div className="table-actions">
                          <button
                            className="action-btn-quick"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                            onClick={() => navigate(`${CONFIG.ROUTES.PAYMENTS}?action=new&member_id=${member.id}`)}
                            title="Cobrar cuota"
                          ><Icon name="dollarSign" size="1em" /></button>
                          {member.phone && (
                            <button
                              className="action-btn-quick action-btn-whatsapp"
                              onClick={() => openWhatsApp(member)}
                              title="WhatsApp"
                            ><Icon name="messageCircle" size="1em" /></button>
                          )}
                          <button
                            className="action-btn-quick action-btn-history"
                            onClick={() => openPaymentsHistory(member)}
                            title="Historial de pagos"
                          ><Icon name="creditCard" size="1em" /></button>
                          <button
                            className="action-btn-quick action-btn-payment"
                            onClick={() => modal.open(member, MEMBER_MAP_FN)}
                            title="Editar"
                          ><Icon name="edit" /></button>
                          {canDelete && (
                            <button
                              className="action-btn-quick"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                              onClick={() => deleteDialog.open(member.id, member.fullName)}
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
              <input type="text" className="form-input" value={modal.form.fullName}
                onChange={(e) => modal.handleChange('fullName', e.target.value)} />
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
                value={modal.form.birthDate} onChange={(e) => modal.handleChange('birthDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Inicio de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membershipStart} onChange={(e) => modal.handleChange('membershipStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fin de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membershipEnd} onChange={(e) => modal.handleChange('membershipEnd', e.target.value)} />
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
                selectedDays={modal.form.attendanceDays}
                onChange={(days) => modal.handleChange('attendanceDays', days)}
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
        title="Historial de Pagos"
        actions={
          <button className="btn btn-secondary" onClick={() => setPaymentsModal(false)}>Cerrar</button>
        }
      >
        <p className="text-muted mb-2">{paymentsMember?.fullName || ''}</p>
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
                  <span className="payment-date">{formatDate(p.paymentDate)}</span>
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
        icon="trash"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </div>
  );
}
