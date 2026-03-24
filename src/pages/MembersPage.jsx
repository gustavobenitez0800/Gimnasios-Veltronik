// ============================================
// VELTRONIK V2 - MEMBERS PAGE
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import {
  getMembersPaginated,
  createMember,
  updateMember,
  deleteMember,
  isDniDuplicate,
  getMemberPaymentsByMember,
  getSupabaseErrorMessage,
} from '../lib/supabase';
import {
  formatDate,
  formatCurrency,
  getStatusLabel,
  getStatusBadgeClass,
  getMethodLabel,
  debounce,
} from '../lib/utils';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import Icon from '../components/Icon';

const PAGE_SIZE = 25;
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Empty form state
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

export default function MembersPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  // Data state
  const [members, setMembers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleteName, setDeleteName] = useState('');

  // Payments history
  const [paymentsModal, setPaymentsModal] = useState(false);
  const [paymentsMember, setPaymentsMember] = useState(null);
  const [memberPayments, setMemberPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ─── LOAD MEMBERS ───
  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getMembersPaginated(page, PAGE_SIZE, search);

      // Client-side status filter
      let filtered = result.data;
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
      setTotalCount(result.count);
    } catch (error) {
      console.error('Load members error:', error);
      showToast('Error al cargar socios', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, showToast]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Auto-open modal if ?action=new
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      openNewMember();
    }
  }, [searchParams]);

  // ─── SEARCH DEBOUNCE ───
  const debouncedSearch = useMemo(
    () => debounce((val) => { setSearch(val); setPage(0); }, 300),
    []
  );

  // ─── MODAL HANDLERS ───
  const openNewMember = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEditMember = (member) => {
    setEditingId(member.id);
    setForm({
      full_name: member.full_name || '',
      dni: member.dni || '',
      phone: member.phone || '',
      email: member.email || '',
      birth_date: member.birth_date || '',
      membership_start: member.membership_start || '',
      membership_end: member.membership_end || '',
      status: member.status || 'active',
      notes: member.notes || '',
      attendance_days: member.attendance_days || [],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day) => {
    setForm((prev) => {
      const days = prev.attendance_days.includes(day)
        ? prev.attendance_days.filter((d) => d !== day)
        : [...prev.attendance_days, day];
      return { ...prev, attendance_days: days };
    });
  };

  // ─── SAVE MEMBER ───
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      showToast('El nombre es requerido', 'error');
      return;
    }

    // DNI duplicate check
    if (form.dni) {
      const isDuplicate = await isDniDuplicate(form.dni, editingId);
      if (isDuplicate) {
        showToast('Ya existe un socio con este DNI', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const data = { ...form };
      // Clean empty strings
      Object.keys(data).forEach((k) => {
        if (data[k] === '') data[k] = null;
      });

      if (editingId) {
        await updateMember(editingId, data);
        showToast('Socio actualizado exitosamente', 'success');
      } else {
        await createMember(data);
        showToast('Socio creado exitosamente', 'success');
      }

      closeModal();
      loadMembers();
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── DELETE MEMBER ───
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMember(deleteId);
      showToast('Socio eliminado', 'success');
      setDeleteId(null);
      loadMembers();
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    }
  };

  // ─── PAYMENTS HISTORY ───
  const openPaymentsHistory = async (member) => {
    setPaymentsMember(member);
    setPaymentsModal(true);
    setPaymentsLoading(true);
    try {
      const payments = await getMemberPaymentsByMember(member.id);
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
    const headers = ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Inicio', 'Vencimiento'];
    const rows = members.map((m) => [
      m.full_name, m.dni || '', m.phone || '', m.email || '',
      getStatusLabel(m.status), m.membership_start || '', m.membership_end || '',
    ]);
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
      showToast('Este socio no tiene teléfono registrado', 'warning');
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

  // ─── PAGINATION ───
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="members-page">
      <PageHeader
        title="Socios"
        subtitle={`${totalCount} socios registrados`}
        icon="users"
        actions={
          <div className="flex gap-1">
            <button className="btn btn-secondary" onClick={exportCSV}>
              <Icon name="download" /> Exportar
            </button>
            <button className="btn btn-primary" onClick={openNewMember}>
              <Icon name="plus" /> Nuevo Socio
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="table-filters">
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por nombre, DNI o email..."
              onChange={(e) => debouncedSearch(e.target.value)}
              style={{ maxWidth: 340 }}
            />
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              style={{ width: 'auto' }}
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="expired">Vencidos</option>
              <option value="suspended">Suspendidos</option>
            </select>
          </div>
          <span className="text-muted">{totalCount} socios</span>
        </div>
      </div>

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
                <th>Días</th>
                <th>Vencimiento</th>
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
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>
                    No se encontraron socios
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const daysInfo = getDaysInfo(member.membership_end);
                  return (
                    <tr key={member.id}>
                      <td data-label="Nombre">
                        <strong>{member.full_name}</strong>
                      </td>
                      <td data-label="DNI">{member.dni || '-'}</td>
                      <td data-label="Teléfono">{member.phone || '-'}</td>
                      <td data-label="Estado">
                        <span className={`badge ${getStatusBadgeClass(member.status)}`}>
                          {getStatusLabel(member.status)}
                        </span>
                      </td>
                      <td data-label="Días">
                        <span className={`days-countdown ${daysInfo.className}`}>
                          {daysInfo.text}
                        </span>
                      </td>
                      <td data-label="Vencimiento">{formatDate(member.membership_end)}</td>
                      <td data-label="Acciones">
                        <div className="table-actions">
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
                            onClick={() => openEditMember(member)}
                            title="Editar"
                          ><Icon name="edit" /></button>
                          <button
                            className="action-btn-quick"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                            onClick={() => { setDeleteId(member.id); setDeleteName(member.full_name); }}
                            title="Eliminar"
                          ><Icon name="trash" /></button>
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
        {totalPages > 1 && (
          <div className="pagination-container">
            <div className="pagination-info">
              Mostrando {pageStart}-{pageEnd} de {totalCount}
            </div>
            <div className="pagination-controls">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >← Anterior</button>
              <div className="pagination-pages">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i;
                  else if (page < 3) pageNum = i;
                  else if (page > totalPages - 4) pageNum = totalPages - 5 + i;
                  else pageNum = page - 2 + i;

                  return (
                    <button
                      key={pageNum}
                      className={`page-btn ${page === pageNum ? 'active' : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── MEMBER MODAL ─── */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={closeModal}>
          <div className="modal-container member-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{editingId ? 'Editar Socio' : 'Nuevo Socio'}</h2>
            <form onSubmit={handleSave}>
              <div className="modal-form">
                <div className="form-group full-width">
                  <label className="form-label">Nombre completo *</label>
                  <input type="text" className="form-input" value={form.full_name}
                    onChange={(e) => handleFormChange('full_name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">DNI</label>
                  <input type="text" className="form-input" placeholder="12345678"
                    value={form.dni} onChange={(e) => handleFormChange('dni', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input type="tel" className="form-input" placeholder="11-1234-5678"
                    value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input"
                    value={form.email} onChange={(e) => handleFormChange('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de nacimiento</label>
                  <input type="date" className="form-input"
                    value={form.birth_date} onChange={(e) => handleFormChange('birth_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Inicio de membresía</label>
                  <input type="date" className="form-input"
                    value={form.membership_start} onChange={(e) => handleFormChange('membership_start', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin de membresía</label>
                  <input type="date" className="form-input"
                    value={form.membership_end} onChange={(e) => handleFormChange('membership_end', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={form.status}
                    onChange={(e) => handleFormChange('status', e.target.value)}>
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="expired">Vencido</option>
                    <option value="suspended">Suspendido</option>
                  </select>
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Notas</label>
                  <textarea className="form-textarea" rows="2"
                    value={form.notes} onChange={(e) => handleFormChange('notes', e.target.value)} />
                </div>

                {/* Attendance Days */}
                <div className="form-group full-width">
                  <label className="form-label">Días de Asistencia</label>
                  <div className="days-selector">
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                      <div
                        key={day}
                        className={`day-option ${form.attendance_days.includes(day) ? 'selected' : ''}`}
                        onClick={() => toggleDay(day)}
                        title={DAY_NAMES[day]}
                      >
                        {DAY_LETTERS[day]}
                      </div>
                    ))}
                  </div>
                  <div className="days-summary">
                    {form.attendance_days.length === 0
                      ? 'Seleccioná los días que asistirá el socio'
                      : `${form.attendance_days.length} día${form.attendance_days.length > 1 ? 's' : ''} seleccionado${form.attendance_days.length > 1 ? 's' : ''}`}
                  </div>
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

      {/* ─── PAYMENTS HISTORY MODAL ─── */}
      {paymentsModal && (
        <div className="modal-overlay modal-show" onClick={() => setPaymentsModal(false)}>
          <div className="modal-container payments-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">💳 Historial de Pagos</h2>
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
                    <span className={`badge ${p.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                      {p.status === 'paid' ? 'Pagado' : p.status}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setPaymentsModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRMATION ─── */}
      <ConfirmDialog
        open={!!deleteId}
        title="Eliminar Socio"
        message={`¿Estás seguro de eliminar a "${deleteName}"? Esta acción no se puede deshacer.`}
        icon="🗑️"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
