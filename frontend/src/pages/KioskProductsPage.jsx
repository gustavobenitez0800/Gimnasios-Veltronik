// ============================================
// VELTRONIK V2 - PRODUCTOS (KIOSCO)
// ============================================
// CRUD de productos + rubros. El stock NO se edita acá:
// el alta toma un stock inicial y después se mueve por
// ventas/ajustes (ver Inventario). El front solo dibuja
// lo que el backend devuelve (stock, margen son sus datos).
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { PageHeader, ConfirmDialog, EmptyState } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';

const IVA_OPTIONS = [
  { value: '21', label: '21%' },
  { value: '10.5', label: '10,5%' },
  { value: '0', label: '0% (Exento)' },
];

const EMPTY_PRODUCT = {
  categoryId: '', name: '', barcode: '', salePrice: '', costPrice: '',
  stockQuantity: '', minStock: '', service: 'no', weighable: 'no', ivaRate: '21', active: 'yes',
};

const fmtMoney = (v) => (v === null || v === undefined || v === '' ? '—' : `$${Number(v).toLocaleString('es-AR')}`);
const fmtQty = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-AR'));
const margin = (sale, cost) => {
  if (!cost || Number(cost) <= 0 || sale === null || sale === undefined) return '—';
  return `${Math.round(((Number(sale) - Number(cost)) / Number(cost)) * 100)}%`;
};

