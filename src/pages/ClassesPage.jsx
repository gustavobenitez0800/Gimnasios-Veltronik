// ============================================
// VELTRONIK V2 - CLASSES PAGE
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import {
  getClasses,
  createClass,
  updateClass,
  deleteClass,
  getBookingsForClass,
  getSupabaseErrorMessage,
} from '../lib/supabase';
import { formatTime, getDayName } from '../lib/utils';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import Icon from '../components/Icon';

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORS = ['#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const INITIAL_FORM = {
  name: '', instructor: '', start_time: '', end_time: '',
  day_of_week: '', capacity: 20, room: '', color: '#0EA5E9', description: '', status: 'active',
};

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ClassesPage() {
  const { showToast } = useToast();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('calendar');
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Detail modal
  const [detailModal, setDetailModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState(null);

  const loadClasses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getClasses();
      setClasses(data || []);
    } catch (error) {
      showToast('Error al cargar clases', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // Week navigation
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${weekStart.getDate()} ${months[weekStart.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]}`;
  }, [weekStart]);

  const changeWeek = (dir) => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  // Handlers
  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };

  const openEdit = (cls) => {
    setEditingId(cls.id);
    setForm({
      name: cls.name || '', instructor: cls.instructor || '',
      start_time: cls.start_time || '', end_time: cls.end_time || '',
      day_of_week: cls.day_of_week?.toString() || '', capacity: cls.capacity || 20,
      room: cls.room || '', color: cls.color || '#0EA5E9',
      description: cls.description || '', status: cls.status || 'active',
    });
    setModalOpen(true);
  };

  const openDetail = async (cls, date) => {
    setSelectedClass(cls);
    setDetailModal(true);
    setBookingsLoading(true);
    try {
      const data = await getBookingsForClass(cls.id, date);
      setBookings(data || []);
    } catch { setBookings([]); }
    finally { setBookingsLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('El nombre es requerido', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, day_of_week: parseInt(form.day_of_week), capacity: parseInt(form.capacity) };
      Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });

      if (editingId) {
        await updateClass(editingId, data);
        showToast('Clase actualizada', 'success');
      } else {
        await createClass(data);
        showToast('Clase creada exitosamente', 'success');
      }
      setModalOpen(false);
      loadClasses();
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteClass(deleteId);
      showToast('Clase eliminada', 'success');
      setDeleteId(null);
      setDetailModal(false);
      loadClasses();
    } catch (error) { showToast(getSupabaseErrorMessage(error), 'error'); }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="classes-page">
      <PageHeader title="Clases y Actividades" subtitle="Gestión de horarios y reservas" icon="calendar"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nueva Clase</button>} />

      {/* Calendar Navigation */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="calendar-nav">
            <button className="btn btn-secondary btn-sm" onClick={() => changeWeek(-1)}>← Anterior</button>
            <span className="current-week">{weekLabel}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => changeWeek(1)}>Siguiente →</button>
          </div>
          <div className="view-toggle">
            <button className={`btn btn-sm ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('calendar')}>📅 Calendario</button>
            <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('list')}>📋 Lista</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-loading"><span className="spinner" /> Cargando clases...</div>
      ) : view === 'calendar' ? (
        /* Weekly Calendar */
        <div className="card">
          <div className="weekly-calendar">
            {weekDates.map((date, i) => {
              const dayOfWeek = date.getDay();
              const isToday = date.getTime() === today.getTime();
              const dayClasses = classes.filter(c => c.day_of_week === dayOfWeek && c.status === 'active');

              return (
                <div key={i} className="day-column">
                  <div className={`day-header ${isToday ? 'today' : ''}`}>
                    <div className="day-name">{DAY_NAMES_SHORT[dayOfWeek]}</div>
                    <div className="day-date">{date.getDate()}/{date.getMonth() + 1}</div>
                  </div>
                  <div className="day-classes">
                    {dayClasses.length > 0 ? dayClasses.map(cls => (
                      <div key={cls.id} className="class-card"
                        style={{ borderLeftColor: cls.color || '#0EA5E9' }}
                        onClick={() => openDetail(cls, date.toISOString().split('T')[0])}>
                        <div className="class-time">{formatTime(cls.start_time)} - {formatTime(cls.end_time)}</div>
                        <div className="class-name">{cls.name}</div>
                        <div className="class-instructor">{cls.instructor || 'Sin instructor'}</div>
                        <div className="class-spots available">👥 {cls.capacity || 20} cupos</div>
                      </div>
                    )) : <div className="no-classes">Sin clases</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Clase</th><th>Instructor</th><th>Día</th><th>Horario</th><th>Cupos</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '3rem' }}>No hay clases registradas</td></tr>
                ) : classes.map(cls => (
                  <tr key={cls.id}>
                    <td><div className="flex items-center gap-1">
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: cls.color || '#0EA5E9', display: 'inline-block' }} />
                      <strong>{cls.name}</strong>
                    </div></td>
                    <td>{cls.instructor || '-'}</td>
                    <td>{getDayName(cls.day_of_week)}</td>
                    <td>{formatTime(cls.start_time)} - {formatTime(cls.end_time)}</td>
                    <td>{cls.capacity || 20}</td>
                    <td><span className={`badge ${cls.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                      {cls.status === 'active' ? 'Activa' : 'Inactiva'}</span></td>
                    <td><div className="table-actions">
                      <button className="action-btn-quick action-btn-payment" onClick={() => openEdit(cls)}><Icon name="edit" /></button>
                      <button className="action-btn-quick" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                        onClick={() => setDeleteId(cls.id)}><Icon name="trash" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Class CRUD Modal */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editingId ? 'Editar Clase' : 'Nueva Clase'}</h2>
            <form onSubmit={handleSave}>
              <div className="modal-form">
                <div className="form-group full-width">
                  <label className="form-label">Nombre *</label>
                  <input type="text" className="form-input" placeholder="Ej: Spinning, Yoga"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Instructor</label>
                  <input type="text" className="form-input" value={form.instructor}
                    onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Día *</label>
                  <select className="form-select" value={form.day_of_week}
                    onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))} required>
                    <option value="">Seleccionar</option>
                    {[1,2,3,4,5,6,0].map(d => <option key={d} value={d}>{getDayName(d)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Hora inicio *</label>
                  <input type="time" className="form-input" value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora fin *</label>
                  <input type="time" className="form-input" value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacidad</label>
                  <input type="number" className="form-input" min="1" max="100" value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sala/Lugar</label>
                  <input type="text" className="form-input" value={form.room}
                    onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Color</label>
                  <div className="class-color-picker">
                    {COLORS.map(c => (
                      <div key={c} className={`color-option ${form.color === c ? 'selected' : ''}`}
                        style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                    ))}
                  </div>
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Descripción</label>
                  <textarea className="form-textarea" rows="2" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" /> Guardando...</> : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && selectedClass && (
        <div className="modal-overlay modal-show" onClick={() => setDetailModal(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title" style={{ textAlign: 'left' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: selectedClass.color, display: 'inline-block', marginRight: 8 }} />
              {selectedClass.name}
            </h2>
            <div style={{ marginBottom: '1rem' }}>
              <p className="text-muted mb-1">📅 {getDayName(selectedClass.day_of_week)} · {formatTime(selectedClass.start_time)} - {formatTime(selectedClass.end_time)}</p>
              <p className="text-muted mb-1">👤 {selectedClass.instructor || 'Sin instructor'}</p>
              <p className="text-muted">👥 {selectedClass.capacity || 20} cupos · {selectedClass.room || 'Sin sala'}</p>
            </div>
            <h3 style={{ fontSize: 'var(--font-size-sm)', marginBottom: '0.5rem' }}>Reservas</h3>
            {bookingsLoading ? (
              <div className="text-center text-muted" style={{ padding: '1rem' }}><span className="spinner" /> Cargando...</div>
            ) : bookings.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: '1rem' }}>Sin reservas para este día</div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {bookings.map(b => (
                  <div key={b.id} className="payment-history-item">
                    <span>{b.member?.full_name || 'Socio'}</span>
                    <span className={`badge ${b.status === 'attended' ? 'badge-success' : b.status === 'cancelled' ? 'badge-error' : 'badge-neutral'}`}>
                      {b.status === 'attended' ? 'Asistió' : b.status === 'cancelled' ? 'Cancelada' : 'Reservada'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setDetailModal(false)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => { setDetailModal(false); openEdit(selectedClass); }}>Editar</button>
              <button className="btn btn-danger" onClick={() => { setDeleteId(selectedClass.id); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Eliminar Clase" message="¿Estás seguro de eliminar esta clase?"
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
