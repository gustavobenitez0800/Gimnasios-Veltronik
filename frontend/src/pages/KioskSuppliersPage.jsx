// ============================================
// VELTRONIK V2 - PROVEEDORES / COMPRAS (KIOSCO)
// ============================================
// Proveedores (CRUD) + registrar compras. Una compra
// repone stock (movimientos PURCHASE) y actualiza el
// costo de cada producto — el backend hace ambas cosas.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { PageHeader, ConfirmDialog, EmptyState } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';

const fmtMoney = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('es-AR')}`);
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '—');
const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_SUPPLIER = { name: '', phone: '', cuit: '', notes: '', active: 'yes' };
const EMPTY_LINE = { productId: '', quantity: '', unitCost: '' };

export default function KioskSuppliersPage() {
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const [buyModal, setBuyModal] = useState(false);
  const [buy, setBuy] = useState({ supplierId: '', purchaseDate: today(), notes: '' });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [buying, setBuying] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [sups, prods, purchs] = await Promise.all([
        kioskService.getSuppliers(),
        kioskService.getActiveProducts(),
        kioskService.getPurchases(),
      ]);
      setSuppliers(sups);
      setProducts(prods.filter((p) => !p.service));
      setPurchases(purchs);
    } catch (err) {
      showToast(err.message || 'Error al cargar proveedores', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const buyTotal = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    [lines]
  );

  // ─── Proveedores ───
  const openNew = () => { setEditing(null); setForm(EMPTY_SUPPLIER); setModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone || '', cuit: s.cuit || '', notes: s.notes || '', active: s.active ? 'yes' : 'no' });
    setModal(true);
  };
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Ingresá el nombre', 'error'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), phone: form.phone.trim() || null, cuit: form.cuit.trim() || null, notes: form.notes.trim() || null, active: form.active === 'yes' };
      if (editing) { await kioskService.updateSupplier(editing.id, payload); showToast('Proveedor actualizado', 'success'); }
      else { await kioskService.createSupplier(payload); showToast('Proveedor creado', 'success'); }
      setModal(false); loadAll();
    } catch (err) { showToast(err?.response?.data?.message || 'Error al guardar', 'error'); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    try { await kioskService.deleteSupplier(toDelete.id); showToast('Proveedor eliminado', 'success'); setToDelete(null); loadAll(); }
    catch (err) { showToast(err?.response?.data?.message || 'No se pudo eliminar', 'error'); }
  };

  // ─── Compras ───
  const openBuy = () => { setBuy({ supplierId: '', purchaseDate: today(), notes: '' }); setLines([{ ...EMPTY_LINE }]); setBuyModal(true); };
  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (i) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const handleBuy = async (e) => {
    e.preventDefault();
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0 && l.unitCost !== '')
      .map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) }));
    if (items.length === 0) { showToast('Agregá al menos un producto con cantidad y costo', 'error'); return; }
    setBuying(true);
    try {
      await kioskService.registerPurchase({
        supplierId: buy.supplierId || null,
        purchaseDate: buy.purchaseDate || null,
        notes: buy.notes.trim() || null,
        items,
      });
      showToast('Compra registrada (stock y costos actualizados)', 'success');
      setBuyModal(false); loadAll();
    } catch (err) { showToast(err?.response?.data?.message || 'No se pudo registrar la compra', 'error'); }
    finally { setBuying(false); }
  };

  const productOptions = [{ value: '', label: 'Producto…' }, ...products.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Proveedores y compras (reposición de stock)"
        icon="store"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={openNew}><Icon name="plus" size="1em" /> Proveedor</button>
            <button className="btn btn-primary" onClick={openBuy}><Icon name="package" size="1em" /> Registrar compra</button>
          </div>
        }
      />

      {loading ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}><span className="spinner" /> Cargando...</div>
      ) : (
        <>
          {/* ─── Proveedores ─── */}
          <div className="card mb-3">
            <h3 style={{ marginTop: 0 }}><Icon name="store" size="1em" /> Proveedores</h3>
            {suppliers.length === 0 ? (
              <EmptyState icon="store" title="Sin proveedores"
                description="Cargá tus proveedores para registrar compras a su nombre."
                action={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" size="1em" /> Nuevo proveedor</button>} />
            ) : (
              <DataTable
                columns={[
                  { key: 'name', label: 'Proveedor', render: (s) => s.name },
                  { key: 'contact', label: 'Contacto', render: (s) => [s.phone, s.cuit].filter(Boolean).join(' · ') || '—' },
                  { key: 'state', label: 'Estado', render: (s) => <Badge status={s.active ? 'active' : 'inactive'} label={s.active ? 'Activo' : 'Inactivo'} /> },
                  { key: 'actions', label: '', render: (s) => (
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}><Icon name="edit" size="1em" /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(s)}><Icon name="trash" size="1em" /></button>
                    </div>
                  ) },
                ]}
                data={suppliers}
                emptyMessage="Sin proveedores."
              />
            )}
          </div>

          {/* ─── Compras ─── */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}><Icon name="package" size="1em" /> Compras recientes</h3>
            <DataTable
              columns={[
                { key: 'date', label: 'Fecha', render: (p) => fmtDate(p.purchaseDate) },
                { key: 'supplier', label: 'Proveedor', render: (p) => p.supplierName || '—' },
                { key: 'items', label: 'Items', render: (p) => (p.items ? p.items.length : 0) },
                { key: 'total', label: 'Total', render: (p) => fmtMoney(p.total) },
                { key: 'notes', label: 'Nota', render: (p) => p.notes || '—' },
              ]}
              data={purchases}
              emptyMessage="Todavía no se registraron compras."
            />
          </div>
        </>
      )}

      {/* ─── Modal proveedor ─── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <ModalForm onSubmit={handleSave}>
          <FormField label="Nombre" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <FormField label="Teléfono" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <FormField label="CUIT" value={form.cuit} onChange={(v) => setForm((f) => ({ ...f, cuit: v }))} />
          <FormField label="Notas" type="textarea" fullWidth value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
          <FormField label="Estado" type="select" options={[{ value: 'yes', label: 'Activo' }, { value: 'no', label: 'Inactivo' }]}
            value={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          <ModalActions onCancel={() => setModal(false)} saving={saving} />
        </ModalForm>
      </Modal>

      {/* ─── Modal compra ─── */}
      <Modal isOpen={buyModal} onClose={() => setBuyModal(false)} title="Registrar compra">
        <ModalForm onSubmit={handleBuy}>
          <FormField label="Proveedor" type="select"
            value={buy.supplierId} onChange={(v) => setBuy((b) => ({ ...b, supplierId: v }))}
            options={[{ value: '', label: 'Sin proveedor (compra suelta)' }, ...suppliers.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))]} />
          <FormField label="Fecha" type="date" value={buy.purchaseDate} onChange={(v) => setBuy((b) => ({ ...b, purchaseDate: v }))} />

          <div className="form-field fullWidth" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Productos comprados</label>
            <div className="kiosk-buy-lines">
              {lines.map((l, i) => (
                <div key={i} className="kiosk-buy-line">
                  <select className="form-input" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                    {productOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className="form-input" type="number" min="0" step="any" placeholder="Cant." value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <input className="form-input" type="number" min="0" placeholder="Costo u." value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                  <button type="button" className="kiosk-buy-x" onClick={() => removeLine(i)} title="Quitar"><Icon name="x" size="0.9em" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: '0.5rem' }}>
              <Icon name="plus" size="1em" /> Agregar producto
            </button>
          </div>

          <FormField label="Nota" placeholder="Remito / factura" fullWidth value={buy.notes} onChange={(v) => setBuy((b) => ({ ...b, notes: v }))} />

          <div style={{ gridColumn: '1 / -1', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem' }}>
            Total: {fmtMoney(buyTotal)}
          </div>
          <ModalActions onCancel={() => setBuyModal(false)} saving={buying} submitText="Registrar compra" />
        </ModalForm>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={`¿Eliminar a ${toDelete?.name}?`}
        message="Si el proveedor tiene compras registradas, el sistema no lo borra; desactivalo."
        confirmText="Eliminar"
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
