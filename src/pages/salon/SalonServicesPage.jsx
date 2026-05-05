// ============================================
// VELTRONIK SALON - SERVICES PAGE (Catálogo)
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { salonServiceService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader, ConfirmDialog } from '../../components/Layout';
import Icon from '../../components/Icon';

const CATEGORIES = ['Corte', 'Color', 'Tratamiento', 'Peinado', 'Barba', 'Manos', 'Pies', 'Depilación', 'Maquillaje', 'Otro'];
const COLOR_OPTIONS = ['#0EA5E9', '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E', '#EF4444', '#06B6D4', '#F97316'];
const INITIAL_FORM = { name: '', category: 'Corte', duration_min: 30, price: '', cost: '', color: '#0EA5E9', description: '', is_active: true };

export default function SalonServicesPage() {
  const { showToast } = useToast();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const loadData = useCallback(async () => {
    try { setLoading(true); setServices((await salonServiceService.getAll()) || []); }
    catch { showToast('Error al cargar servicios', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = services;
    if (filterCat !== 'all') list = list.filter(s => s.category === filterCat);
    if (search) list = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [services, filterCat, search]);

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({ name: s.name||'', category: s.category||'Corte', duration_min: s.duration_min||30, price: s.price||'', cost: s.cost||'', color: s.color||'#0EA5E9', description: s.description||'', is_active: s.is_active !== false });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Nombre requerido', 'error'); return; }
    if (!form.price || parseFloat(form.price) <= 0) { showToast('Precio requerido', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, price: parseFloat(form.price)||0, cost: parseFloat(form.cost)||0, duration_min: parseInt(form.duration_min)||30 };
      if (editingId) { await salonServiceService.update(editingId, data); showToast('Servicio actualizado', 'success'); }
      else { await salonServiceService.create(data); showToast('Servicio creado', 'success'); }
      setModalOpen(false); loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await salonServiceService.delete(deleteId); showToast('Servicio eliminado', 'success'); setDeleteId(null); loadData(); }
    catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  return (
    <div className="salon-services-page">
      <PageHeader title="Servicios" subtitle="Catálogo de servicios y precios" icon="list"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nuevo Servicio</button>} />

      <div className="card mb-3">
        <div className="table-header">
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${filterCat === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat('all')}>Todos</button>
            {CATEGORIES.filter(c => services.some(s => s.category === c)).map(c => (
              <button key={c} className={`btn btn-sm ${filterCat === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat(c)}>{c}</button>
            ))}
          </div>
          <input type="text" className="search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
      </div>

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> : (
        <div className="card"><div className="table-container">
          <table className="table"><thead><tr><th>Servicio</th><th>Categoría</th><th>Duración</th><th>Precio</th><th>Costo</th><th>Margen</th><th>Estado</th><th></th></tr></thead>
            <tbody>{filtered.length === 0 ? <tr><td colSpan="8" className="text-center text-muted" style={{ padding: '3rem' }}>Sin servicios — creá tu primer servicio</td></tr> :
              filtered.map(s => {
                const margin = s.cost > 0 ? Math.round(((s.price - s.cost) / s.price) * 100) : null;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-1">
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color || '#0EA5E9', flexShrink: 0 }} />
                        <strong>{s.name}</strong>
                      </div>
                      {s.description && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.description}</div>}
                    </td>
                    <td><span className="badge badge-neutral">{s.category || '-'}</span></td>
                    <td>⏱️ {s.duration_min} min</td>
                    <td><strong>{formatCurrency(s.price)}</strong></td>
                    <td>{s.cost > 0 ? formatCurrency(s.cost) : '-'}</td>
                    <td>{margin !== null ? <span className={`badge ${margin > 50 ? 'badge-success' : margin > 20 ? 'badge-warning' : 'badge-error'}`}>{margin}%</span> : '-'}</td>
                    <td><span className={`badge ${s.is_active ? 'badge-success' : 'badge-error'}`}>{s.is_active ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="action-btn-quick action-btn-payment" onClick={() => openEdit(s)}><Icon name="edit" /></button>
                        <button className="action-btn-quick" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} onClick={() => setDeleteId(s.id)}><Icon name="trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody></table>
        </div></div>
      )}

      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editingId ? 'Editar' : 'Nuevo'} Servicio</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <form onSubmit={handleSave}><div className="modal-form">
              <div className="form-group full-width"><label className="form-label">Nombre *</label>
                <input type="text" className="form-input" placeholder="Ej: Corte Caballero" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
              <div className="form-group"><label className="form-label">Categoría</label>
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Duración (min)</label>
                <input type="number" className="form-input" min="5" max="480" step="5" value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Precio *</label>
                <input type="number" className="form-input" step="0.01" min="0" placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Costo (insumos)</label>
                <input type="number" className="form-input" step="0.01" min="0" placeholder="0.00" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Color agenda</label>
                <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div></div>
              <div className="form-group full-width"><label className="form-label">Descripción</label>
                <textarea className="form-textarea" rows="2" placeholder="Descripción opcional..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              {editingId && (
                <div className="form-group"><label className="form-label">Estado</label>
                  <select className="form-select" value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                    <option value="true">✅ Activo</option><option value="false">❌ Inactivo</option>
                  </select></div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <><span className="spinner" /> Guardando...</> : 'Guardar'}</button>
            </div></form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Eliminar Servicio" message="¿Estás seguro de eliminar este servicio?"
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
