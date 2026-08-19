// ============================================
// VELTRONIK V2 - AJUSTES
// ============================================
// Datos del negocio, suscripción (cambiar tarjeta, verificar con MP, cancelar),
// tema, y la sección de Equipos (qué computadora está enrolada a esta sucursal).
// Las dos cargas son independientes a propósito: si falla la de equipos, Ajustes
// sigue funcionando.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { gymService, errorService, deviceService } from '../services';
import { formatCurrency, timeAgo } from '../lib/utils';
import { GYM } from '../lib/gym';
import { getDeviceId } from '../lib/deviceId';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { apiCall } from '../lib/api';
import apiClient from '../lib/apiClient';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';
import LogoPicker from '../components/LogoPicker';
import GymLogo from '../components/GymLogo';

/**
 * `SubscriptionActions` llega por prop desde la tabla de rutas (Fase 4).
 *
 * Acá antes se importaba CardCheckout directo, y con él el SDK de Mercado Pago. Como
 * Ajustes también va en la app de escritorio, ese import metía el SDK en el instalador
 * aunque el formulario de tarjeta nunca se dibujara. Un `if` no alcanzaba: el import es
 * estático, y lo que se importa se empaqueta.
 *
 * Ahora cada bundle inyecta su variante — Web con el Brick, Escritorio con el botón al
 * portal — y este archivo no nombra ninguna de las dos.
 */
