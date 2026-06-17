// ============================================
// VELTRONIK V2 - GRILLA DE TURNOS (FUTBOL_5)
// ============================================
// El Tablero de Comando del complejo: columnas = canchas,
// filas = slots según la config del tenant (60' en F5).
// 🟩 libre · 🟨 esperando seña · 🟥 confirmado · ⬛ bloqueo.
// Drag & drop entre canchas/horarios; el backend valida la
// colisión (409 = "se acaba de ocupar") y la grilla se recarga.
//
// Cierra el loop del dueño: barra resumen + caja del día (cuánto
// entró y cómo), cobro al cerrar el turno, y WhatsApp 1-click
// (confirmar / pedir seña / recordatorio) — el canal real del rubro.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { courtService } from '../services';
import { confirmMessage, depositMessage, reminderMessage, waLink } from '../lib/whatsapp';
import { PageHeader, ConfirmDialog, EmptyState } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';
import { Link } from 'react-router-dom';

// ─── Helpers de fecha/hora (todo en hora local AR, igual que el backend) ───

const pad = (n) => String(n).padStart(2, '0');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(dateISO, days) {
  const d = new Date(`${dateISO}T12:00:00`); // mediodía: inmune a DST
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "09:00:00" | "09:00" → minutos del día. */
const toMinutes = (t) => {
  const [h, m] = String(t).split(':');
  return Number(h) * 60 + Number(m);
};

const toHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Slots de la grilla según settings: [{ start: "09:00", end: "10:00" }, ...] */
function buildSlots(settings) {
  if (!settings) return [];
  const slot = settings.slotDurationMinutes || 60;
  const open = toMinutes(settings.openingTime || '09:00');
  let close = toMinutes(settings.closingTime || '23:00');
  if (close <= open) close = 24 * 60 - 1; // config inválida: no dejar la grilla vacía
  const slots = [];
  for (let t = open; t + slot <= close + 1; t += slot) {
    slots.push({ start: toHHMM(t), end: toHHMM(Math.min(t + slot, 24 * 60 - 1)) });
  }
  return slots;
}

/** Duraciones ofrecidas al crear: del slot base hasta x4, de a 30'. */
function buildDurations(slot) {
  const base = slot || 60;
  const out = [];
  for (let d = base; d <= base * 4; d += 30) out.push(d);
  return out;
}

function durationLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h}h ${m}min`;
}

const fmtMoney = (v) =>
  v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('es-AR')}`;

