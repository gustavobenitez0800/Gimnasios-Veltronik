// ============================================
// VELTRONIK V2 - PUNTO DE VENTA (KIOSCO)
// ============================================
// El corazón del vertical: escáner con foco permanente,
// búsqueda, carrito y cobro. Regla de oro: el backend es
// la autoridad de precios. El carrito muestra un total de
// preview; el total que se confirma y se imprime es el que
// DEVUELVE el backend al registrar la venta.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { Modal, ModalForm, ModalActions, FormField } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

const fmtMoney = (v) => `$${Number(v || 0).toLocaleString('es-AR')}`;
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'MP', label: 'Mercado Pago' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente (fiado)' },
];
const VOUCHER_LABELS = { FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C' };
const voucherNumber = (v) => `${String(v.pointOfSale).padStart(4, '0')}-${String(v.number).padStart(8, '0')}`;

export default function PosPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const barcodeRef = useRef(null);

  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [autoInvoice, setAutoInvoice] = useState(false);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);

  const [payModal, setPayModal] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [customerId, setCustomerId] = useState('');
  const [tendered, setTendered] = useState('');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [fiscalVoucher, setFiscalVoucher] = useState(null);
  const [fiscalPolling, setFiscalPolling] = useState(false); // true mientras se espera el CAE
  const saleRef = useRef(null); // venta que se está mostrando/poleando (ignora resultados viejos)

  const loadAll = useCallback(async () => {
    try {
      const [cur, prods, settings, custs] = await Promise.all([
        kioskService.getCurrentCash(),
        kioskService.getActiveProducts(),
        kioskService.getSettings(),
        kioskService.getActiveCustomers(),
      ]);
      setSession(cur);
      setProducts(prods);
      setAutoInvoice(!!settings.autoInvoice);
      setCustomers(custs);
    } catch (err) {
      showToast(err.message || 'Error al cargar el POS', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // El total de preview (UX). El total real lo confirma el backend al registrar.
  const total = useMemo(() => cart.reduce((acc, c) => acc + Number(c.salePrice) * c.quantity, 0), [cart]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
    ).slice(0, 60);
  }, [products, search]);

  const addToCart = useCallback((product, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        return prev.map((c) => c.productId === product.id ? { ...c, quantity: c.quantity + qty } : c);
      }
      return [...prev, { productId: product.id, name: product.name, salePrice: product.salePrice, quantity: qty }];
    });
  }, []);

  const setQty = (productId, qty) => {
    const q = Number(qty);
    if (!q || q <= 0) { setCart((prev) => prev.filter((c) => c.productId !== productId)); return; }
    setCart((prev) => prev.map((c) => c.productId === productId ? { ...c, quantity: q } : c));
  };

  const removeFromCart = (productId) => setCart((prev) => prev.filter((c) => c.productId !== productId));

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    setBarcode('');
    // Primero local (catálogo ya cargado); si no, pregunto al backend.
    const local = products.find((p) => p.barcode === code);
    if (local) { addToCart(local); return; }
    try {
      const product = await kioskService.getProductByBarcode(code);
      addToCart(product);
    } catch {
      showToast(`Sin producto para el código ${code}`, 'error');
    } finally {
      barcodeRef.current?.focus();
    }
  };

  const openPay = () => {
    if (cart.length === 0) { showToast('El carrito está vacío', 'error'); return; }
    setMethod('CASH');
    setTendered('');
    setCustomerId('');
    setReceipt(null);
    setPayModal(true);
  };

  const change = useMemo(() => {
    if (method !== 'CASH' || tendered === '') return null;
    return Number(tendered) - total;
  }, [method, tendered, total]);

  // La facturación es asíncrona: tras la venta, consultamos el comprobante hasta que ARCA
  // devuelva el CAE (o se rinda). Ignora resultados de una venta anterior (saleRef).
  const pollVoucher = async (saleId) => {
    try {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (saleRef.current !== saleId) return;
        try {
          const v = await kioskService.getVoucherBySource('KIOSK_SALE', saleId);
          if (v && saleRef.current === saleId) {
            setFiscalVoucher(v);
            if (v.status === 'AUTHORIZED' || v.status === 'REJECTED') return;
          }
        } catch { /* reintenta */ }
      }
    } finally {
      // Se acabaron los reintentos (o se cambió de venta): cortá el spinner. La venta YA quedó
      // registrada; si no llegó el CAE, el comprobante se sigue emitiendo solo (cron de contingencia).
      if (saleRef.current === saleId) setFiscalPolling(false);
    }
  };

  /** Limpia el ticket en pantalla y deja todo listo para la próxima venta. */
  const startNewSale = () => {
    saleRef.current = null;      // corta cualquier polling en curso
    setReceipt(null);
    setFiscalVoucher(null);
    setFiscalPolling(false);
    barcodeRef.current?.focus();
  };

  const confirmSale = async (e) => {
    e.preventDefault();
    if (method === 'CUENTA_CORRIENTE' && !customerId) {
      showToast('Elegí el cliente para la cuenta corriente', 'error'); return;
    }
    setPaying(true);
    try {
      const payload = {
        clientUuid: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        payments: [{ method, amount: total }],
      };
      if (method === 'CUENTA_CORRIENTE') payload.customerId = customerId;
      const sale = await kioskService.registerSale(payload);
      // El backend es la autoridad: mostramos SU total.
      const realTotal = Number(sale.total);
      const ch = (method === 'CASH' && tendered !== '') ? Number(tendered) - realTotal : null;
      saleRef.current = sale.id;
      setFiscalVoucher(null);
      setReceipt({ total: realTotal, change: ch, method, saleId: sale.id });
      setCart([]);
      setPayModal(false);
      showToast('Venta registrada', 'success');
      barcodeRef.current?.focus();
      if (autoInvoice) { setFiscalPolling(true); pollVoucher(sale.id); } // dispara el polling del comprobante
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo registrar la venta', 'error');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <div className="card text-center text-muted" style={{ padding: '3rem' }}><span className="spinner" /> Cargando...</div>;
  }

  // Sin caja abierta no se puede vender (invariante del backend).
  if (!session) {
    return (
      <div className="card text-center" style={{ padding: '3rem', maxWidth: 440, margin: '2rem auto' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><Icon name="dollarSign" /></div>
        <h3 style={{ marginTop: 0 }}>No hay una caja abierta</h3>
        <p className="text-muted">Abrí la caja para empezar a vender.</p>
        <button className="btn btn-primary" onClick={() => navigate(CONFIG.ROUTES.KIOSK_CASH)}>
          <Icon name="dollarSign" size="1em" /> Ir a Caja
        </button>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      {/* ─── Catálogo / búsqueda ─── */}
      <div className="pos-catalog">
        <form onSubmit={handleBarcodeSubmit} className="pos-scan">
          <Icon name="search" size="1em" />
          <input
            ref={barcodeRef}
            className="form-input pos-scan-input"
            placeholder="Escaneá un código de barras y Enter…"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoFocus
          />
        </form>
        <input
          className="form-input"
          placeholder="Buscar producto por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '0.75rem' }}
        />
        <div className="pos-product-grid">
          {filtered.length === 0 && <div className="text-muted" style={{ padding: '1rem' }}>Sin productos.</div>}
          {filtered.map((p) => (
            <button key={p.id} className="pos-product-card" onClick={() => addToCart(p)} type="button">
              <span className="pos-product-name">{p.name}</span>
              <span className="pos-product-price">{fmtMoney(p.salePrice)}</span>
              {!p.service && p.lowStock && <span className="pos-product-low">stock bajo</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Carrito ─── */}
      <div className="pos-cart">
        <div className="pos-cart-header">
          <Icon name="wallet" size="1em" /> Carrito
          {cart.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setCart([])}>Vaciar</button>}
        </div>

        <div className="pos-cart-items">
          {cart.length === 0 && !receipt && (
            <div className="text-muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
              Escaneá o tocá un producto para empezar.
            </div>
          )}

          {/* Último ticket (lo que devolvió el backend) */}
          {receipt && cart.length === 0 && (
            <div className="pos-receipt">
              <div className="pos-receipt-check"><Icon name="check" /></div>
              <div className="pos-receipt-total">{fmtMoney(receipt.total)}</div>
              <div className="text-muted">{PAYMENT_METHODS.find((m) => m.value === receipt.method)?.label}</div>
              {receipt.change !== null && receipt.change >= 0 && (
                <div className="pos-receipt-change">Vuelto: <strong>{fmtMoney(receipt.change)}</strong></div>
              )}

              {/* Comprobante ARCA (asíncrono): el backend lo emite y acá lo mostramos al llegar. */}
              {autoInvoice && (
                <div className="pos-receipt-fiscal">
                  {fiscalVoucher && fiscalVoucher.status === 'AUTHORIZED' ? (
                    <>
                      <div className="pos-fiscal-title">{VOUCHER_LABELS[fiscalVoucher.voucherType] || 'Comprobante'} {voucherNumber(fiscalVoucher)}</div>
                      <div className="pos-fiscal-cae">CAE {fiscalVoucher.cae}</div>
                      {fiscalVoucher.qrUrl && <div className="pos-fiscal-qr"><QRCodeSVG value={fiscalVoucher.qrUrl} size={120} /></div>}
                    </>
                  ) : fiscalVoucher && fiscalVoucher.status === 'REJECTED' ? (
                    <div className="pos-fiscal-warn">Comprobante rechazado por ARCA</div>
                  ) : fiscalVoucher && fiscalVoucher.status === 'CONTINGENCY' ? (
                    <div className="pos-fiscal-warn">Comprobante en contingencia (se reintenta solo)</div>
                  ) : fiscalPolling ? (
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}><span className="spinner" /> Facturando…</div>
                  ) : (
                    // El polling terminó sin CAE: la venta está hecha, la factura sigue en cola.
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Factura pendiente — se emite en segundo plano (revisá <strong>Facturación</strong>).</div>
                  )}
                </div>
              )}

              <button className="btn btn-secondary btn-sm" style={{ marginTop: '1rem' }} onClick={startNewSale}>
                <Icon name="plus" size="1em" /> Nueva venta
              </button>
            </div>
          )}

          {cart.map((c) => (
            <div key={c.productId} className="pos-cart-row">
              <div className="pos-cart-row-name">{c.name}</div>
              <input
                className="form-input pos-cart-qty"
                type="number" min="0" step="any"
                value={c.quantity}
                onChange={(e) => setQty(c.productId, e.target.value)}
              />
              <div className="pos-cart-row-total">{fmtMoney(Number(c.salePrice) * c.quantity)}</div>
              <button className="pos-cart-x" onClick={() => removeFromCart(c.productId)} title="Quitar"><Icon name="x" size="0.9em" /></button>
            </div>
          ))}
        </div>

        <div className="pos-cart-footer">
          <div className="pos-total-row">
            <span>Total</span>
            <span className="pos-total-value">{fmtMoney(total)}</span>
          </div>
          <button className="btn btn-primary pos-pay-btn" disabled={cart.length === 0} onClick={openPay}>
            <Icon name="dollarSign" size="1em" /> Cobrar
          </button>
        </div>
      </div>

      {/* ─── Modal cobro ─── */}
      <Modal isOpen={payModal} onClose={() => setPayModal(false)} title={`Cobrar ${fmtMoney(total)}`}>
        <ModalForm onSubmit={confirmSale}>
          <FormField label="Medio de pago" type="select"
            value={method} onChange={setMethod} options={PAYMENT_METHODS} />
          {method === 'CUENTA_CORRIENTE' && (
            <FormField label="Cliente" type="select" value={customerId} onChange={setCustomerId}
              options={[{ value: '', label: 'Elegí un cliente' }, ...customers.map((c) => ({
                value: c.id, label: c.fullName + (Number(c.balance) > 0 ? ` (debe ${fmtMoney(c.balance)})` : ''),
              }))]}
              hint={customers.length === 0 ? 'No hay clientes cargados (creá uno en Clientes / Fiado)' : undefined} />
          )}
          {method === 'CASH' && (
            <FormField label="Paga con" type="number" min="0" placeholder="Para calcular el vuelto"
              value={tendered} onChange={setTendered} />
          )}
          {change !== null && change >= 0 && (
            <div className="pos-change-hint">Vuelto: <strong>{fmtMoney(change)}</strong></div>
          )}
          {change !== null && change < 0 && (
            <div className="pos-change-hint pos-change-short">Faltan {fmtMoney(Math.abs(change))}</div>
          )}
          <ModalActions onCancel={() => setPayModal(false)} saving={paying} submitText={`Confirmar ${fmtMoney(total)}`} />
        </ModalForm>
      </Modal>
    </div>
  );
}
