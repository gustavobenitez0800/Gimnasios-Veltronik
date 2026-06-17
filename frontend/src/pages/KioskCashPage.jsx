// ============================================
// VELTRONIK V2 - CAJA (KIOSCO)
// ============================================
// Apertura, cierre con arqueo y ventas del día.
// El arqueo (esperado y diferencia) lo calcula el
// BACKEND; el front solo manda el efectivo contado
// y dibuja el resultado.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { kioskService } from '../services';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';

const fmtMoney = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('es-AR')}`);
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—');
const METHOD_LABELS = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', MP: 'Mercado Pago' };

export default function KioskCashPage() {
  const { showToast } = useToast();
  // Anular venta es OWNER/ADMIN en el backend (anti-robo) → el front solo muestra el botón a ellos.
  const { orgRole } = useAuth();
  const canVoid = orgRole === 'owner' || orgRole === 'admin';

  const [session, setSession] = useState(null);
  const [sales, setSales] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openingAmount, setOpeningAmount] = useState('');
  const [opening, setOpening] = useState(false);

  const [closeModal, setCloseModal] = useState(false);
  const [closingDeclared, setClosingDeclared] = useState('');
  const [closing, setClosing] = useState(false);

  const [toVoid, setToVoid] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [cur, todaySales, hist] = await Promise.all([
        kioskService.getCurrentCash(),
        kioskService.getTodaySales(),
        kioskService.getCashHistory(),
      ]);
      setSession(cur);
      setSales(todaySales);
      setHistory(hist);
    } catch (err) {
      showToast(err.message || 'Error al cargar la caja', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Totales del día (agregación de datos del backend, solo para mostrar).
  const totals = useMemo(() => {
    const completed = sales.filter((s) => s.status === 'COMPLETED');
    const sum = completed.reduce((acc, s) => acc + Number(s.total || 0), 0);
    return { count: completed.length, sum };
  }, [sales]);

  const handleOpen = async (e) => {
    e.preventDefault();
    setOpening(true);
    try {
      await kioskService.openCash(openingAmount === '' ? 0 : Number(openingAmount));
      showToast('Caja abierta', 'success');
      setOpeningAmount('');
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo abrir la caja', 'error');
    } finally {
      setOpening(false);
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    setClosing(true);
    try {
      const closed = await kioskService.closeCash(closingDeclared === '' ? 0 : Number(closingDeclared));
      const diff = Number(closed.difference || 0);
      const msg = diff === 0 ? 'Caja cerrada: cuadró exacto.'
        : diff > 0 ? `Caja cerrada: sobran ${fmtMoney(diff)}.`
        : `Caja cerrada: faltan ${fmtMoney(Math.abs(diff))}.`;
      showToast(msg, diff === 0 ? 'success' : 'info');
      setCloseModal(false);
      setClosingDeclared('');
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo cerrar la caja', 'error');
    } finally {
      setClosing(false);
    }
  };

  const handleVoid = async () => {
    try {
      await kioskService.voidSale(toVoid.id);
      showToast('Venta anulada (stock devuelto)', 'success');
      setToVoid(null);
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo anular', 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Caja" subtitle="Apertura, cierre y arqueo del turno" icon="dollarSign" />

      {loading ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando...
        </div>
      ) : (
        <>
          {/* ─── Estado de la caja ─── */}
          {!session ? (
            <div className="card mb-3">
              <h3 style={{ marginTop: 0 }}><Icon name="dollarSign" size="1em" /> Abrir caja</h3>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '-0.25rem' }}>
                No hay una caja abierta. Abrila con el fondo inicial para empezar a vender.
              </p>
              <form onSubmit={handleOpen} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ maxWidth: 220 }}>
                  <FormField label="Fondo de apertura" type="number" min="0" placeholder="Ej: 5000"
                    value={openingAmount} onChange={setOpeningAmount} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={opening}>
                  {opening ? <><span className="spinner" /> Abriendo...</> : <><Icon name="check" size="1em" /> Abrir caja</>}
                </button>
              </form>
            </div>
          ) : (
            <div className="card mb-3">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    <Icon name="dollarSign" size="1em" /> Caja abierta <Badge status="active" label="Abierta" />
                  </h3>
                  <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                    Fondo: {fmtMoney(session.openingAmount)} · Abrió {fmtTime(session.openedAt)}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setCloseModal(true)}>
                  <Icon name="lock" size="1em" /> Cerrar caja
                </button>
              </div>
              <div className="kiosk-stat-row" style={{ marginTop: '1rem' }}>
                <div className="kiosk-stat"><span className="kiosk-stat-label">Ventas del turno</span><span className="kiosk-stat-value">{totals.count}</span></div>
                <div className="kiosk-stat"><span className="kiosk-stat-label">Total vendido</span><span className="kiosk-stat-value">{fmtMoney(totals.sum)}</span></div>
              </div>
            </div>
          )}

          {/* ─── Ventas del día ─── */}
          <div className="card mb-3">
            <h3 style={{ marginTop: 0 }}><Icon name="list" size="1em" /> Ventas de hoy</h3>
            <DataTable
              columns={[
                { key: 'time', label: 'Hora', render: (s) => fmtTime(s.createdAt) },
                { key: 'items', label: 'Items', render: (s) => (s.items ? s.items.length : 0) },
                { key: 'pay', label: 'Pago', render: (s) => (s.payments || []).map((p) => METHOD_LABELS[p.method] || p.method).join(', ') || '—' },
                { key: 'total', label: 'Total', render: (s) => fmtMoney(s.total) },
                { key: 'status', label: 'Estado', render: (s) => (
                  <Badge status={s.status === 'VOIDED' ? 'inactive' : 'active'} label={s.status === 'VOIDED' ? 'Anulada' : 'OK'} />
                ) },
                { key: 'actions', label: '', render: (s) => (
                  canVoid && s.status !== 'VOIDED'
                    ? <button className="btn btn-danger btn-sm" onClick={() => setToVoid(s)} title="Anular venta"><Icon name="x" size="1em" /></button>
                    : null
                ) },
              ]}
              data={sales}
              emptyMessage="Todavía no hubo ventas hoy."
            />
          </div>

          {/* ─── Cierres anteriores ─── */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}><Icon name="clock" size="1em" /> Cierres anteriores</h3>
            <DataTable
              columns={[
                { key: 'opened', label: 'Apertura', render: (s) => `${new Date(s.openedAt).toLocaleDateString('es-AR')} ${fmtTime(s.openedAt)}` },
                { key: 'opening', label: 'Fondo', render: (s) => fmtMoney(s.openingAmount) },
                { key: 'expected', label: 'Esperado', render: (s) => fmtMoney(s.closingExpected) },
                { key: 'declared', label: 'Contado', render: (s) => fmtMoney(s.closingDeclared) },
                { key: 'diff', label: 'Diferencia', render: (s) => (
                  s.difference === null || s.difference === undefined ? '—'
                    : <span className={Number(s.difference) < 0 ? 'kiosk-stock-low' : ''}>{fmtMoney(s.difference)}</span>
                ) },
                { key: 'status', label: '', render: (s) => <Badge status={s.status === 'OPEN' ? 'active' : 'inactive'} label={s.status === 'OPEN' ? 'Abierta' : 'Cerrada'} /> },
              ]}
              data={history.filter((s) => s.status === 'CLOSED')}
              emptyMessage="Sin cierres todavía."
            />
          </div>
        </>
      )}

      {/* ─── Modal cierre ─── */}
      <Modal isOpen={closeModal} onClose={() => setCloseModal(false)} title="Cerrar caja (arqueo)">
        <ModalForm onSubmit={handleClose}>
          <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>
            Contá el efectivo en la caja e ingresá el total. El sistema calcula cuánto debería
            haber (fondo + ventas en efectivo) y la diferencia.
          </p>
          <FormField label="Efectivo contado" type="number" min="0" required placeholder="Ej: 42500"
            value={closingDeclared} onChange={setClosingDeclared} fullWidth />
          <ModalActions onCancel={() => setCloseModal(false)} saving={closing} submitText="Cerrar caja" />
        </ModalForm>
      </Modal>

      <ConfirmDialog
        open={!!toVoid}
        title="¿Anular esta venta?"
        message="Se devuelve el stock de los productos vendidos. La venta queda registrada como anulada."
        confirmText="Anular"
        onCancel={() => setToVoid(null)}
        onConfirm={handleVoid}
      />
    </div>
  );
}
