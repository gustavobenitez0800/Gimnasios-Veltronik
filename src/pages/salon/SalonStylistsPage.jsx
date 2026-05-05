// ============================================
// VELTRONIK SALON - STYLISTS PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { salonStylistService } from '../../services';
import { PageHeader, ConfirmDialog } from '../../components/Layout';
import Icon from '../../components/Icon';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLOR_OPTIONS = ['#8B5CF6', '#EC4899', '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4', '#F97316'];
const INITIAL_FORM = { full_name: '', phone: '', email: '', commission_percent: 0, color: '#8B5CF6', is_active: true, schedule: { 1: ['09:00','18:00'], 2: ['09:00','18:00'], 3: ['09:00','18:00'], 4: ['09:00','18:00'], 5: ['09:00','18:00'] } };

export default function SalonStylistsPage() {
  const { showToast } = useToast();
  const [stylists, setStylists] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const loadData = useCallback(async () => {
    try { setLoading(true); setStylists((await salonStylistService.getAll()) || []); }
    catch { showToast('Error al cargar estilistas', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      full_name: s.full_name||'', phone: s.phone||'', email: s.email||'',
      commission_percent: s.commission_percent||0, color: s.color||'#8B5CF6',
      is_active: s.is_active !== false,
      schedule: s.schedule || INITIAL_FORM.schedule,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { showToast('Nombre requerido', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, commission_percent: parseFloat(form.commission_percent) || 0 };
      if (editingId) { await salonStylistService.update(editingId, data); showToast('Estilista actualizado/a', 'success'); }
      else { await salonStylistService.create(data); showToast('Estilista creado/a', 'success'); }
      setModalOpen(false); loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await salonStylistService.delete(deleteId); showToast('Estilista eliminado/a', 'success'); setDeleteId(null); loadData(); }
    catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const toggleDay = (day) => {
    setForm(f => {
      const schedule = { ...f.schedule };
      if (schedule[day]) { delete schedule[day]; }
      else { schedule[day] = ['09:00', '18:00']; }
      return { ...f, schedule };
    });
  };

  const updateScheduleTime = (day, index, value) => {
    setForm(f => {
      const schedule = { ...f.schedule };
      const times = [...(schedule[day] || ['09:00', '18:00'])];
      times[index] = value;
      schedule[day] = times;
      return { ...f, schedule };
    });
  };

  return (
    <div className="salon-stylists-page">
      <PageHeader title="Estilistas" subtitle="Equipo y comisiones" icon="userCog"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nuevo Estilista</button>} />

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> : stylists.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>💇</div>
          <h3>Sin estilistas registrados</h3>
          <p className="text-muted mb-2">Agregá a tu equipo para empezar a agendar turnos</p>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Agregar Estilista</button>
        </div>
      ) : (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {stylists.map(s => (
            <div key={s.id} className="card" style={{ padding: '1.25rem', cursor: 'pointer', borderLeft: `4px solid ${s.color || '#8B5CF6'}` }} onClick={() => openEdit(s)}>
              <div className="flex items-center gap-1" style={{ marginBottom: '0.75rem' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: s.color || '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem' }}>
                  {(s.full_name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.full_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.phone || s.email || 'Sin contacto'}</div>
                </div>
                <span className={`badge ${s.is_active ? 'badge-success' : 'badge-error'}`} style={{ marginLeft: 'auto' }}>{s.is_active ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div className="flex items-center gap-1" style={{ fontSize: '0.8rem' }}>
                <span>💰 Comisión: <strong>{s.commission_percent || 0}%</strong></span>
              </div>
              {s.schedule && (
                <div className="flex gap-1" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  {DAY_LABELS.map((label, i) => (
                    <span key={i} className={`badge ${s.schedule[i] ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{label}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editingId ? 'Editar' : 'Nuevo/a'} Estilista</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <form onSubmit={handleSave}><div className="modal-form">
              <div className="form-group full-width"><label className="form-label">Nombre completo *</label>
                <input type="text" className="form-input" placeholder="Ej: María López" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required autoFocus /></div>
              <div className="form-group"><label className="form-label">Teléfono</label>
                <input type="tel" className="form-input" placeholder="+54 9 ..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Comisión (%)</label>
                <input type="number" className="form-input" min="0" max="100" step="0.5" value={form.commission_percent} onChange={e => setForm(f => ({ ...f, commission_percent: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Color agenda</label>
                <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div></div>
              {editingId && (
                <div className="form-group"><label className="form-label">Estado</label>
                  <select className="form-select" value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                    <option value="true">✅ Activo</option><option value="false">❌ Inactivo</option>
                  </select></div>
              )}

              {/* Schedule */}
              <div className="form-group full-width">
                <label className="form-label">Horario semanal</label>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {DAY_LABELS.map((label, day) => (
                    <div key={day} className="flex items-center gap-1" style={{ fontSize: '0.85rem' }}>
                      <button type="button" className={`btn btn-sm ${form.schedule[day] ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ width: 50 }} onClick={() => toggleDay(day)}>{label}</button>
                      {form.schedule[day] ? (
                        <>
                          <input type="time" className="form-input" style={{ maxWidth: 110 }} value={form.schedule[day][0]}
                            onChange={e => updateScheduleTime(day, 0, e.target.value)} />
                          <span>a</span>
                          <input type="time" className="form-input" style={{ maxWidth: 110 }} value={form.schedule[day][1]}
                            onChange={e => updateScheduleTime(day, 1, e.target.value)} />
                        </>
                      ) : <span className="text-muted">Libre</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              {editingId && <button type="button" className="btn btn-danger" onClick={() => { setModalOpen(false); setDeleteId(editingId); }}>Eliminar</button>}
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <><span className="spinner" /> Guardando...</> : 'Guardar'}</button>
            </div></form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Eliminar Estilista" message="¿Estás seguro? Se perderá la asociación con turnos."
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
