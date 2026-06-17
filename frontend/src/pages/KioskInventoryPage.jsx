// ============================================
// VELTRONIK V2 - INVENTARIO (KIOSCO)
// ============================================
// Stock bajo + libro mayor de movimientos + ajuste por
// recuento. El stock es la SUMA de los movimientos (lo
// computa el backend); acá solo se dibuja y se informa
// el conteo físico para que el backend registre el ajuste.
// ============================================

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { PageHeader } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';

const fmtQty = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-AR'));
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const TYPE_LABELS = { SALE: 'Venta', PURCHASE: 'Compra', ADJUSTMENT: 'Ajuste', RETURN: 'Devolución', LOSS: 'Merma' };
const TYPE_STATUS = { SALE: 'inactive', LOSS: 'inactive', PURCHASE: 'active', RETURN: 'active', ADJUSTMENT: 'pending' };

export default function KioskInventoryPage() {
  const { showToast } = useToast();

  const [lowStock, setLowStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ productId: '', countedQuantity: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [low, moves, prods] = await Promise.all([
        kioskService.getLowStock(),
        kioskService.getMovements(),
        kioskService.getActiveProducts(),
      ]);
      setLowStock(low);
      setMovements(moves);
      setProducts(prods.filter((p) => !p.service));
    } catch (err) {
      showToast(err.message || 'Error al cargar el inventario', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!form.productId) { showToast('Elegí un producto', 'error'); return; }
    if (form.countedQuantity === '') { showToast('Ingresá la cantidad contada', 'error'); return; }
    setSaving(true);
    try {
      await kioskService.adjustStock({
        productId: form.productId,
        countedQuantity: Number(form.countedQuantity),
        reason: form.reason.trim() || null,
      });
      showToast('Stock ajustado', 'success');
      setModal(false);
      setForm({ productId: '', countedQuantity: '', reason: '' });
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo ajustar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Stock, alertas y movimientos"
        icon="list"
        actions={
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Icon name="edit" size="1em" /> Ajustar stock
          </button>
        }
      />

      {loading ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando...
        </div>
      ) : (
        <>
          {/* ─── Stock bajo ─── */}
          <div className="card mb-3">
            <h3 style={{ marginTop: 0 }}>
              <Icon name="alertTriangle" size="1em" /> Stock bajo {lowStock.length > 0 && <Badge status="pending" label={String(lowStock.length)} />}
            </h3>
            {lowStock.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>Todo en orden: ningún producto por debajo del mínimo.</p>
            ) : (
              <DataTable
                columns={[
                  { key: 'name', label: 'Producto', render: (p) => p.name },
                  { key: 'stock', label: 'Stock', render: (p) => <span className="kiosk-stock-low">{fmtQty(p.stockQuantity)}</span> },
                  { key: 'min', label: 'Mínimo', render: (p) => fmtQty(p.minStock) },
                ]}
                data={lowStock}
                emptyMessage=""
              />
            )}
          </div>

          {/* ─── Movimientos ─── */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}><Icon name="list" size="1em" /> Movimientos recientes</h3>
            <DataTable
              columns={[
                { key: 'date', label: 'Fecha', render: (m) => fmtDateTime(m.createdAt) },
                { key: 'product', label: 'Producto', render: (m) => m.productName },
                { key: 'type', label: 'Tipo', render: (m) => <Badge status={TYPE_STATUS[m.type] || 'inactive'} label={TYPE_LABELS[m.type] || m.type} /> },
                { key: 'qty', label: 'Cantidad', render: (m) => (
                  <span className={Number(m.quantity) < 0 ? 'kiosk-stock-low' : 'kiosk-stock-up'}>
                    {Number(m.quantity) > 0 ? '+' : ''}{fmtQty(m.quantity)}
                  </span>
                ) },
                { key: 'reason', label: 'Motivo', render: (m) => m.reason || '—' },
              ]}
              data={movements}
              emptyMessage="Sin movimientos todavía."
            />
          </div>
        </>
      )}

      {/* ─── Modal ajuste ─── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title="Ajustar stock por recuento">
        <ModalForm onSubmit={handleAdjust}>
          <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>
            Contá las unidades reales en góndola e ingresá el número. El sistema registra la
            diferencia como un ajuste de inventario.
          </p>
          <FormField label="Producto" type="select" required
            value={form.productId} onChange={(v) => setForm((f) => ({ ...f, productId: v }))}
            options={[{ value: '', label: 'Elegí un producto' }, ...products.map((p) => ({ value: p.id, label: `${p.name} (stock: ${fmtQty(p.stockQuantity)})` }))]} />
          <FormField label="Cantidad contada" type="number" min="0" required placeholder="Ej: 12"
            value={form.countedQuantity} onChange={(v) => setForm((f) => ({ ...f, countedQuantity: v }))} />
          <FormField label="Motivo" placeholder="Ej: recuento mensual, rotura" fullWidth
            value={form.reason} onChange={(v) => setForm((f) => ({ ...f, reason: v }))} />
          <ModalActions onCancel={() => setModal(false)} saving={saving} submitText="Registrar ajuste" />
        </ModalForm>
      </Modal>
    </div>
  );
}
