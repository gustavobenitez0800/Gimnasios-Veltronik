// ============================================
// VELTRONIK RESTAURANT - TABLES PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { tableService, areaService } from '../../services';
import { PageHeader, ConfirmDialog } from '../../components/Layout';
import Icon from '../../components/Icon';

const TABLE_SHAPES = [
  { id: 'square', label: 'Cuadrada', emoji: '⬛' },
  { id: 'round', label: 'Redonda', emoji: '⚫' },
  { id: 'rectangular', label: 'Rectangular', emoji: '🟫' },
];

const STATUS_CONFIG = {
  available: { label: 'Libre', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  occupied: { label: 'Ocupada', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  reserved: { label: 'Reservada', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  cleaning: { label: 'Limpieza', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
};

const INITIAL_FORM = { table_number: '', capacity: 4, area_id: '', shape: 'square', status: 'available' };

export default function TablesPage() {
  const { showToast } = useToast();
  const [tables, setTables] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid'); // grid, list

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Area modal
  const [areaModal, setAreaModal] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');

  // Delete
  const [deleteId, setDeleteId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [t, a] = await Promise.all([tableService.getAll(), areaService.getAll()]);
      setTables(t || []);
      setAreas(a || []);
    } catch { showToast('Error al cargar mesas', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      table_number: t.table_number || '',
      capacity: t.capacity || 4,
      area_id: t.area_id || '',
      shape: t.shape || 'square',
      status: t.status || 'available',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.table_number.trim()) { showToast('Ingresá el número de mesa', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, capacity: parseInt(form.capacity) || 4, area_id: form.area_id || null };
      if (editingId) {
        await tableService.update(editingId, data);
        showToast('Mesa actualizada', 'success');
      } else {
        await tableService.create(data);
        showToast('Mesa creada', 'success');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await tableService.delete(deleteId);
      showToast('Mesa eliminada', 'success');
      setDeleteId(null);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const handleStatusChange = async (tableId, newStatus) => {
    try {
      await tableService.update(tableId, { status: newStatus });
      showToast('Estado actualizado', 'success');
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return;
    try {
      await areaService.create({ name: newAreaName.trim() });
      showToast('Área creada', 'success');
      setNewAreaName('');
      setAreaModal(false);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  // Stats
  const stats = {
    total: tables.length,
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
  };

  return (
    <div className="tables-page">
      <PageHeader title="Mesas" subtitle="Gestión del salón" icon="grid"
        actions={
          <div className="flex gap-1">
            <button className="btn btn-secondary" onClick={() => setAreaModal(true)}>+ Área</button>
            <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nueva Mesa</button>
          </div>
        }
      />

      {/* Stats */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Total', value: stats.total, icon: '🍽️', color: 'stat-icon-primary' },
          { label: 'Libres', value: stats.available, icon: '✅', color: 'stat-icon-success' },
          { label: 'Ocupadas', value: stats.occupied, icon: '🔴', color: '' },
          { label: 'Reservadas', value: stats.reserved, icon: '📅', color: 'stat-icon-warning' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className={`stat-icon ${s.color}`} style={!s.color ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444' } : undefined}>{s.icon}</div>
            <div className="stat-content">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* View Toggle */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="flex gap-1">
            {areas.map(a => (
              <span key={a.id} className="badge badge-neutral">{a.name}</span>
            ))}
            {areas.length === 0 && <span className="text-muted" style={{ fontSize: '0.8rem' }}>Sin áreas — crea una para organizar tus mesas</span>}
          </div>
          <div className="view-toggle">
            <button className={`btn btn-sm ${view === 'grid' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('grid')}>🗺️ Mapa</button>
            <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('list')}>📋 Lista</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-loading"><span className="spinner" /> Cargando mesas...</div>
      ) : tables.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🍽️</div>
          <h3>No hay mesas registradas</h3>
          <p className="text-muted mb-2">Creá tu primera mesa para empezar</p>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Crear Mesa</button>
        </div>
      ) : view === 'grid' ? (
        /* Grid / Map View */
        <div className="tables-grid">
          {tables.map(table => {
            const sc = STATUS_CONFIG[table.status] || STATUS_CONFIG.available;
            return (
              <div key={table.id}
                className={`table-card table-${table.shape}`}
                style={{ borderColor: sc.color, background: sc.bg }}
                onClick={() => openEdit(table)}>
                <div className="table-card-number" style={{ color: sc.color }}>
                  {table.table_number}
                </div>
                <div className="table-card-info">
                  <span className="table-card-capacity">👥 {table.capacity}</span>
                  {table.area?.name && <span className="table-card-area">{table.area.name}</span>}
                </div>
                <span className="table-card-status" style={{ color: sc.color }}>{sc.label}</span>
                {/* Quick status buttons */}
                <div className="table-card-actions" onClick={e => e.stopPropagation()}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    key !== table.status && (
                      <button key={key} className="table-status-btn" title={cfg.label}
                        style={{ color: cfg.color, background: cfg.bg }}
                        onClick={() => handleStatusChange(table.id, key)}>
                        {cfg.label.charAt(0)}
                      </button>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Mesa</th><th>Capacidad</th><th>Área</th><th>Forma</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {tables.map(t => {
                  const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.available;
                  return (
                    <tr key={t.id}>
                      <td><strong>{t.table_number}</strong></td>
                      <td>👥 {t.capacity}</td>
                      <td>{t.area?.name || '-'}</td>
                      <td>{TABLE_SHAPES.find(s => s.id === t.shape)?.emoji || '⬛'} {TABLE_SHAPES.find(s => s.id === t.shape)?.label || t.shape}</td>
                      <td><span className="badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span></td>
                      <td>
                        <div className="table-actions">
                          <button className="action-btn-quick action-btn-payment" onClick={() => openEdit(t)}><Icon name="edit" /></button>
                          <button className="action-btn-quick" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                            onClick={() => setDeleteId(t.id)}><Icon name="trash" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table CRUD Modal */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editingId ? 'Editar Mesa' : 'Nueva Mesa'}</h2>
            <form onSubmit={handleSave}>
              <div className="modal-form">
                <div className="form-group">
                  <label className="form-label">Número / Nombre *</label>
                  <input type="text" className="form-input" placeholder="Ej: 1, A1, Terraza 3"
                    value={form.table_number} onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacidad</label>
                  <input type="number" className="form-input" min="1" max="20"
                    value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Área</label>
                  <select className="form-select" value={form.area_id} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))}>
                    <option value="">Sin área</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Forma</label>
                  <select className="form-select" value={form.shape} onChange={e => setForm(f => ({ ...f, shape: e.target.value }))}>
                    {TABLE_SHAPES.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                  </select>
                </div>
                {editingId && (
                  <div className="form-group full-width">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                {editingId && <button type="button" className="btn btn-danger" onClick={() => { setModalOpen(false); setDeleteId(editingId); }}>Eliminar</button>}
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" /> Guardando...</> : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Area Modal */}
      {areaModal && (
        <div className="modal-overlay modal-show" onClick={() => setAreaModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 className="modal-title">Nueva Área</h2>
            <div className="form-group mb-2">
              <label className="form-label">Nombre del área</label>
              <input type="text" className="form-input" placeholder="Ej: Salón Principal, Terraza, VIP"
                value={newAreaName} onChange={e => setNewAreaName(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setAreaModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateArea}>Crear Área</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Eliminar Mesa" message="¿Estás seguro de eliminar esta mesa?"
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
