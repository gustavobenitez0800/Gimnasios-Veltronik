// ============================================
// VELTRONIK V2 - CANCHAS (FUTBOL_5)
// ============================================
// CRUD de canchas + configuración del vertical
// (slot, horarios, seña) + precios por franja.
// ============================================

import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { courtService } from '../services';
import { PageHeader, ConfirmDialog, EmptyState } from '../components/Layout';
import { Modal, ModalForm, ModalActions, FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

const SURFACES = ['SINTETICO', 'CESPED', 'CEMENTO', 'PARQUET'];
const SURFACE_LABELS = { SINTETICO: 'Sintético', CESPED: 'Césped natural', CEMENTO: 'Cemento', PARQUET: 'Parquet' };
const DAYS = [
  { value: '', label: 'Todos los días' },
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];
const DAY_LABELS = Object.fromEntries(DAYS.filter(d => d.value !== '').map(d => [d.value, d.label]));

const EMPTY_COURT = { name: '', surface: 'SINTETICO', covered: false, active: true, displayOrder: 0, notes: '' };
const EMPTY_RULE = { courtId: '', dayOfWeek: '', timeFrom: '18:00', timeTo: '23:00', price: '' };

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const fmtMoney = (v) => (v === null || v === undefined || v === '' ? '—' : `$${Number(v).toLocaleString('es-AR')}`);

export default function CourtsPage() {
  const { showToast } = useToast();
  const { orgRole } = useAuth();

  const [courts, setCourts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal de cancha
  const [courtModal, setCourtModal] = useState(false);
  const [courtForm, setCourtForm] = useState(EMPTY_COURT);
  const [editingCourt, setEditingCourt] = useState(null);
  const [deleteCourt, setDeleteCourt] = useState(null);
  const [saving, setSaving] = useState(false);

  // Configuración
  const [settingsForm, setSettingsForm] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [savingOnline, setSavingOnline] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reglas de precio
  const [ruleModal, setRuleModal] = useState(false);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [deleteRule, setDeleteRule] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [courtsData, settingsData, rulesData] = await Promise.all([
        courtService.getCourts(),
        courtService.getSettings(),
        courtService.getPriceRules(),
      ]);
      setCourts(courtsData);
      setSettings(settingsData);
      setSettingsForm({
        slotDurationMinutes: settingsData.slotDurationMinutes,
        openingTime: hhmm(settingsData.openingTime),
        closingTime: hhmm(settingsData.closingTime),
        defaultPrice: settingsData.defaultPrice ?? '',
        depositAmount: settingsData.depositAmount ?? '',
        depositTimeoutMinutes: settingsData.depositTimeoutMinutes,
        paymentAlias: settingsData.paymentAlias ?? '',
        botEnabled: !!settingsData.botEnabled,
        waPhoneNumberId: settingsData.waPhoneNumberId ?? '',
        waAccessToken: '',
        waConfigured: !!settingsData.waConfigured,
        botInstructions: settingsData.botInstructions ?? '',
        publicBookingEnabled: !!settingsData.publicBookingEnabled,
        whatsappNumber: settingsData.whatsappNumber ?? '',
        publicToken: settingsData.publicToken ?? '',
      });
      setRules(rulesData);
    } catch (err) {
      showToast(err.message || 'Error al cargar canchas', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Canchas ───

  const openNewCourt = () => {
    setEditingCourt(null);
    setCourtForm({ ...EMPTY_COURT, displayOrder: courts.length + 1 });
    setCourtModal(true);
  };

  const openEditCourt = (c) => {
    setEditingCourt(c);
    setCourtForm({
      name: c.name, surface: c.surface || 'SINTETICO', covered: c.covered,
      active: c.active, displayOrder: c.displayOrder, notes: c.notes || '',
    });
    setCourtModal(true);
  };

  const handleSaveCourt = async (e) => {
    e.preventDefault();
    if (!courtForm.name.trim()) { showToast('Ingresá el nombre de la cancha', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name: courtForm.name.trim(),
        surface: courtForm.surface,
        covered: courtForm.covered,
        active: courtForm.active,
        displayOrder: Number(courtForm.displayOrder) || 0,
        notes: courtForm.notes.trim() || null,
      };
      if (editingCourt) {
        await courtService.updateCourt(editingCourt.id, payload);
        showToast('Cancha actualizada', 'success');
      } else {
        await courtService.createCourt(payload);
        showToast('Cancha creada', 'success');
      }
      setCourtModal(false);
      loadAll();
    } catch (err) {
      showToast(err.message || 'Error al guardar la cancha', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourt = async () => {
    try {
      await courtService.deleteCourt(deleteCourt.id);
      showToast('Cancha eliminada', 'success');
      setDeleteCourt(null);
      loadAll();
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar (¿tiene turnos?)', 'error');
    }
  };

  // ─── Configuración ───

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await courtService.updateSettings({
        slotDurationMinutes: Number(settingsForm.slotDurationMinutes),
        openingTime: settingsForm.openingTime,
        closingTime: settingsForm.closingTime,
        defaultPrice: settingsForm.defaultPrice !== '' ? Number(settingsForm.defaultPrice) : null,
        depositAmount: settingsForm.depositAmount !== '' ? Number(settingsForm.depositAmount) : null,
        depositTimeoutMinutes: Number(settingsForm.depositTimeoutMinutes),
        paymentAlias: settingsForm.paymentAlias.trim(),
      });
      showToast('Configuración guardada', 'success');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Error al guardar la configuración', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveBot = async (e) => {
    e.preventDefault();
    setSavingBot(true);
    try {
      const payload = {
        botEnabled: settingsForm.botEnabled,
        waPhoneNumberId: settingsForm.waPhoneNumberId.trim(),
        botInstructions: settingsForm.botInstructions.trim(),
      };
      // El token solo viaja si lo cargaste (en blanco = mantener el actual).
      if (settingsForm.waAccessToken.trim()) payload.waAccessToken = settingsForm.waAccessToken.trim();
      await courtService.updateSettings(payload);
      showToast('Bot de WhatsApp guardado', 'success');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Error al guardar el bot', 'error');
    } finally {
      setSavingBot(false);
    }
  };

  const handleSaveOnline = async (e) => {
    e.preventDefault();
    setSavingOnline(true);
    try {
      await courtService.updateSettings({
        publicBookingEnabled: settingsForm.publicBookingEnabled,
        whatsappNumber: settingsForm.whatsappNumber.trim(),
      });
      showToast('Reservas online guardadas', 'success');
      loadAll(); // refresca el token recién generado
    } catch (err) {
      showToast(err.message || 'Error al guardar reservas online', 'error');
    } finally {
      setSavingOnline(false);
    }
  };

  // Link público que el dueño comparte. En web usa el origin actual; en Electron, el fallback.
  const publicLink = (() => {
    if (!settingsForm?.publicToken) return '';
    const base = (typeof window !== 'undefined' && window.location.protocol.startsWith('http'))
      ? window.location.origin
      : CONFIG.PUBLIC_WEB_URL;
    return `${base}/#/reservar/${settingsForm.publicToken}`;
  })();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('No se pudo copiar; copialo a mano', 'error');
    }
  };

  // ─── Reglas de precio ───

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (ruleForm.price === '') { showToast('Ingresá el precio de la franja', 'error'); return; }
    setSaving(true);
    try {
      await courtService.createPriceRule({
        courtId: ruleForm.courtId || null,
        dayOfWeek: ruleForm.dayOfWeek !== '' ? Number(ruleForm.dayOfWeek) : null,
        timeFrom: ruleForm.timeFrom,
        timeTo: ruleForm.timeTo,
        price: Number(ruleForm.price),
      });
      showToast('Regla de precio creada', 'success');
      setRuleModal(false);
      setRuleForm(EMPTY_RULE);
      loadAll();
    } catch (err) {
      showToast(err.message || 'Error al crear la regla', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async () => {
    try {
      await courtService.deletePriceRule(deleteRule.id);
      showToast('Regla eliminada', 'success');
      setDeleteRule(null);
      loadAll();
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar la regla', 'error');
    }
  };

  // Config sensible (precios, seña, bot): solo dueño/admin. El backend igual lo gatea (403).
  if (orgRole && orgRole !== 'owner' && orgRole !== 'admin') {
    return <Navigate to="/court-grid" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Canchas"
        subtitle="Canchas, horarios y precios del complejo"
        icon="futbol"
        actions={
          <button className="btn btn-primary" onClick={openNewCourt}>
            <Icon name="plus" size="1em" /> Nueva cancha
          </button>
        }
      />

      {loading ? (
        <div className="card text-center text-muted" style={{ padding: '3rem' }}>
          <span className="spinner" /> Cargando...
        </div>
      ) : (
        <>
          {/* ─── Canchas ─── */}
          {courts.length === 0 ? (
            <EmptyState
              icon="futbol"
              title="Sin canchas"
              description="Cargá tu primera cancha para que aparezca en la grilla."
              action={<button className="btn btn-primary" onClick={openNewCourt}><Icon name="plus" size="1em" /> Nueva cancha</button>}
            />
          ) : (
            <div className="court-cards-grid mb-3">
              {courts.map((c) => (
                <div key={c.id} className="card court-card-item">
                  <div className="court-card-title">
                    <span>{c.name}</span>
                    <Badge status={c.active ? 'active' : 'inactive'} label={c.active ? 'Activa' : 'Inactiva'} />
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                    {[SURFACE_LABELS[c.surface] || c.surface, c.covered ? 'Techada' : 'Descubierta'].filter(Boolean).join(' · ')}
                  </div>
                  {c.notes && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{c.notes}</div>}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditCourt(c)}>
                      <Icon name="edit" size="1em" /> Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteCourt(c)}>
                      <Icon name="trash" size="1em" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Configuración del vertical ─── */}
          {settingsForm && (
            <div className="card mb-3">
              <h3 style={{ marginTop: 0 }}><Icon name="settings" size="1em" /> Configuración de la grilla</h3>
              <form onSubmit={handleSaveSettings}>
                <div className="modal-form">
                  <FormField
                    label="Duración del turno (min)" type="number" min="15" max="240" step="15" required
                    value={settingsForm.slotDurationMinutes}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, slotDurationMinutes: v }))}
                    hint="Fútbol 5 = 60 minutos"
                  />
                  <FormField
                    label="Apertura" type="time" required
                    value={settingsForm.openingTime}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, openingTime: v }))}
                  />
                  <FormField
                    label="Cierre" type="time" required
                    value={settingsForm.closingTime}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, closingTime: v }))}
                  />
                  <FormField
                    label="Precio base del turno" type="number" min="0"
                    placeholder="Si ninguna franja matchea"
                    value={settingsForm.defaultPrice}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, defaultPrice: v }))}
                  />
                  <FormField
                    label="Seña por defecto" type="number" min="0"
                    placeholder="Ej: 5000"
                    value={settingsForm.depositAmount}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, depositAmount: v }))}
                  />
                  <FormField
                    label="Minutos para pagar la seña" type="number" min="5" max="1440" required
                    value={settingsForm.depositTimeoutMinutes}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, depositTimeoutMinutes: v }))}
                    hint="Pasado el tiempo, el turno se libera solo"
                  />
                  <FormField
                    label="Alias / CBU para señas" fullWidth
                    placeholder="Ej: cancha.popeye.mp"
                    value={settingsForm.paymentAlias}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, paymentAlias: v }))}
                    hint="Se incluye en el mensaje de WhatsApp cuando pedís la seña"
                  />
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingSettings}>
                    {savingSettings ? <><span className="spinner" /> Guardando...</> : 'Guardar configuración'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ─── Bot de WhatsApp ─── */}
          {settingsForm && (
            <div className="card mb-3">
              <h3 style={{ marginTop: 0 }}><Icon name="messageCircle" size="1em" /> Bot de WhatsApp</h3>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '-0.25rem' }}>
                Atiende a tus clientes 24/7: responde disponibilidad y precios, y toma reservas
                (esperando seña). Si no entiende o piden una persona, deja de responder y queda para vos.
              </p>
              <form onSubmit={handleSaveBot}>
                <div className="modal-form">
                  <FormField
                    label="Bot activo" type="select"
                    value={settingsForm.botEnabled ? 'yes' : 'no'}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, botEnabled: v === 'yes' }))}
                    options={[{ value: 'no', label: 'Desactivado' }, { value: 'yes', label: 'Activado' }]}
                    hint="Necesita el número y el token cargados para funcionar"
                  />
                  <FormField
                    label="Phone Number ID (Meta)"
                    placeholder="Ej: 123456789012345"
                    value={settingsForm.waPhoneNumberId}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, waPhoneNumberId: v }))}
                    hint="Lo da Meta (WhatsApp Cloud API) para tu número"
                  />
                  <FormField
                    label="Token de acceso (Meta)" type="password"
                    placeholder={settingsForm.waConfigured ? '•••••••• (ya configurado)' : 'Pegá el token de Graph API'}
                    value={settingsForm.waAccessToken}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, waAccessToken: v }))}
                    hint={settingsForm.waConfigured ? 'Dejalo en blanco para mantener el actual' : 'Token permanente del System User'}
                  />
                  <FormField
                    label="Datos extra para el bot" type="textarea" fullWidth
                    placeholder="Ej: Hay estacionamiento. Cantina con cerveza y pizzas. No se permite fumar."
                    value={settingsForm.botInstructions}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, botInstructions: v }))}
                    hint="El bot usa esto para responder mejor (opcional)"
                  />
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingBot}>
                    {savingBot ? <><span className="spinner" /> Guardando...</> : 'Guardar bot'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ─── Reservas online ─── */}
          {settingsForm && (
            <div className="card mb-3">
              <h3 style={{ marginTop: 0 }}><Icon name="globe" size="1em" /> Reservas online</h3>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '-0.25rem' }}>
                Compartí un link y tus clientes reservan solos: eligen horario, el turno queda
                esperando seña y te mandan el comprobante. Menos WhatsApp manual para el mostrador.
              </p>
              <form onSubmit={handleSaveOnline}>
                <div className="modal-form">
                  <FormField
                    label="Reservas online" type="select"
                    value={settingsForm.publicBookingEnabled ? 'yes' : 'no'}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, publicBookingEnabled: v === 'yes' }))}
                    options={[{ value: 'no', label: 'Desactivadas' }, { value: 'yes', label: 'Activadas' }]}
                    hint="Al activarlas se genera el link para compartir"
                  />
                  <FormField
                    label="WhatsApp de la cancha" type="tel" placeholder="Ej: 376 412-3456"
                    value={settingsForm.whatsappNumber}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, whatsappNumber: v }))}
                    hint="A este número el cliente te manda el comprobante de la seña"
                  />
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingOnline}>
                    {savingOnline ? <><span className="spinner" /> Guardando...</> : 'Guardar reservas online'}
                  </button>
                </div>
              </form>
              {settingsForm.publicBookingEnabled && publicLink && (
                <div className="court-public-link">
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>Tu link para compartir (ponelo en el estado de WhatsApp, Instagram, etc.):</span>
                  <div className="court-public-link-row">
                    <input className="form-input" readOnly value={publicLink} onFocus={(e) => e.target.select()} />
                    <button type="button" className="btn btn-secondary" onClick={copyLink}>
                      <Icon name={copied ? 'check' : 'clipboard'} size="1em" /> {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Precios por franja ─── */}
          <div className="card mb-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}><Icon name="dollarSign" size="1em" /> Precios por franja</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => { setRuleForm(EMPTY_RULE); setRuleModal(true); }}>
                <Icon name="plus" size="1em" /> Nueva franja
              </button>
            </div>
            <DataTable
              columns={[
                { key: 'courtName', label: 'Cancha', render: (r) => r.courtName || 'Todas' },
                { key: 'dayOfWeek', label: 'Día', render: (r) => (r.dayOfWeek ? DAY_LABELS[r.dayOfWeek] : 'Todos') },
                { key: 'range', label: 'Franja', render: (r) => `${hhmm(r.timeFrom)} – ${hhmm(r.timeTo)}` },
                { key: 'price', label: 'Precio', render: (r) => fmtMoney(r.price) },
                {
                  key: 'actions', label: '', render: (r) => (
                    <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDeleteRule(r); }}>
                      <Icon name="trash" size="1em" />
                    </button>
                  ),
                },
              ]}
              data={rules}
              emptyMessage="Sin reglas: todos los turnos usan el precio base. Agregá franjas (ej: nocturna más cara)."
            />
          </div>
        </>
      )}

      {/* ─── Modal cancha ─── */}
      <Modal isOpen={courtModal} onClose={() => setCourtModal(false)} title={editingCourt ? 'Editar cancha' : 'Nueva cancha'}>
        <ModalForm onSubmit={handleSaveCourt}>
          <FormField
            label="Nombre" required placeholder="Ej: Cancha 1 - Techada"
            value={courtForm.name}
            onChange={(v) => setCourtForm((f) => ({ ...f, name: v }))}
          />
          <FormField
            label="Superficie" type="select"
            value={courtForm.surface}
            onChange={(v) => setCourtForm((f) => ({ ...f, surface: v }))}
            options={SURFACES.map((s) => ({ value: s, label: SURFACE_LABELS[s] }))}
          />
          <FormField
            label="Techada" type="select"
            value={courtForm.covered ? 'yes' : 'no'}
            onChange={(v) => setCourtForm((f) => ({ ...f, covered: v === 'yes' }))}
            options={[{ value: 'no', label: 'Descubierta' }, { value: 'yes', label: 'Techada' }]}
          />
          <FormField
            label="Orden en la grilla" type="number" min="0"
            value={courtForm.displayOrder}
            onChange={(v) => setCourtForm((f) => ({ ...f, displayOrder: v }))}
          />
          <FormField
            label="Estado" type="select"
            value={courtForm.active ? 'yes' : 'no'}
            onChange={(v) => setCourtForm((f) => ({ ...f, active: v === 'yes' }))}
            options={[{ value: 'yes', label: 'Activa (aparece en la grilla)' }, { value: 'no', label: 'Inactiva' }]}
          />
          <FormField
            label="Notas" type="textarea" fullWidth placeholder="Opcional"
            value={courtForm.notes}
            onChange={(v) => setCourtForm((f) => ({ ...f, notes: v }))}
          />
          <ModalActions onCancel={() => setCourtModal(false)} saving={saving} />
        </ModalForm>
      </Modal>

      {/* ─── Modal regla de precio ─── */}
      <Modal isOpen={ruleModal} onClose={() => setRuleModal(false)} title="Nueva franja de precio">
        <ModalForm onSubmit={handleSaveRule}>
          <FormField
            label="Cancha" type="select"
            value={ruleForm.courtId}
            onChange={(v) => setRuleForm((f) => ({ ...f, courtId: v }))}
            options={[{ value: '', label: 'Todas las canchas' }, ...courts.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <FormField
            label="Día" type="select"
            value={ruleForm.dayOfWeek}
            onChange={(v) => setRuleForm((f) => ({ ...f, dayOfWeek: v }))}
            options={DAYS}
          />
          <FormField
            label="Desde" type="time" required
            value={ruleForm.timeFrom}
            onChange={(v) => setRuleForm((f) => ({ ...f, timeFrom: v }))}
          />
          <FormField
            label="Hasta" type="time" required
            value={ruleForm.timeTo}
            onChange={(v) => setRuleForm((f) => ({ ...f, timeTo: v }))}
          />
          <FormField
            label="Precio del turno" type="number" min="0" required placeholder="Ej: 30000"
            value={ruleForm.price}
            onChange={(v) => setRuleForm((f) => ({ ...f, price: v }))}
          />
          <ModalActions onCancel={() => setRuleModal(false)} saving={saving} submitText="Crear franja" />
        </ModalForm>
      </Modal>

      <ConfirmDialog
        open={!!deleteCourt}
        title={`¿Eliminar ${deleteCourt?.name}?`}
        message="Se eliminan también sus turnos históricos. Si solo querés sacarla de la grilla, marcala como Inactiva."
        confirmText="Eliminar"
        onCancel={() => setDeleteCourt(null)}
        onConfirm={handleDeleteCourt}
      />

      <ConfirmDialog
        open={!!deleteRule}
        title="¿Eliminar la franja de precio?"
        message="Los turnos nuevos en esa franja pasan a usar el precio base."
        confirmText="Eliminar"
        onCancel={() => setDeleteRule(null)}
        onConfirm={handleDeleteRule}
      />
    </div>
  );
}
