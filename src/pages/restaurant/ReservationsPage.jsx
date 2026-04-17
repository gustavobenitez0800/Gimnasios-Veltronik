// ============================================
// VELTRONIK RESTAURANT - RESERVATIONS PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { reservationService, tableService } from '../../services';
import { PageHeader, ConfirmDialog } from '../../components/Layout';
import Icon from '../../components/Icon';

const STATUS_CFG = {
  confirmed: { label: 'Confirmada', badge: 'badge-success' },
  seated: { label: 'Sentados', badge: 'badge-primary' },
  completed: { label: 'Completada', badge: 'badge-neutral' },
  no_show: { label: 'No Show', badge: 'badge-error' },
  cancelled: { label: 'Cancelada', badge: 'badge-error' },
};

const INITIAL_FORM = { customer_name: '', customer_phone: '', party_size: 2, reservation_date: '', reservation_time: '', table_id: '', notes: '' };

export default function ReservationsPage() {
  const { showToast } = useToast();
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState(null);

  const loadData = useCallback(async () => {
    try { setLoading(true);
      const [r, t] = await Promise.all([reservationService.getByDate(selectedDate), tableService.getAll()]);
      setReservations(r||[]); setTables(t||[]);
    } catch { showToast('Error al cargar reservas', 'error'); }
    finally { setLoading(false); }
  }, [showToast, selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => { setForm({...INITIAL_FORM, reservation_date: selectedDate}); setModalOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim() || !form.reservation_date || !form.reservation_time) { showToast('Completá los campos requeridos', 'error'); return; }
    setSaving(true);
    try {
      await reservationService.create({ ...form, party_size: parseInt(form.party_size)||2, table_id: form.table_id||null });
      showToast('Reserva creada', 'success');
      setModalOpen(false); loadData();
    } catch (err) { showToast(err.message||'Error', 'error'); }
    finally { setSaving(false); }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try { await reservationService.cancel(cancelId); showToast('Reserva cancelada', 'success'); setCancelId(null); loadData(); }
    catch (err) { showToast(err.message||'Error', 'error'); }
  };

  const handleStatus = async (id, status) => {
    try { await reservationService.update(id, { status }); showToast('Estado actualizado', 'success'); loadData(); }
    catch (err) { showToast(err.message||'Error', 'error'); }
  };

  const active = reservations.filter(r => r.status !== 'cancelled');

  return (
    <div className="reservations-page">
      <PageHeader title="Reservas" subtitle="Calendario de reservas" icon="calendar"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nueva Reserva</button>} />

      <div className="card mb-3">
        <div className="table-header">
          <div className="flex items-center gap-1">
            <label className="form-label" style={{margin:0}}>Fecha:</label>
            <input type="date" className="form-input" style={{maxWidth:200}} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <span className="text-muted">{active.length} reservas</span>
        </div>
      </div>

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> :
      active.length === 0 ? (
        <div className="card" style={{padding:'3rem',textAlign:'center'}}>
          <div style={{fontSize:'3rem',marginBottom:'1rem',opacity:0.3}}>📅</div>
          <h3>Sin reservas para esta fecha</h3>
          <button className="btn btn-primary" onClick={openNew} style={{marginTop:'1rem'}}><Icon name="plus" /> Nueva Reserva</button>
        </div>
      ) : (
        <div className="card"><div className="table-container">
          <table className="table"><thead><tr><th>Hora</th><th>Cliente</th><th>Personas</th><th>Mesa</th><th>Estado</th><th>Notas</th><th>Acciones</th></tr></thead>
            <tbody>{active.map(r => (
              <tr key={r.id}>
                <td><strong>{r.reservation_time?.slice(0,5)}</strong></td>
                <td>{r.customer_name}{r.customer_phone && <div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{r.customer_phone}</div>}</td>
                <td>👥 {r.party_size}</td>
                <td>{r.table?.table_number || '-'}</td>
                <td><span className={`badge ${STATUS_CFG[r.status]?.badge || 'badge-neutral'}`}>{STATUS_CFG[r.status]?.label || r.status}</span></td>
                <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis'}}>{r.notes||'-'}</td>
                <td><div className="table-actions">
                  {r.status === 'confirmed' && <button className="action-btn-quick" style={{background:'rgba(59,130,246,0.15)',color:'#3b82f6'}} onClick={() => handleStatus(r.id,'seated')} title="Sentar">🍽️</button>}
                  {r.status === 'seated' && <button className="action-btn-quick" style={{background:'rgba(34,197,94,0.15)',color:'#22c55e'}} onClick={() => handleStatus(r.id,'completed')} title="Completar">✅</button>}
                  {r.status === 'confirmed' && <button className="action-btn-quick" style={{background:'rgba(239,68,68,0.15)',color:'#ef4444'}} onClick={() => handleStatus(r.id,'no_show')} title="No Show">❌</button>}
                  <button className="action-btn-quick" style={{background:'rgba(239,68,68,0.15)',color:'#ef4444'}} onClick={() => setCancelId(r.id)} title="Cancelar">🗑️</button>
                </div></td>
              </tr>
            ))}</tbody></table>
        </div></div>
      )}

      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Nueva Reserva</h2>
            <form onSubmit={handleSave}><div className="modal-form">
              <div className="form-group full-width"><label className="form-label">Cliente *</label>
                <input type="text" className="form-input" value={form.customer_name} onChange={e => setForm(f=>({...f,customer_name:e.target.value}))} required autoFocus /></div>
              <div className="form-group"><label className="form-label">Teléfono</label>
                <input type="tel" className="form-input" value={form.customer_phone} onChange={e => setForm(f=>({...f,customer_phone:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Personas</label>
                <input type="number" className="form-input" min="1" max="20" value={form.party_size} onChange={e => setForm(f=>({...f,party_size:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Fecha *</label>
                <input type="date" className="form-input" value={form.reservation_date} onChange={e => setForm(f=>({...f,reservation_date:e.target.value}))} required /></div>
              <div className="form-group"><label className="form-label">Hora *</label>
                <input type="time" className="form-input" value={form.reservation_time} onChange={e => setForm(f=>({...f,reservation_time:e.target.value}))} required /></div>
              <div className="form-group"><label className="form-label">Mesa</label>
                <select className="form-select" value={form.table_id} onChange={e => setForm(f=>({...f,table_id:e.target.value}))}>
                  <option value="">Auto-asignar</option>
                  {tables.map(t => <option key={t.id} value={t.id}>Mesa {t.table_number}</option>)}
                </select></div>
              <div className="form-group full-width"><label className="form-label">Notas</label>
                <textarea className="form-textarea" rows="2" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} /></div>
            </div>
            <div className="modal-actions" style={{marginTop:'1.5rem'}}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Crear Reserva'}</button>
            </div></form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!cancelId} title="Cancelar Reserva" message="¿Cancelar esta reserva?"
        icon="🗑️" confirmText="Cancelar Reserva" confirmClass="btn-danger" onConfirm={handleCancel} onCancel={() => setCancelId(null)} />
    </div>
  );
}
