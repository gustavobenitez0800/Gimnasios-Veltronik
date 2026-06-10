// ============================================
// VELTRONIK V2 - TURNOS FIJOS (FUTBOL_5)
// ============================================
// "Los lunes a las 21 la tiene Juan": plantillas semanales
// que el backend materializa como turnos CONFIRMED en la
// grilla (próximas 4 semanas, job diario + alta inmediata).
// ============================================

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { courtService } from '../services';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, DataTable, Badge } from '../components/ui';
import Icon from '../components/Icon';

const DAYS = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];
const DAY_LABELS = Object.fromEntries(DAYS.map((d) => [d.value, d.label]));

const EMPTY_FORM = {
  courtId: '', dayOfWeek: 1, startTime: '21:00', endTime: '',
  customerId: '', customerName: '', customerPhone: '',
  agreedPrice: '', validUntil: '', active: true, notes: '',
};

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const fmtMoney = (v) => (v === null || v === undefined || v === '' ? 'Según franja' : `$${Number(v).toLocaleString('es-AR')}`);

export default function CourtFixedPage() {
  const { showToast } = useToast();

  const [recurring, setRecurring] = useState([]);
  const [courts, setCourts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rec, crts, custs] = await Promise.all([
        courtService.getRecurring(),
        courtService.getCourts(),
        courtService.getCustomers(),
      ]);
      setRecurring(rec);
      setCourts(crts);
      setCustomers(custs);
    } catch (err) {
      showToast(err.message || 'Error al cargar turnos fijos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, courtId: courts[0]?.id || '' });
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      courtId: r.courtId, dayOfWeek: r.dayOfWeek,
      startTime: hhmm(r.startTime), endTime: hhmm(r.endTime),
      customerId: r.customerId || '', customerName: '', customerPhone: '',
      agreedPrice: r.agreedPrice ?? '', validUntil: r.validUntil || '',
      active: r.active, notes: r.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.courtId) { showToast('Elegí la cancha', 'error'); return; }
    if (!form.customerId && !form.customerPhone.trim()) {
      showToast('Indicá el cliente (existente o nombre y teléfono)', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        courtId: form.courtId,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime || null,
        customerId: form.customerId || null,
        customerName: form.customerName.trim() || null,
        customerPhone: form.customerPhone.trim() || null,
        agreedPrice: form.agreedPrice !== '' ? Number(form.agreedPrice) : null,
        validUntil: form.validUntil || null,
        active: form.active,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await courtService.updateRecurring(editing.id, payload);
        showToast('Turno fijo actualizado', 'success');
      } else {
        await courtService.createRecurring(payload);
        showToast('Turno fijo creado: ya está materializado en la grilla', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err.message || 'Error al guardar el turno fijo', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await courtService.deleteRecurring(deleting.id);
      showToast('Turno fijo eliminado: sus fechas futuras quedaron liberadas', 'success');
      setDeleting(null);
      load();
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar el turno fijo', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Turnos Fijos"
        subtitle="Reservas semanales que se cargan solas en la grilla"
        icon="calendar"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size="1em" /> Nuevo turno fijo
          </button>
        }
      />

      <DataTable
        columns={[
          { key: 'dayOfWeek', label: 'Día', render: (r) => DAY_LABELS[r.dayOfWeek] },
          { key: 'time', label: 'Horario', render: (r) => `${hhmm(r.startTime)} – ${hhmm(r.endTime)}` },
          { key: 'customerName', label: 'Cliente', render: (r) => `${r.customerName} (${r.customerPhone})` },
          { key: 'courtName', label: 'Cancha' },
          { key: 'agreedPrice', label: 'Precio', render: (r) => fmtMoney(r.agreedPrice) },
          {
            key: 'active', label: 'Estado',
            render: (r) => <Badge status={r.active ? 'active' : 'inactive'} label={r.active ? 'Activo' : 'Pausado'} />,
          },
          {
            key: 'actions', label: '',
            render: (r) => (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
                  <Icon name="edit" size="1em" />
                </button>
                <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDeleting(r); }}>
                  <Icon name="trash" size="1em" />
                </button>
              </div>
            ),
          },
        ]}
        data={recurring}
        loading={loading}
        emptyMessage='Sin turnos fijos. Creá el clásico "los lunes 21hs la tiene Juan" y la grilla se carga sola.'
        onRowClick={openEdit}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar turno fijo' : 'Nuevo turno fijo'}>
        <ModalForm onSubmit={handleSave}>
          <FormField
            label="Cancha" type="select" required
            value={form.courtId}
            onChange={(v) => setForm((f) => ({ ...f, courtId: v }))}
            options={[{ value: '', label: 'Elegí una cancha' }, ...courts.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <FormField
            label="Día de la semana" type="select" required
            value={form.dayOfWeek}
            onChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}
            options={DAYS}
          />
          <FormField
            label="Desde" type="time" required
            value={form.startTime}
            onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
          />
          <FormField
            label="Hasta" type="time"
            value={form.endTime}
            onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
            hint="Vacío = un turno completo"
          />
          <FormField
            label="Cliente existente" type="select"
            value={form.customerId}
            onChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
            options={[
              { value: '', label: '— Cliente nuevo —' },
              ...customers.map((c) => ({ value: c.id, label: `${c.fullName} (${c.phone})` })),
            ]}
          />
          {!form.customerId && (
            <>
              <FormField
                label="Nombre" placeholder="Ej: Juan del lunes"
                value={form.customerName}
                onChange={(v) => setForm((f) => ({ ...f, customerName: v }))}
              />
              <FormField
                label="Teléfono" type="tel" placeholder="Ej: 376 412-3456"
                value={form.customerPhone}
                onChange={(v) => setForm((f) => ({ ...f, customerPhone: v }))}
              />
            </>
          )}
          <FormField
            label="Precio pactado" type="number" min="0"
            placeholder="Vacío = según franja"
            value={form.agreedPrice}
            onChange={(v) => setForm((f) => ({ ...f, agreedPrice: v }))}
          />
          <FormField
            label="Vigente hasta" type="date"
            value={form.validUntil}
            onChange={(v) => setForm((f) => ({ ...f, validUntil: v }))}
            hint="Vacío = sin fecha de fin"
          />
          <FormField
            label="Estado" type="select"
            value={form.active ? 'yes' : 'no'}
            onChange={(v) => setForm((f) => ({ ...f, active: v === 'yes' }))}
            options={[
              { value: 'yes', label: 'Activo (se materializa en la grilla)' },
              { value: 'no', label: 'Pausado (libera sus fechas futuras)' },
            ]}
          />
          <FormField
            label="Notas" type="textarea" fullWidth placeholder="Opcional"
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          />
          <ModalActions onCancel={() => setModalOpen(false)} saving={saving} />
        </ModalForm>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="¿Eliminar el turno fijo?"
        message={`Se cancelan las fechas futuras de ${deleting?.customerName} (${deleting ? DAY_LABELS[deleting.dayOfWeek] : ''} ${hhmm(deleting?.startTime)}). Los turnos ya jugados no se tocan.`}
        confirmText="Eliminar"
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
