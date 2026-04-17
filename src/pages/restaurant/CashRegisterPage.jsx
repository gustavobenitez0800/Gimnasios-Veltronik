// ============================================
// VELTRONIK RESTAURANT - CASH REGISTER PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { cashRegisterService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';

export default function CashRegisterPage() {
  const { showToast } = useToast();
  const [register, setRegister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openAmount, setOpenAmount] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await cashRegisterService.getOpen();
      setRegister(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpen = async () => {
    setSubmitting(true);
    try {
      await cashRegisterService.open(parseFloat(openAmount) || 0);
      showToast('Caja abierta ✅', 'success');
      setOpenAmount('');
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleClose = async () => {
    if (!register) return;
    setSubmitting(true);
    try {
      const closing = parseFloat(closeAmount) || 0;
      await cashRegisterService.close(register.id, {
        closing_amount: closing,
        expected_amount: register.opening_amount,
        difference: closing - register.opening_amount,
        notes: closeNotes || null,
      });
      showToast('Caja cerrada ✅', 'success');
      setCloseAmount('');
      setCloseNotes('');
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando caja...</div>;

  return (
    <div className="cash-register-page">
      <PageHeader title="Caja Diaria" subtitle={register ? 'Caja abierta' : 'Caja cerrada'} icon="wallet" />

      {!register ? (
        /* Open Register */
        <div className="card" style={{ maxWidth: 450, margin: '2rem auto', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💰</div>
          <h3>Abrir Caja</h3>
          <p className="text-muted mb-2">Ingresá el monto inicial de la caja</p>
          <div className="form-group mb-2">
            <input type="number" className="form-input" step="0.01" min="0" placeholder="Monto inicial"
              value={openAmount} onChange={e => setOpenAmount(e.target.value)} style={{ textAlign: 'center', fontSize: '1.25rem' }} />
          </div>
          <button className="btn btn-primary" onClick={handleOpen} disabled={submitting} style={{ width: '100%' }}>
            {submitting ? <><span className="spinner" /> Abriendo...</> : '✅ Abrir Caja'}
          </button>
        </div>
      ) : (
        /* Open Register Info */
        <>
          <div className="stats-grid mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="stat-card">
              <div className="stat-icon stat-icon-success">💵</div>
              <div className="stat-content">
                <div className="stat-value">{formatCurrency(register.opening_amount || 0)}</div>
                <div className="stat-label">Monto Inicial</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-primary">⏰</div>
              <div className="stat-content">
                <div className="stat-value">{new Date(register.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="stat-label">Hora de Apertura</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-accent">📊</div>
              <div className="stat-content">
                <div className="stat-value">{register.orders_count || 0}</div>
                <div className="stat-label">Pedidos</div>
              </div>
            </div>
          </div>

          {/* Close Register */}
          <div className="card" style={{ maxWidth: 500, margin: '0 auto', padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>🔒 Cerrar Caja</h3>
            <div className="form-group mb-2">
              <label className="form-label">Monto en caja al cerrar</label>
              <input type="number" className="form-input" step="0.01" min="0" placeholder="Contar efectivo..."
                value={closeAmount} onChange={e => setCloseAmount(e.target.value)} />
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Notas (opcional)</label>
              <textarea className="form-textarea" rows="2" placeholder="Observaciones del turno..."
                value={closeNotes} onChange={e => setCloseNotes(e.target.value)} />
            </div>
            <button className="btn btn-danger" onClick={handleClose} disabled={submitting} style={{ width: '100%' }}>
              {submitting ? <><span className="spinner" /> Cerrando...</> : '🔒 Cerrar Caja'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