const DAY_TITLES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function dateTitle(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`);
  return `${DAY_TITLES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

const STATUS_LABELS = {
  PENDING_DEPOSIT: 'Esperando seña',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Seña vencida',
  NO_SHOW: 'No vino',
  MAINTENANCE: 'Bloqueada',
};

const METHOD_LABELS = { CASH: 'Efectivo', TRANSFER: 'Transferencia', MP: 'Mercado Pago' };

// Estados que se dibujan en la grilla (cancelados/expirados liberan el slot).
const VISIBLE_STATUSES = ['PENDING_DEPOSIT', 'CONFIRMED', 'MAINTENANCE', 'COMPLETED', 'NO_SHOW'];

const EMPTY_FORM = {
  courtId: '', time: '', durationMinutes: '', status: 'CONFIRMED',
  customerId: '', customerName: '', customerPhone: '',
  totalPrice: '', depositAmount: '', notes: '',
};

export default function CourtGridPage() {
  const { showToast } = useToast();
  const { orgName } = useAuth();

  const [date, setDate] = useState(todayISO());
  const [grid, setGrid] = useState(null); // { settings, courts, bookings }
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal de creación
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);

  // Modal de detalle + confirmación de cancelación
  const [detail, setDetail] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [acting, setActing] = useState(false);

  // Modal de cobro (seña o cierre) y caja del día
  const [cobro, setCobro] = useState(null); // { mode: 'deposit'|'complete', booking, amount, method }
  const [cajaOpen, setCajaOpen] = useState(false);

  // Drag & drop
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null); // `${courtId}|${slot}`

  const loadGrid = useCallback(async (d) => {
    try {
      const data = await courtService.getGrid(d);
      setGrid(data);
    } catch (err) {
      showToast(err.message || 'Error al cargar la grilla', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadSummary = useCallback(async (d) => {
    try {
      setSummary(await courtService.getSummary(d));
    } catch { /* el resumen es secundario: no romper la grilla si falla */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadGrid(date);
    loadSummary(date);
  }, [date, loadGrid, loadSummary]);

  // Clientes para el modal: una sola carga al montar (no por apertura de modal).
  useEffect(() => {
    courtService.getCustomers().then(setCustomers).catch(() => { /* opcional */ });
  }, []);

  // Refresco suave cada 60s: el cron del backend libera señas vencidas y la grilla lo refleja.
  useEffect(() => {
    const t = setInterval(() => { loadGrid(date); loadSummary(date); }, 60_000);
    return () => clearInterval(t);
  }, [date, loadGrid, loadSummary]);

  // ─── Updates locales (UI instantánea): las acciones patchean el estado con el DTO
  // que devuelve el backend, sin pagar el round-trip de recargar toda la grilla. ───

  const addBookingLocal = useCallback((b) => {
    setGrid((g) => (g ? { ...g, bookings: [...g.bookings, b] } : g));
    // Si la reserva creó un cliente nuevo inline, sumarlo al combo sin otra request.
    if (b.customerId) {
      setCustomers((cs) => cs.some((c) => c.id === b.customerId)
        ? cs
        : [...cs, { id: b.customerId, fullName: b.customerName, phone: b.customerPhone }]);
    }
  }, []);

  const patchBookingLocal = useCallback((b) => {
    setGrid((g) => (g ? { ...g, bookings: g.bookings.map((x) => (x.id === b.id ? b : x)) } : g));
  }, []);

  const slots = useMemo(() => buildSlots(grid?.settings), [grid]);
  const courts = grid?.courts || [];

  // Index de turnos visibles por cancha (en minutos, para resolver solapamientos).
  const bookingsByCourt = useMemo(() => {
    const map = {};
    for (const b of grid?.bookings || []) {
      if (!VISIBLE_STATUSES.includes(b.status)) continue;
      if (!map[b.courtId]) map[b.courtId] = [];
      map[b.courtId].push({
        ...b,
        startMin: toMinutes(b.startAt.slice(11, 16)),
        endMin: toMinutes(b.endAt.slice(11, 16)) || 24 * 60 - 1, // termina 00:00 = fin del día
      });
    }
    return map;
  }, [grid]);

  const cellBooking = (courtId, slot) => {
    const sMin = toMinutes(slot.start);
    const eMin = toMinutes(slot.end);
    const list = bookingsByCourt[courtId] || [];
    return list.find((b) => b.startMin < eMin && b.endMin > sMin) || null;
  };

  // ─── Crear turno ───

  const openCreate = (courtId, slot) => {
    setForm({
      ...EMPTY_FORM,
      courtId,
      time: slot.start,
      durationMinutes: grid?.settings?.slotDurationMinutes || 60,
    });
    setCreateOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (form.status !== 'MAINTENANCE' && !form.customerId && !form.customerPhone.trim()) {
      showToast('Indicá el cliente (existente o nombre y teléfono)', 'error');
      return;
    }
    setSaving(true);
    try {
      const startMin = toMinutes(form.time);
      const dur = Number(form.durationMinutes) || (grid?.settings?.slotDurationMinutes || 60);
      const endMin = Math.min(startMin + dur, 24 * 60 - 1);
      const created = await courtService.createBooking({
        courtId: form.courtId,
        startAt: `${date}T${form.time}:00`,
        endAt: `${date}T${toHHMM(endMin)}:00`,
        status: form.status,
        customerId: form.customerId || null,
        customerName: form.customerName.trim() || null,
        customerPhone: form.customerPhone.trim() || null,
        totalPrice: form.totalPrice !== '' ? Number(form.totalPrice) : null,
        depositAmount: form.depositAmount !== '' ? Number(form.depositAmount) : null,
        notes: form.notes.trim() || null,
      });
      showToast(form.status === 'MAINTENANCE' ? 'Cancha bloqueada' : 'Turno creado', 'success');
      setCreateOpen(false);
      addBookingLocal(created); // pinta al instante, sin round-trip extra
      loadSummary(date);
    } catch (err) {
      showToast(err.message || 'Error al crear el turno', 'error');
      if (err?.response?.status === 409) loadGrid(date);
    } finally {
      setSaving(false);
    }
  };

  // ─── Acciones sobre un turno ───

  const runAction = async (fn, okMsg) => {
    setActing(true);
    try {
      const updated = await fn();
      showToast(okMsg, 'success');
      setDetail(null);
      setConfirmCancel(false);
      setCobro(null);
      if (updated?.id) patchBookingLocal(updated); // sin recargar toda la grilla
      else loadGrid(date);
      loadSummary(date); // los números del día cambian: refrescamos la barra/caja
    } catch (err) {
      showToast(err.message || 'No se pudo completar la acción', 'error');
    } finally {
      setActing(false);
    }
  };

  // ─── Cobro (seña / cierre) ───

  const openDeposit = (b) => {
    setDetail(null);
    setCobro({
      mode: 'deposit', booking: b,
      amount: b.depositAmount != null ? String(b.depositAmount) : '',
      method: 'CASH',
    });
  };

  const openComplete = (b) => {
    const paidDeposit = b.depositPaidAt && b.depositAmount ? Number(b.depositAmount) : 0;
    const balance = b.totalPrice != null ? Math.max(0, Number(b.totalPrice) - paidDeposit) : '';
    setDetail(null);
    setCobro({
      mode: 'complete', booking: b,
      amount: balance === '' ? '' : String(balance),
      method: 'CASH',
    });
  };

  const submitCobro = (e) => {
    e.preventDefault();
    const { mode, booking, amount, method } = cobro;
    if (mode === 'deposit') {
      runAction(() => courtService.confirmBooking(booking.id, method), 'Seña confirmada — turno asegurado');
    } else {
      runAction(
        () => courtService.completeBooking(booking.id, {
          amountPaid: amount !== '' ? Number(amount) : null, method,
        }),
        'Turno cobrado y cerrado',
      );
    }
  };

  // ─── WhatsApp 1-click ───

  const openWhatsApp = (builder) => {
    if (!detail?.customerPhone) {
      showToast('Este turno no tiene teléfono cargado', 'error');
      return;
    }
    const text = builder({ booking: detail, venueName: orgName, alias: grid?.settings?.paymentAlias });
    const url = waLink(detail.customerPhone, text);
    if (!url) { showToast('El teléfono no es válido para WhatsApp', 'error'); return; }
    window.open(url, '_blank', 'noopener');
  };

  // ─── Drag & drop ───

  const handleDrop = async (courtId, slot) => {
    setDragOver(null);
    if (!dragId) return;
    const id = dragId;
    setDragId(null);

    // OPTIMISTA: la tarjeta se mueve YA; si el backend rechaza (409), se revierte.
    const previous = grid?.bookings.find((b) => b.id === id);
    if (!previous) return;
    const durationMin = (toMinutes(previous.endAt.slice(11, 16)) || 24 * 60) -
      toMinutes(previous.startAt.slice(11, 16));
    const startAt = `${date}T${slot.start}:00`;
    const endMin = Math.min(toMinutes(slot.start) + durationMin, 24 * 60 - 1);
    const courtName = courts.find((c) => c.id === courtId)?.name || previous.courtName;
    patchBookingLocal({ ...previous, courtId, courtName, startAt, endAt: `${date}T${toHHMM(endMin)}:00` });

    try {
      const moved = await courtService.moveBooking(id, courtId, startAt);
      patchBookingLocal(moved);
      showToast('Turno movido', 'success');
    } catch (err) {
      patchBookingLocal(previous); // revertir
      showToast(err.message || 'No se pudo mover el turno', 'error');
      if (err?.response?.status === 409) loadGrid(date);
    }
  };

  // ─── Render ───

  const gridTemplate = { gridTemplateColumns: `72px repeat(${courts.length}, minmax(150px, 1fr))` };

  return (
    <div>
      <PageHeader
        title="Grilla de Turnos"
        subtitle={`Turnos del ${dateTitle(date)}`}
        icon="grid"
        actions={
          <div className="court-date-nav">
            <button className="btn btn-secondary" onClick={() => setDate(shiftDate(date, -1))} title="Día anterior">
              <Icon name="chevronLeft" size="1em" />
            </button>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button className="btn btn-secondary" onClick={() => setDate(shiftDate(date, 1))} title="Día siguiente">
              <Icon name="chevronRight" size="1em" />
            </button>
            {date !== todayISO() && (
              <button className="btn btn-secondary" onClick={() => setDate(todayISO())}>Hoy</button>
            )}
          </div>
        }
      />

      {/* ─── Barra resumen del día ─── */}
      {summary && courts.length > 0 && (
        <div className="court-summary-bar">
          <SummaryStat icon="calendar" label="Turnos" value={summary.totalBookings} />
          <SummaryStat icon="grid" label="Ocupación" value={`${summary.occupancyPct}%`} />
          <SummaryStat icon="trendingUp" label="Esperado" value={fmtMoney(summary.expectedRevenue)} />
          <SummaryStat icon="dollarSign" label={`Caja ${dateTitle(date)}`} value={fmtMoney(summary.collectedToday)} accent />
          {summary.pendingDepositCount > 0 && (
            <SummaryStat icon="clock" label="Señas s/cobrar" value={summary.pendingDepositCount} warn />
          )}
          <button className="btn btn-secondary btn-sm court-caja-btn" onClick={() => setCajaOpen(true)}>
            <Icon name="wallet" size="1em" /> Ver caja
          </button>
        </div>
      )}

      {loading && !grid ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando grilla...
        </div>
      ) : courts.length === 0 ? (
        <EmptyState
          icon="futbol"
          title="Todavía no cargaste canchas"
          description="Creá tus canchas para empezar a tomar reservas en la grilla."
          action={
            <Link to={CONFIG.ROUTES.COURTS} className="btn btn-primary">
              <Icon name="plus" size="1em" /> Cargar canchas
            </Link>
          }
        />
      ) : (
        <div className="card court-grid-wrapper">
          <div className="court-grid" style={gridTemplate}>
            {/* Header */}
            <div className="court-grid-head" />
            {courts.map((c) => (
              <div key={c.id} className="court-grid-head" title={c.name}>
                {c.name}
                <span className="court-head-sub">
                  {[c.surface, c.covered ? 'Techada' : null].filter(Boolean).join(' · ') || ' '}
                </span>
              </div>
            ))}

            {/* Filas de slots */}
            {slots.map((slot) => (
              <CourtGridRow
                key={slot.start}
                slot={slot}
                courts={courts}
                cellBooking={cellBooking}
                dragId={dragId}
                dragOver={dragOver}
                setDragOver={setDragOver}
                setDragId={setDragId}
                onDrop={handleDrop}
                onCreate={openCreate}
                onDetail={setDetail}
              />
            ))}
          </div>

          {/* Leyenda */}
          <div className="court-grid-legend">
            <span className="court-legend-chip"><span className="court-legend-dot" style={{ background: 'rgba(34,197,94,0.45)' }} /> Libre</span>
            <span className="court-legend-chip"><span className="court-legend-dot" style={{ background: '#f59e0b' }} /> Esperando seña</span>
            <span className="court-legend-chip"><span className="court-legend-dot" style={{ background: '#ef4444' }} /> Confirmado</span>
            <span className="court-legend-chip"><span className="court-legend-dot" style={{ background: '#64748b' }} /> Bloqueada</span>
            <span className="text-muted" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
              Arrastrá un turno para moverlo de cancha u horario
            </span>
          </div>
        </div>
      )}

      {/* ─── Modal: nuevo turno ─── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo turno">
        <ModalForm onSubmit={handleCreate}>
          <FormField
            label="Cancha" type="select" required
            value={form.courtId}
            onChange={(v) => setForm((f) => ({ ...f, courtId: v }))}
            options={courts.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FormField
            label="Horario" type="select" required
            value={form.time}
            onChange={(v) => setForm((f) => ({ ...f, time: v }))}
            options={slots.map((s) => ({ value: s.start, label: `${s.start} – ${s.end}` }))}
          />
          <FormField
            label="Duración" type="select"
            value={form.durationMinutes}
            onChange={(v) => setForm((f) => ({ ...f, durationMinutes: v }))}
            options={buildDurations(grid?.settings?.slotDurationMinutes).map((d) => ({ value: d, label: durationLabel(d) }))}
            hint="Para cumpleaños o turnos largos, elegí más de 1 hora"
          />
          <FormField
            label="Tipo" type="select"
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            options={[
              { value: 'CONFIRMED', label: 'Reserva confirmada' },
              { value: 'PENDING_DEPOSIT', label: 'Esperando seña (se libera sola si no pagan)' },
              { value: 'MAINTENANCE', label: 'Bloqueo / Mantenimiento' },
            ]}
          />
          {form.status !== 'MAINTENANCE' && (
            <>
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
                    hint="El teléfono identifica al cliente (si ya existe, se reutiliza)"
                  />
                </>
              )}
              <FormField
                label="Precio del turno" type="number" min="0"
                placeholder="Automático según franja"
                value={form.totalPrice}
                onChange={(v) => setForm((f) => ({ ...f, totalPrice: v }))}
              />
              {form.status === 'PENDING_DEPOSIT' && (
                <FormField
                  label="Seña" type="number" min="0"
                  placeholder="Default de configuración"
                  value={form.depositAmount}
                  onChange={(v) => setForm((f) => ({ ...f, depositAmount: v }))}
                />
              )}
            </>
          )}
          <FormField
            label="Notas" type="textarea" fullWidth
            placeholder={form.status === 'MAINTENANCE' ? 'Ej: Escuelita / lluvia / arreglo de red' : 'Opcional'}
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          />
          <ModalActions onCancel={() => setCreateOpen(false)} saving={saving} submitText="Crear turno" />
        </ModalForm>
      </Modal>

      {/* ─── Modal: detalle del turno ─── */}
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.status === 'MAINTENANCE' ? 'Cancha bloqueada' : 'Detalle del turno'}
      >
        {detail && (
          <div>
            <div className="modal-form">
              <DetailRow label="Cancha" value={detail.courtName} />
              <DetailRow label="Horario" value={`${detail.startAt.slice(11, 16)} – ${detail.endAt.slice(11, 16)}`} />
              <DetailRow label="Estado" value={STATUS_LABELS[detail.status] || detail.status} />
              {detail.customerName && <DetailRow label="Cliente" value={detail.customerName} />}
              {detail.customerPhone && <DetailRow label="Teléfono" value={detail.customerPhone} />}
              {detail.totalPrice != null && <DetailRow label="Precio" value={fmtMoney(detail.totalPrice)} />}
              {detail.depositAmount != null && (
                <DetailRow
                  label="Seña"
                  value={`${fmtMoney(detail.depositAmount)}${detail.depositPaidAt
                    ? ` (pagada${detail.depositMethod ? ' · ' + METHOD_LABELS[detail.depositMethod] : ''})`
                    : ' (pendiente)'}`}
                />
              )}
              {detail.status === 'COMPLETED' && detail.amountPaid != null && (
                <DetailRow
                  label="Cobrado al cerrar"
                  value={`${fmtMoney(detail.amountPaid)}${detail.paymentMethod ? ' · ' + METHOD_LABELS[detail.paymentMethod] : ''}`}
                />
              )}
              {detail.status === 'PENDING_DEPOSIT' && detail.expiresAt && (
                <DetailRow label="Vence" value={detail.expiresAt.slice(11, 16)} />
              )}
              {detail.recurringId && <DetailRow label="Origen" value="Turno fijo semanal" />}
              {detail.notes && <DetailRow label="Notas" value={detail.notes} full />}
            </div>

            {/* WhatsApp 1-click */}
            {detail.customerPhone && ['PENDING_DEPOSIT', 'CONFIRMED'].includes(detail.status) && (
              <div className="court-wa-row">
                {detail.status === 'PENDING_DEPOSIT' && (
                  <button className="btn btn-wa" onClick={() => openWhatsApp(depositMessage)}>
                    <Icon name="messageCircle" size="1em" /> Pedir seña
                  </button>
                )}
                {detail.status === 'CONFIRMED' && (
                  <button className="btn btn-wa" onClick={() => openWhatsApp(confirmMessage)}>
                    <Icon name="messageCircle" size="1em" /> Confirmar
                  </button>
                )}
                <button className="btn btn-wa" onClick={() => openWhatsApp(reminderMessage)}>
                  <Icon name="messageCircle" size="1em" /> Recordatorio
                </button>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '1.5rem', flexWrap: 'wrap' }}>
              {detail.status === 'PENDING_DEPOSIT' && (
                <button className="btn btn-primary" disabled={acting} onClick={() => openDeposit(detail)}>
                  <Icon name="checkCircle" size="1em" /> Seña recibida
                </button>
              )}
              {detail.status === 'CONFIRMED' && (
                <>
                  <button className="btn btn-primary" disabled={acting} onClick={() => openComplete(detail)}>
                    <Icon name="dollarSign" size="1em" /> Cobrar y cerrar
                  </button>
                  <button className="btn btn-secondary" disabled={acting}
                    onClick={() => runAction(() => courtService.noShowBooking(detail.id), 'Marcado como no presentado')}>
                    <Icon name="xCircle" size="1em" /> No vinieron
                  </button>
                </>
              )}
              {['PENDING_DEPOSIT', 'CONFIRMED', 'MAINTENANCE'].includes(detail.status) && (
                <button className="btn btn-danger" disabled={acting} onClick={() => setConfirmCancel(true)}>
                  <Icon name="trash" size="1em" />
                  {detail.status === 'MAINTENANCE' ? 'Quitar bloqueo' : 'Cancelar turno'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Modal: cobro (seña / cierre) ─── */}
      <Modal
        isOpen={!!cobro}
        onClose={() => setCobro(null)}
        title={cobro?.mode === 'deposit' ? 'Registrar seña' : 'Cobrar y cerrar turno'}
      >
        {cobro && (
          <ModalForm onSubmit={submitCobro}>
            <div className="court-cobro-summary">
              <span>{cobro.booking.customerName || 'Turno'}</span>
              <span className="text-muted">
                {cobro.booking.courtName} · {cobro.booking.startAt.slice(11, 16)}
              </span>
              {cobro.booking.totalPrice != null && (
                <span className="text-muted">Total del turno: {fmtMoney(cobro.booking.totalPrice)}</span>
              )}
              {cobro.mode === 'complete' && cobro.booking.depositPaidAt && cobro.booking.depositAmount != null && (
                <span className="text-muted">Seña ya cobrada: {fmtMoney(cobro.booking.depositAmount)}</span>
              )}
            </div>
            <FormField
              label={cobro.mode === 'deposit' ? 'Monto de la seña' : 'Saldo a cobrar'}
              type="number" min="0" fullWidth
              value={cobro.amount}
              onChange={(v) => setCobro((c) => ({ ...c, amount: v }))}
            />
            <div className="form-group full-width">
              <label className="form-label">¿Cómo {cobro.mode === 'deposit' ? 'la recibís' : 'lo cobrás'}?</label>
              <MethodPicker value={cobro.method} onChange={(m) => setCobro((c) => ({ ...c, method: m }))} />
            </div>
            <ModalActions
              onCancel={() => setCobro(null)}
              saving={acting}
              submitText={cobro.mode === 'deposit' ? 'Confirmar seña' : 'Cobrar y cerrar'}
            />
          </ModalForm>
        )}
      </Modal>

      {/* ─── Modal: caja del día ─── */}
      <Modal isOpen={cajaOpen} onClose={() => setCajaOpen(false)} title={`Caja del ${dateTitle(date)}`}>
        {summary && (
          <div className="court-caja">
            <CajaRow label="Efectivo" value={fmtMoney(summary.collectedCash)} icon="wallet" />
            <CajaRow label="Transferencia" value={fmtMoney(summary.collectedTransfer)} icon="arrowRight" />
            <CajaRow label="Mercado Pago" value={fmtMoney(summary.collectedMp)} icon="creditCard" />
            <div className="court-caja-total">
              <span>Total cobrado</span>
              <span>{fmtMoney(summary.collectedToday)}</span>
            </div>
            <div className="court-caja-pending">
              <CajaRow label={`Señas sin cobrar (${summary.pendingDepositCount})`} value={fmtMoney(summary.pendingDepositAmount)} muted />
              <CajaRow label="Saldo por cobrar" value={fmtMoney(summary.pendingBalance)} muted />
            </div>
            <p className="text-muted" style={{ fontSize: '0.7rem', marginTop: '0.75rem' }}>
              La caja suma las señas y los saldos cuyo cobro se registró este día.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        title={detail?.status === 'MAINTENANCE' ? '¿Quitar el bloqueo?' : '¿Cancelar el turno?'}
        message={detail?.status === 'MAINTENANCE'
          ? 'La cancha vuelve a quedar libre en la grilla.'
          : `Se libera el slot de ${detail?.customerName || 'este turno'}. Esta acción no se puede deshacer.`}
        confirmText={detail?.status === 'MAINTENANCE' ? 'Quitar bloqueo' : 'Cancelar turno'}
        cancelText="Volver"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => runAction(() => courtService.cancelBooking(detail.id),
          detail?.status === 'MAINTENANCE' ? 'Bloqueo quitado' : 'Turno cancelado — slot liberado')}
      />
    </div>
  );
}

// ─── Sub-componentes ───

function SummaryStat({ icon, label, value, accent, warn }) {
  return (
    <div className={`court-stat${accent ? ' accent' : ''}${warn ? ' warn' : ''}`}>
      <Icon name={icon} size="1.1em" />
      <div className="court-stat-body">
        <span className="court-stat-value">{value}</span>
        <span className="court-stat-label">{label}</span>
      </div>
    </div>
  );
}

function MethodPicker({ value, onChange }) {
  const opts = [['CASH', 'Efectivo'], ['TRANSFER', 'Transferencia'], ['MP', 'Mercado Pago']];
  return (
    <div className="court-method-picker">
      {opts.map(([v, l]) => (
        <button
          type="button"
          key={v}
          className={`court-method-opt${value === v ? ' active' : ''}`}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function CajaRow({ label, value, icon, muted }) {
  return (
    <div className={`court-caja-row${muted ? ' muted' : ''}`}>
      <span className="court-caja-label">
        {icon && <Icon name={icon} size="1em" />} {label}
      </span>
      <span className="court-caja-value">{value}</span>
    </div>
  );
}

function CourtGridRow({ slot, courts, cellBooking, dragId, dragOver, setDragOver, setDragId, onDrop, onCreate, onDetail }) {
  return (
    <>
      <div className="court-grid-time">{slot.start}</div>
      {courts.map((court) => {
        const booking = cellBooking(court.id, slot);
        const key = `${court.id}|${slot.start}`;
        const isStart = booking && booking.startAt.slice(11, 16) === slot.start;
        const draggable = booking && ['PENDING_DEPOSIT', 'CONFIRMED', 'MAINTENANCE'].includes(booking.status);

        return (
          <div
            key={key}
            className={`court-grid-cell ${dragOver === key && !booking ? 'drag-over' : ''}`}
            onDragOver={!booking && dragId ? (e) => { e.preventDefault(); setDragOver(key); } : undefined}
            onDragLeave={() => dragOver === key && setDragOver(null)}
            onDrop={!booking && dragId ? (e) => { e.preventDefault(); onDrop(court.id, slot); } : undefined}
          >
            {booking ? (
              isStart ? (
                <div
                  className={`court-booking-card status-${booking.status}`}
                  draggable={draggable}
                  onDragStart={draggable ? () => setDragId(booking.id) : undefined}
                  onDragEnd={() => { setDragId(null); setDragOver(null); }}
                  onClick={() => onDetail(booking)}
                  title={`${booking.customerName || STATUS_LABELS[booking.status]} · ${booking.startAt.slice(11, 16)}–${booking.endAt.slice(11, 16)}`}
                >
                  <span className="court-booking-name">
                    {booking.status === 'MAINTENANCE'
                      ? (booking.notes || 'Bloqueada')
                      : (booking.customerName || 'Sin cliente')}
                  </span>
                  <span className="court-booking-meta">
                    {STATUS_LABELS[booking.status]}
                    {booking.totalPrice != null ? ` · ${fmtMoney(booking.totalPrice)}` : ''}
                  </span>
                </div>
              ) : (
                <div
                  className={`court-slot-cont court-booking-card status-${booking.status}`}
                  onClick={() => onDetail(booking)}
                  title="Continuación del turno anterior"
                />
              )
            ) : (
              <div className="court-slot-free" onClick={() => onCreate(court.id, slot)} title={`Reservar ${slot.start}`}>
                <Icon name="plus" size="1em" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function DetailRow({ label, value, full }) {
  return (
    <div className={`form-group${full ? ' full-width' : ''}`}>
      <label className="form-label">{label}</label>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
