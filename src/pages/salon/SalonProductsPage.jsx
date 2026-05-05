// ============================================
// VELTRONIK SALON - PRODUCTS PAGE (Inventario)
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { salonProductService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';

const CATEGORIES = ['Tintura', 'Shampoo', 'Acondicionador', 'Tratamiento', 'Styling', 'Herramientas', 'Descartables', 'Otro'];
const INITIAL_FORM = { name: '', brand: '', category: '', current_stock: 0, minimum_stock: 0, cost: 0, sale_price: 0, is_for_sale: false };

export default function SalonProductsPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try { setLoading(true); setProducts((await salonProductService.getAll()) || []); }
    catch { showToast('Error al cargar productos', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = products;
    if (filterCat !== 'all') list = list.filter(p => p.category === filterCat);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand||'').toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products, filterCat, search]);

  const lowStock = products.filter(p => p.minimum_stock > 0 && p.current_stock <= p.minimum_stock);

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };
  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({ name: p.name||'', brand: p.brand||'', category: p.category||'', current_stock: p.current_stock||0, minimum_stock: p.minimum_stock||0, cost: p.cost||0, sale_price: p.sale_price||0, is_for_sale: p.is_for_sale||false });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Nombre requerido', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, current_stock: parseInt(form.current_stock)||0, minimum_stock: parseInt(form.minimum_stock)||0, cost: parseFloat(form.cost)||0, sale_price: parseFloat(form.sale_price)||0, category: form.category||null, brand: form.brand||null };
      if (editingId) { await salonProductService.update(editingId, data); showToast('Producto actualizado', 'success'); }
      else { await salonProductService.create(data); showToast('Producto creado', 'success'); }
      setModalOpen(false); loadData();
    } catch (err) { showToast(err.message||'Error', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="salon-products-page">
      <PageHeader title="Productos" subtitle="Stock de insumos profesionales" icon="package"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nuevo Producto</button>} />

      {lowStock.length > 0 && (
        <div className="card mb-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem' }}>
          <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>⚠️ Stock Bajo ({lowStock.length})</h4>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {lowStock.map(p => <span key={p.id} className="badge badge-error" onClick={() => openEdit(p)} style={{ cursor: 'pointer' }}>{p.name}: {p.current_stock} u</span>)}
          </div>
        </div>
      )}

      <div className="card mb-3">
        <div className="table-header">
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${filterCat === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat('all')}>Todos</button>
            {CATEGORIES.filter(c => products.some(p => p.category === c)).map(c => (
              <button key={c} className={`btn btn-sm ${filterCat === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterCat(c)}>{c}</button>
            ))}
          </div>
          <input type="text" className="search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
      </div>

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> : (
        <div className="card"><div className="table-container">
          <table className="table"><thead><tr><th>Producto</th><th>Marca</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Venta</th><th>Estado</th><th></th></tr></thead>
            <tbody>{filtered.length === 0 ? <tr><td colSpan="9" className="text-center text-muted" style={{ padding: '3rem' }}>Sin productos</td></tr> :
              filtered.map(p => { const isLow = p.minimum_stock > 0 && p.current_stock <= p.minimum_stock; return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.brand||'-'}</td>
                  <td>{p.category||'-'}</td>
                  <td style={isLow ? { color: '#ef4444', fontWeight: 700 } : {}}>{p.current_stock} u</td>
                  <td>{p.minimum_stock > 0 ? `${p.minimum_stock} u` : '-'}</td>
                  <td>{formatCurrency(p.cost||0)}</td>
                  <td>{p.is_for_sale ? formatCurrency(p.sale_price||0) : <span className="text-muted">Uso interno</span>}</td>
                  <td><span className={`badge ${isLow ? 'badge-error' : 'badge-success'}`}>{isLow ? '⚠️ Bajo' : '✅ OK'}</span></td>
                  <td><button className="action-btn-quick action-btn-payment" onClick={() => openEdit(p)}><Icon name="edit" /></button></td>
                </tr>); })}</tbody></table>
        </div></div>
      )}

      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editingId ? 'Editar' : 'Nuevo'} Producto</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <form onSubmit={handleSave}><div className="modal-form">
              <div className="form-group full-width"><label className="form-label">Nombre *</label>
                <input type="text" className="form-input" placeholder="Ej: Tintura Wella Koleston 60ml" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
              <div className="form-group"><label className="form-label">Marca</label>
                <input type="text" className="form-input" placeholder="Ej: Wella, L'Oréal" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Categoría</label>
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">—</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Stock actual</label>
                <input type="number" className="form-input" min="0" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Stock mínimo</label>
                <input type="number" className="form-input" min="0" value={form.minimum_stock} onChange={e => setForm(f => ({ ...f, minimum_stock: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Costo</label>
                <input type="number" className="form-input" step="0.01" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">¿Se vende al público?</label>
                <select className="form-select" value={form.is_for_sale ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_for_sale: e.target.value === 'true' }))}>
                  <option value="false">No — Uso interno</option><option value="true">Sí — Venta al público</option>
                </select></div>
              {form.is_for_sale && (
                <div className="form-group"><label className="form-label">Precio venta</label>
                  <input type="number" className="form-input" step="0.01" min="0" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} /></div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div></form>
          </div>
        </div>
      )}
    </div>
  );
}
