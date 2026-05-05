// ============================================
// VELTRONIK SALON - CLIENTS PAGE
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { salonClientService } from '../../services';
import { formatCurrency } from '../../lib/utils';
import { PageHeader, ConfirmDialog } from '../../components/Layout';
import Icon from '../../components/Icon';

const INITIAL_FORM = { full_name: '', phone: '', email: '', notes: '', birthday: '', instagram: '' };

export default function SalonClientsPage() {
  const { showToast } = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // History
  const [historyModal, setHistoryModal] = useState(false);
  const [historyClient, setHistoryClient] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadData = useCallback(async () => {
    try { setLoading(true); setClients((await salonClientService.getAll()) || []); }
    catch { showToast('Error al cargar clientes', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c => c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q));
  }, [clients, search]);

  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ full_name: c.full_name||'', phone: c.phone||'', email: c.email||'', notes: c.notes||'', birthday: c.birthday||'', instagram: c.instagram||'' });
    setModalOpen(true);
  };

  const openHistory = async (client) => {
    setHistoryClient(client);
    setHistoryModal(true);
    setLoadingHistory(true);
    try { setHistory(await salonClientService.getHistory(client.id)); }
    catch { setHistory([]); }
    finally { setLoadingHistory(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { showToast('Nombre requerido', 'error'); return; }
    setSaving(true);
    try {
      const data = { ...form, birthday: form.birthday || null, instagram: form.instagram || null };
      if (editingId) { await salonClientService.update(editingId, data); showToast('Cliente actualizado', 'success'); }
      else { await salonClientService.create(data); showToast('Cliente creado', 'success'); }
      setModalOpen(false); loadData();
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await salonClientService.delete(deleteId); showToast('Cliente eliminado', 'success'); setDeleteId(null); loadData(); }
    catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  const STATUS_LABELS = { confirmed: 'Confirmado', in_progress: 'En curso', completed: 'Completado', cancelled: 'Cancelado', no_show: 'No vino' };
  const STATUS_BADGES = { confirmed: 'badge-primary', in_progress: 'badge-warning', completed: 'badge-success', cancelled: 'badge-error', no_show: 'badge-error' };

  return (
    <div className="salon-clients-page">
      <PageHeader title="Clientes" subtitle={`${clients.length} clientes registrados`} icon="users"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nuevo Cliente</button>} />

      <div className="card mb-3">
        <div className="table-header">
          <input type="text" className="search-input" placeholder="Buscar por nombre, teléfono o email..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 350 }} />
          <span className="text-muted">{filtered.length} resultados</span>
        </div>
      </div>

      {loading ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> : filtered.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>👥</div>
          <h3>{search ? 'Sin resultados' : 'Sin clientes registrados'}</h3>
          <p className="text-muted mb-2">{search ? 'Probá con otro término' : 'Agregá tu primer cliente'}</p>
          {!search && <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Agregar Cliente</button>}
        </div>
      ) : (
        <div className="card"><div className="table-container">
          <table className="table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Instagram</th><th>Notas</th><th>Acciones</th></tr></thead>
            <tbody>{filtered.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="flex items-center gap-1">
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                      {(c.full_name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <strong>{c.full_name}</strong>
                      {c.birthday && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>🎂 {c.birthday}</div>}
                    </div>
                  </div>
                </td>
                <td>{c.phone || '-'}</td>
                <td>{c.email || '-'}</td>
                <td>{c.instagram ? <span style={{ color: 'var(--primary-400)' }}>@{c.instagram}</span> : '-'}</td>
                <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.notes || '-'}</td>
                <td>
                  <div className="table-actions">
                    <button className="action-btn-quick" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }} onClick={() => openHistory(c)} title="Historial">📋</button>
                    <button className="action-btn-quick action-btn-payment" onClick={() => openEdit(c)}><Icon name="edit" /></button>
                    <button className="action-btn-quick" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} onClick={() => setDeleteId(c.id)}><Icon name="trash" /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody></table>
        </div></div>
      )}

      {/* Client Modal */}
      {modalOpen && (
        <div className="modal-overlay modal-show" onClick={() => setModalOpen(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editingId ? 'Editar' : 'Nuevo'} Cliente</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            <form onSubmit={handleSave}><div className="modal-form">
              <div className="form-group full-width"><label className="form-label">Nombre completo *</label>
                <input type="text" className="form-input" placeholder="Ej: Ana García" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required autoFocus /></div>
              <div className="form-group"><label className="form-label">Teléfono</label>
                <input type="tel" className="form-input" placeholder="+54 9 ..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Instagram</label>
                <input type="text" className="form-input" placeholder="@usuario" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Cumpleaños</label>
                <input type="date" className="form-input" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} /></div>
              <div className="form-group full-width"><label className="form-label">Notas / Preferencias</label>
                <textarea className="form-textarea" rows="3" placeholder="Alergias, preferencias de color, estilo favorito..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <><span className="spinner" /> Guardando...</> : 'Guardar'}</button>
            </div></form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyModal && historyClient && (
        <div className="modal-overlay modal-show" onClick={() => setHistoryModal(false)}>
          <div className="modal-container member-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>📋 Historial — {historyClient.full_name}</h2>
              <button type="button" onClick={() => setHistoryModal(false)} className="btn-icon" style={{ padding: '0.25rem' }}>&times;</button>
            </div>
            {loadingHistory ? <div className="dashboard-loading"><span className="spinner" /> Cargando...</div> :
              history.length === 0 ? (
                <div className="text-center text-muted" style={{ padding: '2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.3 }}>📋</div>
                  Sin turnos registrados para este cliente
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {history.map(h => (
                    <div key={h.id} className="payment-history-item">
                      <div>
                        <strong>{h.service?.name || 'Servicio'}</strong>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {h.appointment_date} · {h.start_time?.slice(0,5)} — {h.stylist?.full_name || 'Sin asignar'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <strong>{formatCurrency(h.price || h.service?.price || 0)}</strong>
                        <span className={`badge ${STATUS_BADGES[h.status] || 'badge-neutral'}`}>{STATUS_LABELS[h.status] || h.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setHistoryModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="Eliminar Cliente" message="¿Estás seguro? Se perderá el historial asociado."
        icon="🗑️" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