export default function SettingsPage({ SubscriptionActions }) {
  const { showToast } = useToast();
  const { user, gym: authGym, profile, logout, refreshAuth, orgRole } = useAuth();
  const { preference, setTheme } = useTheme();
  const currentRole = orgRole;
  const orgLabel = GYM.placeLabel;
  const orgLabelCap = GYM.placeLabelCap;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Gym form
  const [gymForm, setGymForm] = useState({ name: '', address: '', phone: '', email: '', logoUrl: null, logoEmoji: null });

  // Subscription info
  const [subscriptionInfo, setSubscriptionInfo] = useState({
    plan: 'Veltronik Pro', status: 'active', nextPayment: '--', amount: '--',
    hasSubscription: false
  });

  // Action states
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [verifyingSubscription, setVerifyingSubscription] = useState(false);
  // `showCardForm` se fue con el bloque de tarjeta: ahora es estado interno de
  // SubscriptionActionsWeb, que es quien dibuja el formulario.

  // Equipos (Fase 1: registro + bautizo — docs/FASE1-PLAN.md)
  const canManageDevices = ['owner', 'admin'].includes(currentRole);
  const thisDeviceId = getDeviceId();
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ role: 'CAJA', displayName: '' });
  const [enrollConfirm, setEnrollConfirm] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState(null); // Caja Madre en conflicto (409)
  const [revokeTarget, setRevokeTarget] = useState(null);
  const thisDevice = devices.find((d) => d.id === thisDeviceId);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch gym data (fresh from DB)
      const gymData = authGym || await gymService.getCurrent();
      if (!gymData) { setLoading(false); return; }

      setGymForm({
        name: gymData.name || '',
        address: gymData.address || '',
        phone: gymData.phone || '',
        email: gymData.email || '',
        logoUrl: gymData.logoUrl || null,
        logoEmoji: gymData.logoEmoji || null,
      });

      // Subscription info
      let nextPaymentText = '--';
      let hasSubscription = false;

      // Si el tenant está activo y tiene trialEndsAt en el futuro → está en período válido
      try {
        const tenantId = authGym?.id || localStorage.getItem('current_org_id');
        if (tenantId) {
          const subRes = await apiClient.get(`/tenants/${tenantId}/subscription`);
          if (subRes.status === 200 && subRes.data) {
            hasSubscription = true;
          }
        }
      } catch {
        // Sin suscripción MP activa — puede estar en trial
      }

      // Sin suscripción de MP, el "próximo cobro" es el fin de la prueba gratis.
      if (!hasSubscription && gymData.trialEndsAt) {
        const trialEnd = new Date(gymData.trialEndsAt);
        const diffDays = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        const dateStr = trialEnd.toLocaleDateString('es-AR');
        nextPaymentText = diffDays >= 0
          ? `${dateStr} (${diffDays} días de prueba restantes)`
          : `${dateStr} (período de prueba finalizado)`;
      }

      // Precio plano, un solo plan. (Antes esto era una tabla precio-por-rubro y un
      // mapa de nombres de plan por rubro; con un solo producto son dos constantes.)
      const amount = CONFIG.SUBSCRIPTION_PRICE;

      // El DTO del tenant expone `active` (boolean), NO `status`. Derivamos el estado
      // de visualización desde la fuente real para no depender de un campo inexistente.
      const isActive = (gymData.active ?? gymData.isActive) !== false;
      setSubscriptionInfo({
        plan: 'Veltronik Pro',
        status: isActive ? 'active' : 'blocked',
        nextPayment: nextPaymentText,
        amount: formatCurrency(amount),
        hasSubscription,
      });

    } catch (error) {
      console.error('Settings load error:', error);
      showToast('Error al cargar configuración', 'error');
    } finally {
      setLoading(false);
    }
  }, [authGym, showToast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── Equipos (Fase 1) ──────────────────────────────────────────────
  const loadDevices = useCallback(async () => {
    if (!canManageDevices) return;
    try {
      setDevicesLoading(true);
      setDevices(await deviceService.list());
    } catch {
      // Silencioso: la sección de equipos nunca debe romper Ajustes.
    } finally {
      setDevicesLoading(false);
    }
  }, [canManageDevices]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // El bautizo. Si el backend responde 409 (ya hay Caja Madre activa), abre el
  // diálogo de reemplazo explícito — nunca se pisa una Caja Madre en silencio.
  const handleEnroll = async (replaceActiveManager = false) => {
    setEnrollBusy(true);
    try {
      await deviceService.enroll({
        role: enrollForm.role,
        displayName: enrollForm.displayName.trim(),
        replaceActiveManager,
      });
      showToast(`Equipo enrolado como ${enrollForm.role === 'ENCARGADO' ? 'Caja Madre' : 'Caja'}`, 'success');
      setEnrollConfirm(false);
      setReplacePrompt(null);
      await loadDevices();
    } catch (error) {
      setEnrollConfirm(false);
      if (error.response?.status === 409 && error.response?.data?.error === 'ENCARGADO_ACTIVO') {
        setReplacePrompt(error.response.data.conflictingDevice || {});
      } else {
        showToast(errorService.getMessage(error), 'error');
      }
    } finally {
      setEnrollBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await deviceService.revoke(revokeTarget.id);
      showToast('Enrolamiento revocado (el historial del equipo se conserva)', 'success');
      await loadDevices();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setRevokeTarget(null);
    }
  };

  // Anillo de update (ladrillo 7): '' = Todos (null), '0' Piloto, '1' Amigos, '2' Todos.
  const handleSetRing = async (deviceId, value) => {
    try {
      await deviceService.setRing(deviceId, value === '' ? null : Number(value));
      showToast('Anillo de actualización actualizado', 'success');
      await loadDevices();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  // Save gym settings
  const handleSaveGym = async (e) => {
    e.preventDefault();
    if (!gymForm.name.trim()) { showToast('El nombre es requerido', 'error'); return; }

    setSaving(true);
    try {
      const saved = await gymService.updateCurrent({
        name: gymForm.name.trim(),
        address: gymForm.address.trim() || null,
        phone: gymForm.phone.trim() || null,
        email: gymForm.email.trim() || null,
        logoUrl: gymForm.logoUrl,
        logoEmoji: gymForm.logoEmoji,
      });
      // Refrescamos el contexto para que el logo nuevo aparezca YA en el resto de la
      // app (sidebar, lobby) en vez de recién al volver a entrar.
      if (saved && refreshAuth) { try { await refreshAuth(); } catch { /* ignore */ } }
      showToast('Configuración guardada', 'success');
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  // NOTA: el flujo viejo de "cambiar método de pago" (redirección al link de MP vía
  // /update-payment-method) fue reemplazado por el Card Payment Brick embebido
  // (showCardForm + <CardCheckout/>), que cobra sin redirección. Se eliminó el handler muerto.

  // Tarjeta nueva cargada OK (Brick) → recargar estado. Cerrar el formulario es cosa de
  // quien lo abrió (SubscriptionActionsWeb), que lo hace antes de llamar acá.
  const handleCardSuccess = async () => {
    showToast('Tarjeta actualizada y suscripción activa', 'success');
    if (refreshAuth) { try { await refreshAuth(); } catch { /* ignore */ } }
    await loadSettings();
  };

  // Verify subscription status with MercadoPago
  const handleVerifySubscription = async () => {
    const gymId = authGym?.id;
    if (!gymId) {
      showToast('No se encontró la organización', 'error');
      return;
    }

    setVerifyingSubscription(true);
    try {
      const { ok, data: result } = await apiCall('/verify-subscription', {
        gym_id: gymId,
      });

      if (!ok) {
        throw new Error(result.error || 'Error al verificar suscripción');
      }

      if (result.changed) {
        showToast(`Estado sincronizado: ${result.message}`, 'success');
        // Refresh all data
        if (refreshAuth) {
          try { await refreshAuth(); } catch { /* ignore */ }
        }
        await loadSettings();
      } else {
        showToast('Suscripción ya sincronizada correctamente', 'success');
      }
    } catch (error) {
      showToast(error.message || 'Error al verificar suscripción', 'error');
    } finally {
      setVerifyingSubscription(false);
    }
  };

  // Cancel subscription properly (calls API that also cancels in MercadoPago)
  const handleCancelSubscription = async () => {
    setCancellingSubscription(true);
    try {
      const gymId = authGym?.id;
      if (!gymId) {
        showToast('No se encontró la organización', 'error');
        return;
      }

      const { ok, data: result } = await apiCall('/cancel-subscription', {
        gym_id: gymId,
      });

      if (!ok) {
        throw new Error(result.error || 'Error al cancelar suscripción');
      }

      showToast('Suscripción cancelada. Tu acceso continuará hasta el fin del período actual.', 'info');
      setConfirmCancel(false);

      // Refresh auth state before redirecting
      if (refreshAuth) {
        try { await refreshAuth(); } catch { /* ignore */ }
      }

      // Reload settings to reflect the new status instead of redirecting to blocked
      await loadSettings();
    } catch (error) {
      showToast(error.message || 'Error al cancelar suscripción', 'error');
    } finally {
      setCancellingSubscription(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      showToast('Error al cerrar sesión', 'error');
    }
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando configuración...</div>;

  const accountEmail = user?.email || profile?.email || '--';
  const accountName = profile?.fullName || user?.user_metadata?.fullName || '--';
  const roleLabels = { owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción', member: 'Miembro' };
  const accountRole = roleLabels[currentRole] || currentRole || '--';
  const statusLabels = { active: '● Activo', pending: '○ Pendiente', blocked: '● Bloqueado', trial: '● Prueba' };

  return (
    <div className="settings-page">
      <PageHeader title="Configuración" subtitle={`Gestión de tu ${orgLabel} y cuenta`} icon="settings" />

      <div className="settings-grid">
        {/* Gym Info - Solo visible/editable para admin/owner */}
        <div className="settings-section">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="settings" size="1.2em" /> Información del {orgLabelCap}
          </h2>

          {(currentRole === 'owner' || currentRole === 'admin') ? (
            <form onSubmit={handleSaveGym}>
              <div className="modal-form">
                <div className="form-group full-width">
                  <label className="form-label">Nombre del {orgLabel} *</label>
                  <input type="text" className="form-input" value={gymForm.name}
                    onChange={e => setGymForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Logo del {orgLabel}</label>
                  <LogoPicker
                    logoUrl={gymForm.logoUrl}
                    logoEmoji={gymForm.logoEmoji}
                    name={gymForm.name}
                    onChange={({ logoUrl, logoEmoji }) => setGymForm(f => ({ ...f, logoUrl, logoEmoji }))}
                    onError={(msg) => showToast(msg, 'error')}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input type="text" className="form-input" value={gymForm.address}
                    onChange={e => setGymForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input type="tel" className="form-input" value={gymForm.phone}
                    onChange={e => setGymForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Email de contacto</label>
                  <input type="email" className="form-input" value={gymForm.email}
                    onChange={e => setGymForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '1rem' }}>
                {saving ? <><span className="spinner" /> Guardando...</> : 'Guardar Cambios'}
              </button>
            </form>
          ) : (
            <div className="modal-form">
              <div className="form-group full-width" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <GymLogo logoUrl={gymForm.logoUrl} logoEmoji={gymForm.logoEmoji} name={gymForm.name} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label className="form-label">Nombre del {orgLabel}</label>
                  <div className="form-input" style={{ background: 'var(--bg-tertiary)', border: 'none' }}>{gymForm.name}</div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Dirección</label>
                <div className="form-input" style={{ background: 'var(--bg-tertiary)', border: 'none' }}>{gymForm.address || '--'}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <div className="form-input" style={{ background: 'var(--bg-tertiary)', border: 'none' }}>{gymForm.phone || '--'}</div>
              </div>
              <div className="form-group full-width">
                <label className="form-label">Email de contacto</label>
                <div className="form-input" style={{ background: 'var(--bg-tertiary)', border: 'none' }}>{gymForm.email || '--'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Subscription - Solo para owner/admin */}
        {(currentRole === 'owner' || currentRole === 'admin') && (
          <div className="settings-section">
            <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="creditCard" size="1.1em" /> Suscripción</h2>
            <div className="subscription-card">
              <div className="subscription-plan">{subscriptionInfo.plan}</div>
              <div className="subscription-status">{statusLabels[subscriptionInfo.status] || subscriptionInfo.status}</div>
            </div>

            {/* Past due warning */}
            {subscriptionInfo.status === 'blocked' && (
              <div style={{
                padding: '0.75rem 1rem', marginBottom: '1rem',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--border-radius-md)', color: '#ef4444', fontSize: 'var(--font-size-sm)'
              }}>
                <Icon name="alertTriangle" size="1em" style={{ flexShrink: 0 }} /> Tu suscripción tiene un pago pendiente. Actualizá tu método de pago para restaurar el acceso.
              </div>
            )}

            <div className="info-row">
              <span className="info-label">Próximo cobro</span>
              <span className="info-value">{subscriptionInfo.nextPayment}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Monto mensual</span>
              <span className="info-value">{subscriptionInfo.amount}</span>
            </div>
            {/* Payment Method Actions — la variante la inyecta la tabla de rutas. */}
            {subscriptionInfo.hasSubscription && SubscriptionActions && (
              <SubscriptionActions
                monthlyAmountLabel={subscriptionInfo.amount}
                verifying={verifyingSubscription}
                onVerify={handleVerifySubscription}
                onCardSuccess={handleCardSuccess}
              />
            )}

          </div>
        )}

        {/* Account */}
        <div className="settings-section">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="user" size="1.1em" /> Mi Cuenta</h2>
          <div className="info-row">
            <span className="info-label">Email</span>
            <span className="info-value">{accountEmail}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Nombre</span>
            <span className="info-value">{accountName}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Rol</span>
            <span className="info-value">{accountRole}</span>
          </div>
        </div>

        {/* Equipos (Fase 1: registro + bautizo) */}
        {canManageDevices && (
          <div className="settings-section">
            <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="monitor" size="1.1em" /> Equipos</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: 'var(--font-size-sm)' }}>
              Computadoras que operan este gimnasio. Enrolá esta computadora para identificarla con un nombre y un rol.
            </p>

            {devicesLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>Cargando equipos…</p>
            ) : devices.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                Todavía no hay equipos registrados. Aparecen solos a medida que las computadoras usan el sistema.
              </p>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                {devices.map((d) => (
                  <div key={d.id} className="info-row" style={{ alignItems: 'center' }}>
                    <span className="info-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <Icon name="monitor" size="1em" />
                      <span>{d.displayName || `Equipo ${String(d.id).slice(0, 8)}`}</span>
                      {d.id === thisDeviceId && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--primary-500)', border: '1px solid var(--primary-500)', borderRadius: '999px', padding: '0 8px' }}>
                          esta computadora
                        </span>
                      )}
                    </span>
                    <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {d.enrolled && <span style={{ fontWeight: 600 }}>{d.role === 'ENCARGADO' ? 'Caja Madre' : 'Caja'}</span>}
                      {d.status === 'REVOKED' && <span style={{ color: 'var(--text-muted)' }}>revocado</span>}
                      {d.lastAppVersion && <span style={{ color: 'var(--text-muted)' }}>v{d.lastAppVersion}</span>}
                      {d.enrolled && (
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title={d.lastSyncAt ? `Última sincronización: ${new Date(d.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Todavía no sincronizó'}>
                          <Icon name="refresh" size="0.9em" /> {d.lastSyncAt ? timeAgo(d.lastSyncAt) : 'sin sync'}
                        </span>
                      )}
                      <span style={{ color: 'var(--text-muted)' }}
                        title={d.lastSeenAt ? `Última señal: ${new Date(d.lastSeenAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin señal aún'}>
                        {timeAgo(d.lastSeenAt)}
                      </span>
                      {d.enrolled && (
                        <select className="form-input" style={{ width: 'auto', padding: '2px 6px', fontSize: 'var(--font-size-xs)' }}
                          value={d.updateRing == null ? '' : String(d.updateRing)}
                          title="Anillo de actualización (rollout escalonado)"
                          onChange={(e) => handleSetRing(d.id, e.target.value)}>
                          <option value="0">Anillo: Piloto</option>
                          <option value="1">Anillo: Amigos</option>
                          <option value="">Anillo: Todos</option>
                        </select>
                      )}
                      {d.enrolled && (
                        <button className="btn-outline-danger" onClick={() => setRevokeTarget(d)}>Revocar</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!thisDevice?.enrolled && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <label className="form-label">Nombre del equipo</label>
                  <input className="form-input" placeholder="Ej: Caja mostrador" maxLength={120}
                    value={enrollForm.displayName}
                    onChange={(e) => setEnrollForm((f) => ({ ...f, displayName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Rol</label>
                  <select className="form-input" value={enrollForm.role}
                    onChange={(e) => setEnrollForm((f) => ({ ...f, role: e.target.value }))}>
                    <option value="CAJA">Caja</option>
                    <option value="ENCARGADO">Caja Madre (encargado)</option>
                  </select>
                </div>
                <button className="btn-primary" disabled={enrollBusy || !enrollForm.displayName.trim()}
                  onClick={() => setEnrollConfirm(true)}>
                  Enrolar esta computadora
                </button>
              </div>
            )}
          </div>
        )}

        {/* Appearance */}
        <div className="settings-section">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="palette" size="1.1em" /> Apariencia</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: 'var(--font-size-sm)' }}>
            Elige el tema de la interfaz
          </p>
          <div className="theme-options">
            <div className={`theme-option ${preference === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
              <div className="theme-option-icon sun"><Icon name="sun" size="1.5rem" /></div>
              <span className="theme-option-text">Claro</span>
            </div>
            <div className={`theme-option ${preference === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
              <div className="theme-option-icon moon"><Icon name="moon" size="1.5rem" /></div>
              <span className="theme-option-text">Oscuro</span>
            </div>
            <div className={`theme-option ${preference === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}>
              <div className="theme-option-icon system"><Icon name="monitor" size="1.5rem" /></div>
              <span className="theme-option-text">Sistema</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="danger-zone-container">
          <div className="danger-header">
            <h2 className="danger-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="alertTriangle" size="1.1em" /> Zona de Peligro</h2>
          </div>
          <div className="danger-content">
            {currentRole === 'owner' && (
              <div className="danger-item">
                <div className="danger-info">
                  <h3>Cancelar Suscripción</h3>
                  <p>Tu suscripción se cancelará al finalizar el período actual ya pagado. Tus datos se conservarán por 30 días adicionales.</p>
                </div>
                <button className="btn-outline-danger" onClick={() => setConfirmCancel(true)}>Cancelar Suscripción</button>
              </div>
            )}
            <div className="danger-item">
              <div className="danger-info">
                <h3>Cerrar Sesión</h3>
                <p>Finaliza tu sesión actual de forma segura en este dispositivo.</p>
              </div>
              <button className="btn-outline-secondary" onClick={() => setConfirmLogout(true)}>Cerrar Sesión</button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={confirmCancel} title="Cancelar Suscripción"
        message="¿Estás seguro de cancelar tu suscripción? Perderás acceso al sistema al finalizar el período actual. Tu suscripción en Mercado Pago también será cancelada."
        icon="alertTriangle" confirmText={cancellingSubscription ? 'Cancelando...' : 'Sí, cancelar'} confirmClass="btn-danger"
        onConfirm={handleCancelSubscription} onCancel={() => setConfirmCancel(false)} />

      <ConfirmDialog open={confirmLogout} title="Cerrar Sesión"
        message="¿Estás seguro de cerrar tu sesión?"
        icon="logout" confirmText="Cerrar Sesión" confirmClass="btn-danger"
        onConfirm={handleLogout} onCancel={() => setConfirmLogout(false)} />

      {/* Equipos: la confirmación del bautizo es explícita y con nombre del negocio (diseño en docs/FASE1-PLAN.md) */}
      <ConfirmDialog open={enrollConfirm} title="Enrolar esta computadora"
        message={`Vas a configurar ESTA computadora como ${enrollForm.role === 'ENCARGADO' ? 'CAJA MADRE (encargado)' : 'CAJA'} de "${gymForm.name || orgLabelCap}". ¿Es correcto?`}
        icon="monitor" confirmText={enrollBusy ? 'Enrolando…' : 'Sí, enrolar'} confirmClass="btn-primary"
        onConfirm={() => handleEnroll(false)} onCancel={() => setEnrollConfirm(false)} />

      <ConfirmDialog open={!!replacePrompt} title="Ya hay una Caja Madre activa"
        message={`Este gimnasio ya tiene una Caja Madre activa${replacePrompt?.displayName ? ` ("${replacePrompt.displayName}")` : ''}${replacePrompt?.lastSeenAt ? `, vista por última vez el ${new Date(replacePrompt.lastSeenAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}. ¿Querés reemplazarla por esta computadora? La anterior quedará revocada.`}
        icon="alertTriangle" confirmText={enrollBusy ? 'Reemplazando…' : 'Sí, reemplazar'} confirmClass="btn-danger"
        onConfirm={() => handleEnroll(true)} onCancel={() => setReplacePrompt(null)} />

      <ConfirmDialog open={!!revokeTarget} title="Revocar equipo"
        message={`¿Revocar el enrolamiento de "${revokeTarget?.displayName || 'este equipo'}"? Su historial no se borra y podés volver a enrolarlo cuando quieras.`}
        icon="alertTriangle" confirmText="Revocar" confirmClass="btn-danger"
        onConfirm={handleRevoke} onCancel={() => setRevokeTarget(null)} />

    </div>
  );
}
