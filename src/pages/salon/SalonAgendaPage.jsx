// ============================================
// VELTRONIK SALON - AGENDA PAGE (Calendar)
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { salonAppointmentService, salonClientService, salonServiceService, salonStylistService, salonSaleService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader } from '../../components/Layout';
import Icon from '../../components/Icon';

const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`); // 08:00 - 21:00
const STATUS_LABELS = { confirmed: 'Confirmado', in_progress: 'En curso', completed: 'Completado', cancelled: 'Cancelado', no_show: 'No vino' };
const STATUS_BADGES = { confirmed: 'badge-primary', in_progress: 'badge-warning', completed: 'badge-success', cancelled: 'badge-error', no_show: 'badge-error' };

const addMinutes = (time, mins) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const timeToMinutes = (t) => { const [h, m] = (t || '08:00').split(':').map(Number); return h * 60 + m; };

export default function SalonAgendaPage() {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState([]);
  const [stylists, setStylists] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // New appointment modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ client_id: '', service_id: '', stylist_id: '', start_time: '09:00', notes: '' });
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [newClientName, setNewClientName] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail / action modal
  const [detailModal, setDetailModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);

  // Payment modal
  const [payModal, setPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const [payTip, setPayTip] = useState(0);
  const [paying, setPaying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [a, st, sv, cl] = await Promise.all([
        salonAppointmentService.getByDate(selectedDate),
        salonStylistService.getActive(),
        salonServiceService.getActive(),
        salonClientService.getAll(),
      ]);
      setAppointments(a || []);
      setStylists(st || []);
      setServices(sv || []);
      setClients(cl || []);
    } catch { showToast('Error al cargar agenda', 'error'); }
    finally { setLoading(false); }
  }, [showToast, selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Client search
  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); return; }
    const q = clientSearch.toLowerCase();
    setClientResults(clients.filter(c => c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 8));
  }, [clientSearch, clients]);

  // Selected service duration
  const selectedService = services.find(s => s.id === form.service_id);
  const endTime = selectedService ? addMinutes(form.start_time, selectedService.duration_min) : addMinutes(form.start_time, 30);

  const changeDate = (delta) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const goToday = () => setSelectedDate(new Date().toISOString().split('T')[0]);

  const dayLabel = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [selectedDate]);

  // Open new appointment modal
  const openNewAppt = (stylistId, time) => {
    setForm({ client_id: '', service_id: services[0]?.id || '', stylist_id: stylistId || stylists[0]?.id || '', start_time: time || '09:00', notes: '' });
    setClientSearch('');
    setNewClientName('');
    setClientResults([]);
    setModalOpen(true);
  };

  // Create appointment
  const handleCreateAppt = async () => {
    if (!form.service_id) { showToast('Seleccioná un servicio', 'error'); return; }
    if (!form.stylist_id) { showToast('Seleccioná un estilista', 'error'); return; }

    // Create client inline if needed
    let clientId = form.client_id;
    if (!clientId && newClientName.trim()) {
      try {
        const newClient = await salonClientService.create({ full_name: newClientName.trim() });
        clientId = newClient.id;
      } catch (err) { showToast('Error al crear cliente: ' + (err.message || ''), 'error'); return; }
    }

    setSaving(true);
    try {
      const svc = services.find(s => s.id === form.service_id);
      const calcEnd = addMinutes(form.start_time, svc?.duration_min || 30);

      // Check availability
      const available = await salonAppointmentService.checkAvailability(form.stylist_id, selectedDate, form.start_time, calcEnd);
      if (!available) { showToast('⚠️ El estilista ya tiene un turno en ese horario', 'error'); setSaving(false); return; }

      await salonAppointmentService.create({
        client_id: clientId || null,
        service_id: form.service_id,
        stylist_id: form.stylist_id,
        appointment_date: selectedDate,
        start_time: form.start_time,
        end_time: calcEnd,
        price: svc?.price || 0,
        notes: form.notes || null,
        status: 'confirmed',
      });
      showToast('Turno agendado ✅', 'success');
      setModalOpen(false);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  // Open appointment detail
  const openDetail = (appt) => { setSelectedAppt(appt); setDetailModal(true); };

  // Change appointment status
  const changeStatus = async (newStatus) => {
    if (!selectedAppt) return;
    try {
      await salonAppointmentService.update(selectedAppt.id, { status: newStatus });
      showToast('Estado actualizado', 'success');
      setDetailModal(false);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  // Open payment
  const openPay = () => { setPayMethod('cash'); setPayTip(0); setPayModal(true); };

  // Process payment
  const handlePay = async () => {
    if (!selectedAppt) return;
    setPaying(true);
    try {
      // Create sale
      await salonSaleService.create({
        appointment_id: selectedAppt.id,
        client_id: selectedAppt.client_id,
        stylist_id: selectedAppt.stylist_id,
        total: parseFloat(selectedAppt.price || selectedAppt.service?.price || 0),
        tip: parseFloat(payTip) || 0,
        payment_method: payMethod,
        items: [{ service_id: selectedAppt.service_id, name: selectedAppt.service?.name || 'Servicio', price: parseFloat(selectedAppt.price || 0), quantity: 1 }],
      });
      // Mark as completed
      await salonAppointmentService.update(selectedAppt.id, { status: 'completed' });
      showToast('Cobrado correctamente 💰', 'success');
      setPayModal(false);
      setDetailModal(false);
      loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setPaying(false); }
  };

  // ─── Render Agenda Grid ───
  const startHour = 8;
  const endHour = 22;
  const totalMinutes = (endHour - startHour) * 60;
  const pixelsPerMinute = 1.2;

  return (
    <div className="salon-agenda-page">
      <PageHeader title="Agenda" subtitle={dayLabel} icon="calendar"
        actions={<button className="btn btn-primary" onClick={() => openNewAppt()}><Icon name="plus" /> Nuevo Turno</button>} />

      {/* Date Navigation */}
      <div className="card mb-3">
        <div className="table-header">
          <div className="flex items-center gap-1">
            <button className="btn btn-sm btn-secondary" onClick={() => changeDate(-1)}>◀</button>
            <button className="btn btn-sm btn-primary" onClick={goToday}>Hoy</button>
            <button className="btn btn-sm btn-secondary" onClick={() => changeDate(1)}>▶</button>
            <input type="date" className="form-input" style={{ maxWidth: 170, marginLeft: '0.5rem' }} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <span className="text-muted">{appointments.filter(a => a.status !== 'cancelled').length} turnos</span>
        </div>
      </div>

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando agenda...</div> :
        stylists.length === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>💇</div>
            <h3>Sin estilistas registrados</h3>
            <p className="text-muted mb-2">Primero agregá al menos un estilista para poder agendar turnos</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'auto' }}>
            {/* Header: stylist names */}
            <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${stylists.length}, 1fr)`, borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 5 }}>
              <div style={{ padding: '0.75rem 0.25rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hora</div>
              {stylists.map(st => (
                <div key={st.id} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderLeft: '1px solid var(--border-color)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: st.color || '#8B5CF6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.75rem', marginBottom: 4 }}>
                    {(st.full_name || '?')[0]}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{st.full_name}</div>
                </div>
              ))}
            </div>

            {/* Time Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${stylists.length}, 1fr)`, position: 'relative', minHeight: totalMinutes * pixelsPerMinute }}>
              {/* Time labels */}
              <div style={{ position: 'relative' }}>
                {HOURS.map(h => {
                  const mins = timeToMinutes(h) - startHour * 60;
                  return (
                    <div key={h} style={{ position: 'absolute', top: mins * pixelsPerMinute, width: '100%', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '2px 4px', borderTop: '1px solid var(--border-color)' }}>
                      {h}
                    </div>
                  );
                })}
              </div>

              {/* Columns per stylist */}
              {stylists.map(st => {
                const stAppts = appointments.filter(a => a.stylist_id === st.id && a.status !== 'cancelled');
                return (
                  <div key={st.id} style={{ position: 'relative', borderLeft: '1px solid var(--border-color)' }}
                    onClick={(e) => {
                      // Click on empty area to create appointment
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const mins = Math.round((y / pixelsPerMinute + startHour * 60) / 15) * 15;
                      const hour = String(Math.floor(mins / 60)).padStart(2, '0');
                      const min = String(mins % 60).padStart(2, '0');
                      openNewAppt(st.id, `${hour}:${min}`);
                    }}>
                    {/* Hour gridlines */}
                    {HOURS.map(h => {
                      const mins = timeToMinutes(h) - startHour * 60;
                      return <div key={h} style={{ position: 'absolute', top: mins * pixelsPerMinute, width: '100%', height: 1, background: 'var(--border-color)' }} />;
                    })}

                    {/* Appointment blocks */}
                    {stAppts.map(a => {
                      const top = (timeToMinutes(a.start_time) - startHour * 60) * pixelsPerMinute;
                      const height = (timeToMinutes(a.end_time) - timeToMinutes(a.start_time)) * pixelsPerMinute;
                      const color = a.service?.color || a.stylist?.color || '#0EA5E9';
                      const isCompleted = a.status === 'completed';
                      return (
                        <div key={a.id} onClick={(e) => { e.stopPropagation(); openDetail(a); }}
                          style={{
                            position: 'absolute', top, left: 4, right: 4, height: Math.max(height, 24),
                            background: isCompleted ? 'rgba(34,197,94,0.15)' : `${color}20`,
                            border: `2px solid ${isCompleted ? '#22c55e' : color}`,
                            borderRadius: 8, padding: '4px 8px', cursor: 'pointer', overflow: 'hidden', zIndex: 2,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                          <div style={{ fontWeight: 700, fontSize: '0.7rem', color: isCompleted ? '#22c55e' : color }}>{a.start_time?.slice(0, 5)}</div>
                          <div style={{ fontWeight: 600, fontSize: '0.75rem', lineHeight: 1.2 }}>{a.service?.name || 'Servicio'}</div>
                          {height > 40 && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{a.client?.full_name || 'Sin cliente'}</div>}
                          {height > 55 && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formatCurrency(a.price || 0)}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* ── New Appointment Modal ── */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Nuevo Turno</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <div className="modal-form">
              {/* Client */}
              <div className="form-group full-width">
                <label className="form-label">Cliente</label>
                {form.client_id ? (
                  <div className="flex items-center gap-1">
                    <span className="badge badge-primary">{clients.find(c => c.id === form.client_id)?.full_name || 'Cliente'}</span>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setForm(f => ({ ...f, client_id: '' })); setClientSearch(''); }}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    <input type="text" className="form-input" placeholder="Buscar cliente por nombre o teléfono..."
                      value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                    {clientResults.length > 0 && (
                      <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, marginTop: 4 }}>
                        {clientResults.map(c => (
                          <div key={c.id} className="search-result-item" style={{ cursor: 'pointer', padding: '8px 12px' }}
                            onClick={() => { setForm(f => ({ ...f, client_id: c.id })); setClientSearch(''); setClientResults([]); }}>
                            <strong>{c.full_name}</strong>{c.phone && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>{c.phone}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {clientSearch && clientResults.length === 0 && (
                      <div style={{ marginTop: 4 }}>
                        <input type="text" className="form-input" placeholder="Nombre del nuevo cliente" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Se creará un nuevo cliente automáticamente</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Service */}
              <div className="form-group full-width">
                <label className="form-label">Servicio *</label>
                <select className="form-select" value={form.service_id} onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}>
                  <option value="">Seleccionar servicio</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)} · {s.duration_min} min</option>)}
                </select>
              </div>

              {/* Stylist */}
              <div className="form-group">
                <label className="form-label">Estilista *</label>
                <select className="form-select" value={form.stylist_id} onChange={e => setForm(f => ({ ...f, stylist_id: e.target.value }))}>
                  <option value="">Seleccionar</option>
                  {stylists.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>

              {/* Time */}
              <div className="form-group">
                <label className="form-label">Hora inicio</label>
                <input type="time" className="form-input" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                {selectedService && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Fin estimado: {endTime} ({selectedService.duration_min} min)</p>}
              </div>

              {/* Notes */}
              <div className="form-group full-width">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" rows="2" placeholder="Observaciones..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateAppt} disabled={saving}>
                {saving ? <><span className="spinner" /> Agendando...</> : 'Agendar Turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Appointment Detail Modal ── */}
      {detailModal && selectedAppt && (
        <div className="modal-overlay modal-show" onClick={() => setDetailModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Turno — {selectedAppt.start_time?.slice(0, 5)}</h2>
              <button type="button" onClick={() => setDetailModal(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div className="payment-history-item"><span>👤 Cliente</span><strong>{selectedAppt.client?.full_name || 'Sin asignar'}</strong></div>
              <div className="payment-history-item"><span>✂️ Servicio</span><strong>{selectedAppt.service?.name || '-'}</strong></div>
              <div className="payment-history-item"><span>💇 Estilista</span><strong>{selectedAppt.stylist?.full_name || '-'}</strong></div>
              <div className="payment-history-item"><span>⏰ Horario</span><strong>{selectedAppt.start_time?.slice(0, 5)} — {selectedAppt.end_time?.slice(0, 5)}</strong></div>
              <div className="payment-history-item"><span>💰 Precio</span><strong>{formatCurrency(selectedAppt.price || selectedAppt.service?.price || 0)}</strong></div>
              <div className="payment-history-item"><span>📋 Estado</span><span className={`badge ${STATUS_BADGES[selectedAppt.status] || 'badge-neutral'}`}>{STATUS_LABELS[selectedAppt.status] || selectedAppt.status}</span></div>
              {selectedAppt.notes && <div className="payment-history-item"><span>📝 Notas</span><span>{selectedAppt.notes}</span></div>}
            </div>

            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              {selectedAppt.status === 'confirmed' && (
                <>
                  <button className="btn btn-primary" onClick={() => changeStatus('in_progress')}>▶️ Iniciar</button>
                  <button className="btn btn-danger" onClick={() => changeStatus('cancelled')}>❌ Cancelar</button>
                  <button className="btn btn-secondary" onClick={() => changeStatus('no_show')}>🚫 No vino</button>
                </>
              )}
              {selectedAppt.status === 'in_progress' && (
                <button className="btn btn-primary" onClick={openPay}>💰 Cobrar y Finalizar</button>
              )}
              {(selectedAppt.status === 'confirmed' || selectedAppt.status === 'in_progress') && (
                <button className="btn btn-secondary" onClick={openPay}>💰 Cobrar</button>
              )}
              <button className="btn btn-secondary" onClick={() => setDetailModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ── */}
      {payModal && selectedAppt && (
        <div className="modal-overlay modal-show" onClick={() => setPayModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>💰 Cobrar Turno</h2>
              <button type="button" onClick={() => setPayModal(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <div className="payment-history-item" style={{ marginBottom: '1rem' }}>
              <span>{selectedAppt.service?.name || 'Servicio'}</span>
              <strong style={{ fontSize: '1.1rem' }}>{formatCurrency(selectedAppt.price || selectedAppt.service?.price || 0)}</strong>
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Método de pago</label>
              <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                <option value="cash">💵 Efectivo</option>
                <option value="card">💳 Tarjeta</option>
                <option value="transfer">🏦 Transferencia</option>
                <option value="mercadopago">📱 MercadoPago</option>
              </select>
            </div>
            <div className="form-group mb-2">
              <label className="form-label">Propina (opcional)</label>
              <input type="number" className="form-input" step="0.01" min="0" value={payTip} onChange={e => setPayTip(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPayModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handlePay} disabled={paying}>
                {paying ? <><span className="spinner" /> Procesando...</> : 'Confirmar Cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
