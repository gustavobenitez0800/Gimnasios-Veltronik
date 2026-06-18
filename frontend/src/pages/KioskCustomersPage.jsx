// ============================================
// VELTRONIK V2 - CLIENTES / FIADO (KIOSCO)
// ============================================
// Cuenta corriente: clientes, saldos (lo que deben),
// registrar pagos y ver el libro mayor de la cuenta.
// El saldo lo computa el backend (Σ movimientos).
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { kioskService } from '../services';
import { PageHeader, ConfirmDialog, EmptyState } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';

const fmtMoney = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('es-AR')}`);
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const MOV_LABELS = { DEBT: 'Fiado', PAYMENT: 'Pago' };

const EMPTY_CUSTOMER = { fullName: '', phone: '', dniCuit: '', creditLimit: '', active: 'yes' };

export default function KioskCustomersPage() {
  const { showToast } = useToast();
  const { orgRole } = useAuth();
  const canManage = orgRole === 'owner' || orgRole === 'admin';

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_CUSTOMER);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const [payFor, setPayFor] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const [movsFor, setMovsFor] = useState(null);
  const [movs, setMovs] = useState([]);

  const loadAll = useCallback(async () => {
    try {
      setCustomers(await kioskService.getCustomers());
    } catch (err) {
      showToast(err.message || 'Error al cargar los clientes', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalDebt = useMemo(() => customers.reduce((acc, c) => acc + Math.max(0, Number(c.balance || 0)), 0), [customers]);
  const debtors = useMemo(() => customers.filter((c) => Number(c.balance || 0) > 0).length, [customers]);

  const openNew = () => { setEditing(null); setForm(EMPTY_CUSTOMER); setModal(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ fullName: c.fullName, phone: c.phone || '', dniCuit: c.dniCuit || '', creditLimit: c.creditLimit ?? '', active: c.active ? 'yes' : 'no' });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) { showToast('Ingresá el nombre', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        dniCuit: form.dniCuit.trim() || null,
        creditLimit: form.creditLimit !== '' ? Number(form.creditLimit) : 0,
        active: form.active === 'yes',
      };
      if (editing) { await kioskService.updateCustomer(editing.id, payload); showToast('Cliente actualizado', 'success'); }
      else { await kioskService.createCustomer(payload); showToast('Cliente creado', 'success'); }
      setModal(false); loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await kioskService.deleteCustomer(toDelete.id);
      showToast('Cliente eliminado', 'success'); setToDelete(null); loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar', 'error');
    }
  };

  const openPay = (c) => { setPayFor(c); setPayAmount(''); setPayNotes(''); };
  const handlePay = async (e) => {
    e.preventDefault();
    if (payAmount === '' || Number(payAmount) <= 0) { showToast('Ingresá un monto válido', 'error'); return; }
    setPaying(true);
    try {
      await kioskService.registerCustomerPayment(payFor.id, Number(payAmount), payNotes.trim() || null);
      showToast('Pago registrado', 'success'); setPayFor(null); loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo registrar el pago', 'error');
    } finally { setPaying(false); }
  };

  const openMovements = async (c) => {
    setMovsFor(c); setMovs([]);
    try { setMovs(await kioskService.getCustomerMovements(c.id)); }
    catch (err) { showToast(err.message || 'Error al cargar movimientos', 'error'); }
  };

  return (
    <div>
      <PageHeader
        title="Clientes / Fiado"
        subtitle="Cuenta corriente: saldos, pagos y movimientos"
        icon="users"
        actions={canManage && <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size="1em" /> Nuevo cliente</button>}
      />

      {loading ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}><span className="spinner" /> Cargando...</div>
      ) : (
        <>
          <div className="card mb-3">
            <div className="kiosk-stat-row">
              <div className="kiosk-stat"><span className="kiosk-stat-label">Total adeudado</span><span className="kiosk-stat-value kiosk-stock-low">{fmtMoney(totalDebt)}</span></div>
              <div className="kiosk-stat"><span className="kiosk-stat-label">Clientes con deuda</span><span className="kiosk-stat-value">{debtors}</span></div>
              <div className="kiosk-stat"><span className="kiosk-stat-label">Clientes</span><span className="kiosk-stat-value">{customers.length}</span></div>
            </div>
          </div>

          {customers.length === 0 ? (
            <EmptyState icon="users" title="Sin clientes"
              description="Cargá clientes para poder venderles a cuenta corriente (fiado)."
              action={canManage && <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size="1em" /> Nuevo cliente</button>} />
          ) : (
            <div className="card">
              <DataTable
                columns={[
                  { key: 'name', label: 'Cliente', render: (c) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.fullName}</div>
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>{[c.phone, c.dniCuit].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                  ) },
                  { key: 'limit', label: 'Límite', render: (c) => (Number(c.creditLimit) > 0 ? fmtMoney(c.creditLimit) : 'Sin límite') },
                  { key: 'balance', label: 'Debe', render: (c) => (
                    Number(c.balance) > 0 ? <span className="kiosk-stock-low">{fmtMoney(c.balance)}</span> : <span className="text-muted">Al día</span>
                  ) },
                  { key: 'state', label: 'Estado', render: (c) => <Badge status={c.active ? 'active' : 'inactive'} label={c.active ? 'Activo' : 'Inactivo'} /> },
                  { key: 'actions', label: '', render: (c) => (
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openMovements(c)} title="Movimientos"><Icon name="list" size="1em" /></button>
                      {Number(c.balance) > 0 && <button className="btn btn-primary btn-sm" onClick={() => openPay(c)} title="Cobrar"><Icon name="dollarSign" size="1em" /></button>}
                      {canManage && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)} title="Editar"><Icon name="edit" size="1em" /></button>}
                      {canManage && <button className="btn btn-danger btn-sm" onClick={() => setToDelete(c)} title="Eliminar"><Icon name="trash" size="1em" /></button>}
                    </div>
                  ) },
                ]}
                data={customers}
                emptyMessage="Sin clientes."
              />
            </div>
          )}
        </>
      )}

      {/* ─── Modal alta/edición ─── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <ModalForm onSubmit={handleSave}>
          <FormField label="Nombre" required value={form.fullName} onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} />
          <FormField label="Teléfono" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <FormField label="DNI / CUIT" value={form.dniCuit} onChange={(v) => setForm((f) => ({ ...f, dniCuit: v }))} />
          <FormField label="Límite de fiado" type="number" min="0" placeholder="0 = sin límite"
            value={form.creditLimit} onChange={(v) => setForm((f) => ({ ...f, creditLimit: v }))}
            hint="Si es mayor a 0, una venta fiada que lo supere se bloquea" />
          <FormField label="Estado" type="select" options={[{ value: 'yes', label: 'Activo' }, { value: 'no', label: 'Inactivo' }]}
            value={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          <ModalActions onCancel={() => setModal(false)} saving={saving} />
        </ModalForm>
      </Modal>

      {/* ─── Modal pago ─── */}
      <Modal isOpen={!!payFor} onClose={() => setPayFor(null)} title={`Cobrar a ${payFor?.fullName || ''}`}>
        <ModalForm onSubmit={handlePay}>
          <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>
            Debe <strong className="kiosk-stock-low">{fmtMoney(payFor?.balance)}</strong>. Ingresá cuánto paga.
          </p>
          <FormField label="Monto del pago" type="number" min="0" required value={payAmount} onChange={setPayAmount} fullWidth />
          <FormField label="Nota" placeholder="Opcional" value={payNotes} onChange={setPayNotes} fullWidth />
          <ModalActions onCancel={() => setPayFor(null)} saving={paying} submitText="Registrar pago" />
        </ModalForm>
      </Modal>

      {/* ─── Modal movimientos ─── */}
      <Modal isOpen={!!movsFor} onClose={() => setMovsFor(null)} title={`Cuenta de ${movsFor?.fullName || ''}`}>
        <DataTable
          columns={[
            { key: 'date', label: 'Fecha', render: (m) => fmtDateTime(m.createdAt) },
            { key: 'type', label: 'Tipo', render: (m) => <Badge status={m.type === 'PAYMENT' ? 'active' : 'pending'} label={MOV_LABELS[m.type] || m.type} /> },
            { key: 'amount', label: 'Monto', render: (m) => (
              <span className={m.type === 'PAYMENT' ? 'kiosk-stock-up' : 'kiosk-stock-low'}>
                {m.type === 'PAYMENT' ? '−' : '+'}{fmtMoney(m.amount)}
              </span>
            ) },
            { key: 'notes', label: 'Nota', render: (m) => m.notes || '—' },
          ]}
          data={movs}
          emptyMessage="Sin movimientos."
        />
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={`¿Eliminar a ${toDelete?.fullName}?`}
        message="Si el cliente tiene movimientos de cuenta corriente, el sistema no lo borra; desactivalo."
        confirmText="Eliminar"
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