export default function KioskProductsPage() {
  const { showToast } = useToast();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const [newCategory, setNewCategory] = useState('');
  const [catToDelete, setCatToDelete] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [prods, cats] = await Promise.all([
        kioskService.getProducts(),
        kioskService.getCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      showToast(err.message || 'Error al cargar productos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      categoryId: p.categoryId || '', name: p.name, barcode: p.barcode || '',
      salePrice: p.salePrice ?? '', costPrice: p.costPrice ?? '',
      stockQuantity: '', minStock: p.minStock ?? '',
      service: p.service ? 'yes' : 'no', weighable: p.weighable ? 'yes' : 'no',
      ivaRate: String(p.ivaRate ?? '21'), active: p.active ? 'yes' : 'no',
    });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Ingresá el nombre del producto', 'error'); return; }
    if (form.salePrice === '') { showToast('Ingresá el precio de venta', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        categoryId: form.categoryId || null,
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        salePrice: Number(form.salePrice),
        costPrice: form.costPrice !== '' ? Number(form.costPrice) : null,
        minStock: form.minStock !== '' ? Number(form.minStock) : 0,
        service: form.service === 'yes',
        weighable: form.weighable === 'yes',
        ivaRate: Number(form.ivaRate),
        active: form.active === 'yes',
      };
      if (editing) {
        await kioskService.updateProduct(editing.id, payload);
        showToast('Producto actualizado', 'success');
      } else {
        // Stock inicial solo en el alta (después se mueve por inventario).
        if (form.stockQuantity !== '') payload.stockQuantity = Number(form.stockQuantity);
        await kioskService.createProduct(payload);
        showToast('Producto creado', 'success');
      }
      setModal(false);
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await kioskService.deleteProduct(toDelete.id);
      showToast('Producto eliminado', 'success');
      setToDelete(null);
      loadAll();
    } catch (err) {
      // El backend bloquea el borrado si el producto tiene historial → mensaje claro.
      showToast(err?.response?.data?.message || 'No se pudo eliminar', 'error');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    try {
      await kioskService.createCategory({ name: newCategory.trim() });
      setNewCategory('');
      loadAll();
    } catch (err) {
      showToast(err.message || 'No se pudo crear el rubro', 'error');
    }
  };

  const handleDeleteCategory = async () => {
    try {
      await kioskService.deleteCategory(catToDelete.id);
      setCatToDelete(null);
      loadAll();
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar el rubro', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Catálogo, precios y stock del kiosco"
        icon="package"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size="1em" /> Nuevo producto
          </button>
        }
      />

      {loading ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando...
        </div>
      ) : (
        <>
          {/* ─── Rubros ─── */}
          <div className="card mb-3">
            <h3 style={{ marginTop: 0 }}><Icon name="list" size="1em" /> Rubros</h3>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input className="form-input" placeholder="Nuevo rubro (ej: Bebidas)"
                value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ maxWidth: 280 }} />
              <button type="submit" className="btn btn-secondary btn-sm"><Icon name="plus" size="1em" /> Agregar</button>
            </form>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {categories.length === 0 && <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Sin rubros todavía.</span>}
              {categories.map((c) => (
                <span key={c.id} className="kiosk-chip">
                  {c.name}
                  <button className="kiosk-chip-x" onClick={() => setCatToDelete(c)} title="Eliminar rubro"><Icon name="x" size="0.85em" /></button>
                </span>
              ))}
            </div>
          </div>

          {/* ─── Productos ─── */}
          {products.length === 0 ? (
            <EmptyState
              icon="package"
              title="Sin productos"
              description="Cargá tu primer producto para empezar a vender."
              action={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" size="1em" /> Nuevo producto</button>}
            />
          ) : (
            <div className="card">
              <DataTable
                columns={[
                  { key: 'name', label: 'Producto', render: (p) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                        {[catName[p.categoryId], p.barcode].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  ) },
                  { key: 'salePrice', label: 'Venta', render: (p) => fmtMoney(p.salePrice) },
                  { key: 'margin', label: 'Margen', render: (p) => margin(p.salePrice, p.costPrice) },
                  { key: 'stock', label: 'Stock', render: (p) => (
                    p.service ? <span className="text-muted">servicio</span>
                      : <span className={p.lowStock ? 'kiosk-stock-low' : ''}>{fmtQty(p.stockQuantity)}</span>
                  ) },
                  { key: 'active', label: 'Estado', render: (p) => (
                    <Badge status={p.active ? 'active' : 'inactive'} label={p.active ? 'Activo' : 'Inactivo'} />
                  ) },
                  { key: 'actions', label: '', render: (p) => (
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}><Icon name="edit" size="1em" /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(p)}><Icon name="trash" size="1em" /></button>
                    </div>
                  ) },
                ]}
                data={products}
                emptyMessage="Sin productos."
              />
            </div>
          )}
        </>
      )}

      {/* ─── Modal producto ─── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar producto' : 'Nuevo producto'}>
        <ModalForm onSubmit={handleSave}>
          <FormField label="Nombre" required placeholder="Ej: Coca-Cola 500ml"
            value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <FormField label="Rubro" type="select"
            value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            options={[{ value: '', label: 'Sin rubro' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          <FormField label="Código de barras" placeholder="Escaneá o tipeá (opcional)"
            value={form.barcode} onChange={(v) => setForm((f) => ({ ...f, barcode: v }))} />
          <FormField label="Precio de venta" type="number" min="0" required placeholder="Ej: 1200"
            value={form.salePrice} onChange={(v) => setForm((f) => ({ ...f, salePrice: v }))} />
          <FormField label="Costo" type="number" min="0" placeholder="Para calcular margen"
            value={form.costPrice} onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))} />
          <FormField label="IVA" type="select"
            value={form.ivaRate} onChange={(v) => setForm((f) => ({ ...f, ivaRate: v }))} options={IVA_OPTIONS} />
          {!editing && (
            <FormField label="Stock inicial" type="number" min="0" placeholder="0"
              value={form.stockQuantity} onChange={(v) => setForm((f) => ({ ...f, stockQuantity: v }))}
              hint="Después el stock se mueve por ventas y ajustes" />
          )}
          <FormField label="Stock mínimo (alerta)" type="number" min="0" placeholder="0"
            value={form.minStock} onChange={(v) => setForm((f) => ({ ...f, minStock: v }))} />
          <FormField label="Tipo" type="select"
            value={form.service} onChange={(v) => setForm((f) => ({ ...f, service: v }))}
            options={[{ value: 'no', label: 'Producto (descuenta stock)' }, { value: 'yes', label: 'Servicio / recarga (sin stock)' }]} />
          <FormField label="Se pesa (balanza)" type="select"
            value={form.weighable} onChange={(v) => setForm((f) => ({ ...f, weighable: v }))}
            options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Sí (por kg)' }]} />
          <FormField label="Estado" type="select"
            value={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            options={[{ value: 'yes', label: 'Activo' }, { value: 'no', label: 'Inactivo' }]} />
          <ModalActions onCancel={() => setModal(false)} saving={saving} />
        </ModalForm>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={`¿Eliminar ${toDelete?.name}?`}
        message="Si el producto ya tuvo ventas, el sistema no lo borra (protege el historial); marcalo como inactivo."
        confirmText="Eliminar"
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!catToDelete}
        title={`¿Eliminar el rubro ${catToDelete?.name}?`}
        message="Los productos de ese rubro quedan sin rubro asignado."
        confirmText="Eliminar"
        onCancel={() => setCatToDelete(null)}
        onConfirm={handleDeleteCategory}
      />
    </div>
  );
}
