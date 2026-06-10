// ============================================
// VELTRONIK V2 - CLIENTES (FUTBOL_5)
// ============================================
// Clientes del complejo. El teléfono normalizado es la
// identidad (lo usará el bot de WhatsApp en Fase 3).
// noShowCount alimenta la lista de no-presentados.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { courtService } from '../services';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, FilterBar, DataTable, Badge } from '../components/ui';
import Icon from '../components/Icon';

const EMPTY_FORM = { fullName: '', phone: '', email: '', notes: '' };

export default function CourtCustomersPage() {
  const { showToast } = useToast();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setCustomers(await courtService.getCustomers());
    } catch (err) {
      showToast(err.message || 'Error al cargar clientes', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      c.fullName.toLowerCase().includes(q) || (c.phone || '').includes(q.replace(/\D/g, '') || q));
  }, [customers, search]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ fullName: c.fullName, phone: c.phone, email: c.email || '', notes: c.notes || '' });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim()) {
      showToast('Nombre y teléfono son obligatorios', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await courtService.updateCustomer(editing.id, payload);
        showToast('Cliente actualizado', 'success');
      } else {
        await courtService.createCustomer(payload);
        showToast('Cliente creado', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err.message || 'Error al guardar el cliente', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await courtService.deleteCustomer(deleting.id);
      showToast('Cliente eliminado', 'success');
      setDeleting(null);
      load();
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar el cliente', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${customers.length} clientes del complejo`}
        icon="users"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size="1em" /> Nuevo cliente
          </button>
        }
      />

      <FilterBar
        onSearch={(e) => setSearch(e.target.value)}
        searchPlaceholder="Buscar por nombre o teléfono..."
        count={filtered.length}
        countLabel="clientes"
      />

      <DataTable
        columns={[
          { key: 'fullName', label: 'Nombre' },
          { key: 'phone', label: 'Teléfono' },
          { key: 'email', label: 'Email', render: (c) => c.email || '—' },
          {
            key: 'noShowCount', label: 'No-shows',
            render: (c) => c.noShowCount > 0
              ? <Badge status="suspended" label={`${c.noShowCount} no-show${c.noShowCount > 1 ? 's' : ''}`} />
              : <span className="text-muted">—</span>,
          },
          {
            key: 'actions', label: '',
            render: (c) => (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
                  <Icon name="edit" size="1em" />
                </button>
                <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDeleting(c); }}>
                  <Icon name="trash" size="1em" />
                </button>
              </div>
            ),
          },
        ]}
        data={filtered}
        loading={loading}
        emptyMessage="Sin clientes todavía. Se crean solos al reservar desde la grilla, o cargalos acá."
        onRowClick={openEdit}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <ModalForm onSubmit={handleSave}>
          <FormField
            label="Nombre" required placeholder="Ej: Juan Pérez"
            value={form.fullName}
            onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
          />
          <FormField
            label="Teléfono" type="tel" required placeholder="Ej: 376 412-3456"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            hint="Identifica al cliente: no puede repetirse"
          />
          <FormField
            label="Email" type="email" placeholder="Opcional"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          />
          <FormField
            label="Notas" type="textarea" fullWidth placeholder="Ej: equipo de los lunes, paga siempre por transferencia"
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          />
          <ModalActions onCancel={() => setModalOpen(false)} saving={saving} />
        </ModalForm>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`¿Eliminar a ${deleting?.fullName}?`}
        message="Se elimina el cliente y su historial de turnos. Esta acción no se puede deshacer."
        confirmText="Eliminar"
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
