// ============================================
// VELTRONIK RESTAURANT - INVENTORY PAGE
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { inventoryService } from '../../services';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';

const UNITS = ['unidad', 'kg', 'g', 'litros', 'ml', 'docena', 'paquete'];
const CATEGORIES = ['Carnes', 'Verduras', 'Frutas', 'Lácteos', 'Bebidas', 'Condimentos', 'Panadería', 'Limpieza', 'Descartables', 'Otros'];
const INITIAL_FORM = { name: '', unit: 'unidad', current_stock: 0, minimum_stock: 0, cost_per_unit: 0, supplier: '', category: '' };

export default function InventoryPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try { setLoading(true); setItems((await inventoryService.getAll()) || []); }
    catch { showToast('Error al cargar inventario', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = items;
    if (filterCat !== 'all') list = list.filter(i => i.category === filterCat);
    if (search) list = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, filterCat, search]);

  const lowStock = items.filter(i => i.minimum_stock > 0 && i.current_stock <= i.minimum_stock);

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };
  const openEdit = (item) => { setEditingId(item.id); setForm({ name: item.name||'', unit: item.unit||'unidad', current_stock: item.current_stock||0, minimum_stock: item.minimum_stock||0, cost_per_unit: item.cost_per_unit||0, supplier: item.supplier||'', category: item.category||'' }); setModalOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Nombre requerido', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, current_stock: parseFloat(form.current_stock)||0, minimum_stock: parseFloat(form.minimum_stock)||0, cost_per_unit: parseFloat(form.cost_per_unit)||0, category: form.category||null, supplier: form.supplier||null };
      if (editingId) { await inventoryService.update(editingId, data); showToast('Actualizado', 'success'); }
      else { await inventoryService.create(data); showToast('Creado', 'success'); }
      setModalOpen(false); loadData();
    } catch (err) { showToast(err.message||'Error', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="inventory-page">
      <PageHeader title="Inventario" subtitle="Control de insumos y stock" icon="package"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nuevo Insumo</button>} />

      {lowStock.length > 0 && (
        <div className="card mb-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem' }}>
          <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>⚠️ Stock Bajo ({lowStock.length})</h4>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {lowStock.map(i => <span key={i.id} className="badge badge-error" onClick={() => openEdit(i)} style={{cursor:'pointer'}}>{i.name}: {i.current_stock} {i.unit}</span>)}
          </div>
        </div>
      )}

      <div className="card mb-3">
        <div className="table-header">
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${filterCat === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat('all')}>Todos</button>
            {CATEGORIES.filter(c => items.some(i => i.category === c)).map(c => (
              <button key={c} className={`btn btn-sm ${filterCat === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat(c)}>{c}</button>
            ))}
          </div>
          <input type="text" className="search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:200}} />
        </div>
      </div>

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> : (
        <div className="card"><div className="table-container">
          <table className="table"><thead><tr><th>Insumo</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Costo/u</th><th>Proveedor</th><th>Estado</th><th></th></tr></thead>
            <tbody>{filtered.length === 0 ? <tr><td colSpan="8" className="text-center text-muted" style={{padding:'3rem'}}>Sin insumos</td></tr> :
              filtered.map(item => { const isLow = item.minimum_stock > 0 && item.current_stock <= item.minimum_stock; return (
                <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.category||'-'}</td>
                  <td style={isLow ? {color:'#ef4444',fontWeight:700} : {}}>{item.current_stock} {item.unit}</td>
                  <td>{item.minimum_stock > 0 ? `${item.minimum_stock} ${item.unit}` : '-'}</td>
                  <td>${item.cost_per_unit||0}</td><td>{item.supplier||'-'}</td>
                  <td><span className={`badge ${isLow ? 'badge-error' : 'badge-success'}`}>{isLow ? '⚠️ Bajo' : '✅ OK'}</span></td>
                  <td><button className="action-btn-quick action-btn-payment" onClick={() => openEdit(item)}><Icon name="edit" /></button></td>
                </tr>); })}</tbody></table>
        </div></div>
      )}

      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editingId ? 'Editar' : 'Nuevo'} Insumo</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <form onSubmit={handleSave}><div className="modal-form">
              <div className="form-group full-width"><label className="form-label">Nombre *</label>
                <input type="text" className="form-input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} required autoFocus /></div>
              <div className="form-group"><label className="form-label">Unidad</label>
                <select className="form-select" value={form.unit} onChange={e => setForm(f=>({...f,unit:e.target.value}))}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Categoría</label>
                <select className="form-select" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}><option value="">—</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Stock actual</label>
                <input type="number" className="form-input" step="0.001" min="0" value={form.current_stock} onChange={e => setForm(f=>({...f,current_stock:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Stock mínimo</label>
                <input type="number" className="form-input" step="0.001" min="0" value={form.minimum_stock} onChange={e => setForm(f=>({...f,minimum_stock:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Costo/u</label>
                <input type="number" className="form-input" step="0.01" min="0" value={form.cost_per_unit} onChange={e => setForm(f=>({...f,cost_per_unit:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Proveedor</label>
                <input type="text" className="form-input" value={form.supplier} onChange={e => setForm(f=>({...f,supplier:e.target.value}))} /></div>
            </div>
            <div className="modal-actions" style={{marginTop:'1.5rem'}}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div></form>
          </div>
        </div>
      )}
    </div>
  );
}
