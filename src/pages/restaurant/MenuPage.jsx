// ============================================
// VELTRONIK RESTAURANT - MENU PAGE
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { menuService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader, ConfirmDialog } from '../../components/Layout';
import Icon from '../../components/Icon';

const INITIAL_FORM = {
  name: '', description: '', price: '', cost: '', category_id: '',
  prep_time_min: 15, is_available: true, is_featured: false, tags: [], allergens: [],
};

const ALLERGEN_OPTIONS = ['Gluten', 'Lactosa', 'Frutos secos', 'Huevo', 'Soja', 'Mariscos', 'Pescado'];
const TAG_OPTIONS = ['Vegano', 'Vegetariano', 'Sin TACC', 'Picante', 'Light', 'Sin azúcar', 'Nuevo'];

export default function MenuPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Category modal
  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🍽️');

  // Delete
  const [deleteId, setDeleteId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [i, c] = await Promise.all([menuService.getItems(), menuService.getCategories()]);
      setItems(i || []);
      setCategories(c || []);
    } catch { showToast('Error al cargar menú', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (filter !== 'all') list = list.filter(i => i.category_id === filter);
    if (search) list = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, filter, search]);

  // Stats
  const stats = {
    total: items.length,
    available: items.filter(i => i.is_available).length,
    featured: items.filter(i => i.is_featured).length,
    avgMargin: items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + ((i.price - (i.cost || 0)) / i.price * 100), 0) / items.length)
      : 0,
  };

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '', description: item.description || '',
      price: item.price || '', cost: item.cost || '',
      category_id: item.category_id || '', prep_time_min: item.prep_time_min || 15,
      is_available: item.is_available ?? true, is_featured: item.is_featured ?? false,
      tags: item.tags || [], allergens: item.allergens || [],
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.price === '') { showToast('Nombre y precio son requeridos', 'error'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        price: form.price !== '' ? parseFloat(form.price) : 0,
        cost: form.cost !== '' ? parseFloat(form.cost) : 0,
        prep_time_min: form.prep_time_min !== '' ? parseInt(form.prep_time_min) : 15,
        category_id: form.category_id || null,
      };
      if (editingId) {
        await menuService.updateItem(editingId, data);
        showToast('Plato actualizado', 'success');
      } else {
        await menuService.createItem(data);
        showToast('Plato creado', 'success');
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
      await menuService.deleteItem(deleteId);
      showToast('Plato eliminado', 'success');
      setDeleteId(null);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const toggleAvailability = async (item) => {
    try {
      await menuService.updateItem(item.id, { is_available: !item.is_available });
      showToast(item.is_available ? 'Plato desactivado' : 'Plato activado', 'success');
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await menuService.createCategory({ name: newCatName.trim(), icon: newCatIcon });
      showToast('Categoría creada', 'success');
      setNewCatName('');
      setCatModal(false);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const toggleTag = (arr, val) => arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  return (
    <div className="menu-page">
      <PageHeader title="Carta / Menú" subtitle="Gestión de platos y precios" icon="list"
        actions={
          <div className="flex gap-1">
            <button className="btn btn-secondary" onClick={() => setCatModal(true)}>+ Categoría</button>
            <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nuevo Plato</button>
          </div>
        }
      />

      {/* Stats */}
      <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary">📋</div>
          <div className="stat-content"><div className="stat-value">{stats.total}</div><div className="stat-label">Platos</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-success">✅</div>
          <div className="stat-content"><div className="stat-value">{stats.available}</div><div className="stat-label">Disponibles</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">⭐</div>
          <div className="stat-content"><div className="stat-value">{stats.featured}</div><div className="stat-label">Destacados</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-accent">📈</div>
          <div className="stat-content"><div className="stat-value">{stats.avgMargin}%</div><div className="stat-label">Margen Prom.</div></div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>
              Todos ({items.length})
            </button>
            {categories.map(c => (
              <button key={c.id} className={`btn btn-sm ${filter === c.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(c.id)}>
                {c.icon || '📁'} {c.name} ({items.filter(i => i.category_id === c.id).length})
              </button>
            ))}
          </div>
          <div className="search-box" style={{ minWidth: 200 }}>
            <input type="text" className="search-input" placeholder="Buscar plato..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-loading"><span className="spinner" /> Cargando menú...</div>
      ) : filteredItems.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🍽️</div>
          <h3>No hay platos en el menú</h3>
          <p className="text-muted mb-2">Creá tu primer plato para arrancar</p>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Crear Plato</button>
        </div>
      ) : (
        <div className="menu-grid">
          {filteredItems.map(item => {
            const margin = item.cost ? Math.round((item.price - item.cost) / item.price * 100) : null;
            return (
              <div key={item.id} className={`menu-item-card ${!item.is_available ? 'menu-item-unavailable' : ''}`}>
                <div className="menu-item-header">
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-1">
                      <h4 className="menu-item-name">{item.name}</h4>
                      {item.is_featured && <span title="Destacado" style={{ fontSize: '0.8rem' }}>⭐</span>}
                    </div>
                    {item.category?.name && (
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        {item.category.icon || '📁'} {item.category.name}
                      </span>
                    )}
                  </div>
                  <div className="menu-item-price">{formatCurrency(item.price)}</div>
                </div>
                {item.description && <p className="menu-item-desc">{item.description}</p>}
                <div className="menu-item-footer">
                  <div className="menu-item-meta">
                    <span>⏱️ {item.prep_time_min} min</span>
                    {margin !== null && <span className={margin > 50 ? 'text-success' : margin > 25 ? 'text-warning' : 'text-danger'}>📊 {margin}%</span>}
                    {item.tags?.length > 0 && item.tags.map(t => <span key={t} className="badge badge-neutral" style={{ fontSize: '0.6rem' }}>{t}</span>)}
                  </div>
                  <div className="menu-item-actions">
                    <button className="action-btn-quick" title={item.is_available ? 'Desactivar' : 'Activar'}
                      style={{ background: item.is_available ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: item.is_available ? '#22c55e' : '#ef4444' }}
                      onClick={() => toggleAvailability(item)}>
                      {item.is_available ? '✅' : '⛔'}
                    </button>
                    <button className="action-btn-quick action-btn-payment" onClick={() => openEdit(item)}><Icon name="edit" /></button>
                    <button className="action-btn-quick" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                      onClick={() => setDeleteId(item.id)}><Icon name="trash" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Menu Item Modal */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editingId ? 'Editar Plato' : 'Nuevo Plato'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-form">
                <div className="form-group full-width">
                  <label className="form-label">Nombre *</label>
                  <input type="text" className="form-input" placeholder="Ej: Milanesa napolitana"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Descripción</label>
                  <textarea className="form-textarea" rows="2" placeholder="Descripción del plato..."
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Precio de venta *</label>
                  <input type="number" className="form-input" step="0.01" min="0" placeholder="0.00"
                    value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Costo</label>
                  <input type="number" className="form-input" step="0.01" min="0" placeholder="0.00"
                    value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                    <option value="">Sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon || '📁'} {c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tiempo prep. (min)</label>
                  <input type="number" className="form-input" min="1" max="120"
                    value={form.prep_time_min} onChange={e => setForm(f => ({ ...f, prep_time_min: e.target.value }))} />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Etiquetas</label>
                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                    {TAG_OPTIONS.map(tag => (
                      <button key={tag} type="button"
                        className={`btn btn-sm ${form.tags.includes(tag) ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setForm(f => ({ ...f, tags: toggleTag(f.tags, tag) }))}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Alérgenos</label>
                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                    {ALLERGEN_OPTIONS.map(a => (
                      <button key={a} type="button"
                        className={`btn btn-sm ${form.allergens.includes(a) ? 'btn-danger' : 'btn-secondary'}`}
                        onClick={() => setForm(f => ({ ...f, allergens: toggleTag(f.allergens, a) }))}>
                        ⚠️ {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={form.is_available}
                      onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))} />
                    Disponible
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={form.is_featured}
                      onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} />
                    ⭐ Destacado
                  </label>
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

      {/* Category Modal */}
      {catModal && (
        <div className="modal-overlay modal-show" onClick={() => setCatModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Nueva Categoría</h2>
              <button type="button" onClick={() => setCatModal(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Nombre</label>
              <input type="text" className="form-input" placeholder="Ej: Entradas, Platos Principales, Postres"
                value={newCatName} onChange={e => setNewCatName(e.target.value)} autoFocus />
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Ícono</label>
              <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                {['🥗', '🍝', '🥩', '🍕', '🍔', '🍣', '🍰', '🥤', '🍷', '🍺', '☕', '🍽️'].map(e => (
                  <button key={e} type="button"
                    className={`btn btn-sm ${newCatIcon === e ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewCatIcon(e)} style={{ fontSize: '1.2rem', padding: '0.25rem 0.5rem' }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setCatModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateCategory}>Crear</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Eliminar Plato" message="¿Estás seguro de eliminar este plato del menú?"
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
