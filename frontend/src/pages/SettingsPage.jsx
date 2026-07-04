// ============================================
// VELTRONIK V2 - SETTINGS PAGE (Fixed & Enhanced)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { gymService, errorService, deviceService, cashierService } from '../services';
import { formatCurrency, timeAgo } from '../lib/utils';
import { getDeviceId } from '../lib/deviceId';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { apiCall } from '../lib/api';
import apiClient from '../lib/apiClient';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';
import CardCheckout from '../components/CardCheckout';

export default function SettingsPage() {
  const { showToast } = useToast();
  const { user, gym: authGym, profile, logout, refreshAuth, orgRole } = useAuth();
  const { preference, setTheme } = useTheme();
  const currentRole = orgRole;
  const orgType = authGym?.type || localStorage.getItem('current_org_type') || 'GYM';
  const orgLabel = { GYM: 'gimnasio', PILATES: 'estudio', CLUB: 'club', ACADEMY: 'academia', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' }[orgType] || 'negocio';
  const orgLabelCap = orgLabel.charAt(0).toUpperCase() + orgLabel.slice(1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Gym form
  const [gymForm, setGymForm] = useState({ name: '', address: '', phone: '', email: '' });

  // Subscription info
  const [subscriptionInfo, setSubscriptionInfo] = useState({
    plan: 'Veltronik Pro', status: 'active', nextPayment: '--', amount: '--',
    payerEmail: '', hasSubscription: false
  });

  // Action states
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [verifyingSubscription, setVerifyingSubscription] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);

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

  // Cajeros con PIN (Fase 1, ladrillo 5 — el login local del ladrillo 6)
  const [cashiers, setCashiers] = useState([]);
  const [cashierForm, setCashierForm] = useState({ name: '', pin: '', role: 'CAJERO' });
  const [cashierBusy, setCashierBusy] = useState(false);
  const [pinResetTarget, setPinResetTarget] = useState(null); // { id, name }
  const [pinResetValue, setPinResetValue] = useState('');
  const [cashierToggleTarget, setCashierToggleTarget] = useState(null);

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
      });

      // Subscription info
      let nextPaymentText = '--';
      let payerEmail = '';
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

      // Fallback: trialEndsAt
      if (!hasSubscription && nextPaymentText === '--' && gymData.trialEndsAt) {
        const trialEnd = new Date(gymData.trialEndsAt);
        const diffDays = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        const dateStr = trialEnd.toLocaleDateString('es-AR');
        nextPaymentText = diffDays >= 0
          ? `${dateStr} (${diffDays} días de prueba restantes)`
          : `${dateStr} (período de prueba finalizado)`;
      }

      // Load billing history
      let billingHistory = [];

      // Precio siempre desde CONFIG (precio plano $80.000 para todos los tipos)
      const orgType = gymData.type || 'GYM';
      const amount = CONFIG.PRICES_BY_TYPE[orgType] || CONFIG.SUBSCRIPTION_PRICE || 80000;

      const planNameMap = { GYM: 'Veltronik Pro', RESTO: 'Veltronik Restaurante', KIOSK: 'Veltronik Kiosco', OTHER: 'Veltronik Business' };

      // El DTO del tenant expone `active` (boolean), NO `status`. Derivamos el estado
      // de visualización desde la fuente real para no depender de un campo inexistente.
      const isActive = (gymData.active ?? gymData.isActive) !== false;
      setSubscriptionInfo({
        plan: planNameMap[orgType] || 'Veltronik Pro',
        status: isActive ? 'active' : 'blocked',
        nextPayment: nextPaymentText,
        amount: formatCurrency(amount),
        payerEmail,
        hasSubscription,
        billingHistory,
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

  // ── Cajeros con PIN (ladrillo 5) ──────────────────────────────────
  const loadCashiers = useCallback(async () => {
    if (!canManageDevices) return;
    try {
      setCashiers(await cashierService.list());
    } catch {
      // Silencioso: la sección de cajeros nunca debe romper Ajustes.
    }
  }, [canManageDevices]);

  useEffect(() => { loadCashiers(); }, [loadCashiers]);

  const handleCreateCashier = async () => {
    setCashierBusy(true);
    try {
      await cashierService.create({
        name: cashierForm.name.trim(),
        pin: cashierForm.pin.trim(),
        role: cashierForm.role,
      });
      showToast('Cajero creado. Su PIN queda guardado de forma segura (no se puede volver a ver).', 'success');
      setCashierForm({ name: '', pin: '', role: 'CAJERO' });
      await loadCashiers();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setCashierBusy(false);
    }
  };

  const handleResetPin = async () => {
    if (!pinResetTarget) return;
    setCashierBusy(true);
    try {
      await cashierService.resetPin(pinResetTarget.id, pinResetValue.trim());
      showToast(`PIN de ${pinResetTarget.name} actualizado`, 'success');
      setPinResetTarget(null);
      setPinResetValue('');
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setCashierBusy(false);
    }
  };

  const handleToggleCashier = async () => {
    if (!cashierToggleTarget) return;
    try {
      await cashierService.setActive(cashierToggleTarget.id, !cashierToggleTarget.active);
      showToast(cashierToggleTarget.active ? 'Cajero desactivado' : 'Cajero reactivado', 'success');
      await loadCashiers();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setCashierToggleTarget(null);
    }
  };

  // Save gym settings
  const handleSaveGym = async (e) => {
    e.preventDefault();
    if (!gymForm.name.trim()) { showToast('El nombre es requerido', 'error'); return; }

    setSaving(true);
    try {
      await gymService.updateCurrent({
        name: gymForm.name.trim(),
        address: gymForm.address.trim() || null,
        phone: gymForm.phone.trim() || null,
        email: gymForm.email.trim() || null,
      });
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

  // Tarjeta nueva cargada OK (Brick) → cerrar el form y recargar estado.
  const handleCardSuccess = async () => {
    showToast('Tarjeta actualizada y suscripción activa', 'success');
    setShowCardForm(false);
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
              <div className="form-group full-width">
                <label className="form-label">Nombre del {orgLabel}</label>
                <div className="form-input" style={{ background: 'var(--bg-tertiary)', border: 'none' }}>{gymForm.name}</div>
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
            {subscriptionInfo.payerEmail && (
              <div className="info-row">
                <span className="info-label">Email de pago</span>
                <span className="info-value">{subscriptionInfo.payerEmail}</span>
              </div>
            )}

            {/* Payment Method Actions */}
            {subscriptionInfo.hasSubscription && (
              <div className="subscription-actions" style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowCardForm(v => !v)}
                  style={{ flex: '1', minWidth: '200px' }}
                >
                  <Icon name="creditCard" size="1em" /> {showCardForm ? 'Cerrar' : 'Cambiar Tarjeta / Método de Pago'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleVerifySubscription}
                  disabled={verifyingSubscription}
                  style={{ flex: '1', minWidth: '200px' }}
                >
                  {verifyingSubscription ? (
                    <><span className="spinner" /> Verificando...</>
                  ) : (
                    'Verificar Estado con MP'
                  )}
                </button>
              </div>
            )}
            {subscriptionInfo.hasSubscription && subscriptionInfo.payerEmail && (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem' }}>
                Si tu tarjeta fue rechazada o querés cambiar el método de pago, presioná "Cambiar Tarjeta".
                Si pagaste y el sistema no lo reconoce, usá "Verificar Estado con MP" para sincronizar.
              </p>
            )}

            {/* Formulario de tarjeta (Brick MP): cambiar método de pago sin redirección ni link */}
            {showCardForm && (
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '0.75rem' }}>
                  Ingresá la tarjeta nueva. El cobro mensual seguirá siendo {subscriptionInfo.amount}.
                </p>
                <CardCheckout
                  amount={CONFIG.PRICES_BY_TYPE[orgType] || CONFIG.SUBSCRIPTION_PRICE || 80000}
                  onSuccess={handleCardSuccess}
                />
              </div>
            )}

            {/* Billing History */}
            {subscriptionInfo.billingHistory && subscriptionInfo.billingHistory.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="fileText" size="1em" /> Historial de Facturación
                </h3>
                <div className="billing-history-list">
                  {subscriptionInfo.billingHistory.map((p, i) => (
                    <div key={p.id || i} className="billing-history-item">
                      <div className="billing-history-left">
                        <span className="billing-history-date">
                          {new Date(p.paymentDate || p.created_at).toLocaleDateString('es-AR')}
                        </span>
                        <span className={`billing-history-badge badge-${p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'error' : 'warning'}`}>
                          {p.status === 'approved' ? <><Icon name="check" size="0.75em" /> Aprobado</> : p.status === 'rejected' ? <><Icon name="x" size="0.75em" /> Rechazado</> : <><Icon name="clock" size="0.75em" /> Pendiente</>}
                        </span>
                      </div>
                      <span className="billing-history-amount" style={{ color: p.status === 'approved' ? 'var(--success-500)' : 'var(--text-muted)' }}>
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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
              Computadoras que operan este negocio. Enrolá esta computadora para identificarla con un nombre y un rol.
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
                      <span style={{ color: 'var(--text-muted)' }}
                        title={d.lastSeenAt ? `Última señal: ${new Date(d.lastSeenAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin señal aún'}>
                        {timeAgo(d.lastSeenAt)}
                      </span>
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

        {/* Cajeros con PIN (Fase 1: ladrillo 5) */}
        {canManageDevices && (
          <div className="settings-section">
            <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="user" size="1.1em" /> Cajeros</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: 'var(--font-size-sm)' }}>
              Operadores del mostrador que entran con un PIN (sin email ni Google). El PIN se guarda cifrado y no se puede volver a ver — si se olvida, asignale uno nuevo.
            </p>

            {cashiers.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                {cashiers.map((c) => (
                  <div key={c.id} className="info-row" style={{ alignItems: 'center' }}>
                    <span className="info-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="user" size="1em" />
                      <span style={{ opacity: c.active ? 1 : 0.5 }}>{c.name}</span>
                    </span>
                    <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{ fontWeight: 600 }}>{c.role === 'ENCARGADO' ? 'Encargado' : 'Cajero'}</span>
                      {!c.active && <span style={{ color: 'var(--text-muted)' }}>inactivo</span>}
                      {pinResetTarget?.id === c.id ? (
                        <>
                          <input className="form-input" type="password" inputMode="numeric" maxLength={6}
                            placeholder="Nuevo PIN" autoFocus
                            style={{ width: '110px' }}
                            value={pinResetValue}
                            onChange={(e) => setPinResetValue(e.target.value.replace(/\D/g, ''))} />
                          <button className="btn-primary" disabled={cashierBusy || pinResetValue.length < 4}
                            onClick={handleResetPin}>Guardar</button>
                          <button className="btn-outline-secondary" onClick={() => { setPinResetTarget(null); setPinResetValue(''); }}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          {c.active && (
                            <button className="btn-outline-secondary" onClick={() => { setPinResetTarget(c); setPinResetValue(''); }}>Nuevo PIN</button>
                          )}
                          <button className={c.active ? 'btn-outline-danger' : 'btn-outline-secondary'}
                            onClick={() => setCashierToggleTarget(c)}>
                            {c.active ? 'Desactivar' : 'Reactivar'}
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="form-label">Nombre</label>
                <input className="form-input" placeholder="Ej: Marta" maxLength={120}
                  value={cashierForm.name}
                  onChange={(e) => setCashierForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">PIN (4-6 dígitos)</label>
                <input className="form-input" type="password" inputMode="numeric" maxLength={6}
                  placeholder="••••" style={{ width: '120px' }}
                  value={cashierForm.pin}
                  onChange={(e) => setCashierForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div>
                <label className="form-label">Rol</label>
                <select className="form-input" value={cashierForm.role}
                  onChange={(e) => setCashierForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="CAJERO">Cajero</option>
                  <option value="ENCARGADO">Encargado</option>
                </select>
              </div>
              <button className="btn-primary"
                disabled={cashierBusy || !cashierForm.name.trim() || cashierForm.pin.length < 4}
                onClick={handleCreateCashier}>
                Agregar cajero
              </button>
            </div>
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
        message={`Este negocio ya tiene una Caja Madre activa${replacePrompt?.displayName ? ` ("${replacePrompt.displayName}")` : ''}${replacePrompt?.lastSeenAt ? `, vista por última vez el ${new Date(replacePrompt.lastSeenAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}. ¿Querés reemplazarla por esta computadora? La anterior quedará revocada.`}
        icon="alertTriangle" confirmText={enrollBusy ? 'Reemplazando…' : 'Sí, reemplazar'} confirmClass="btn-danger"
        onConfirm={() => handleEnroll(true)} onCancel={() => setReplacePrompt(null)} />

      <ConfirmDialog open={!!revokeTarget} title="Revocar equipo"
        message={`¿Revocar el enrolamiento de "${revokeTarget?.displayName || 'este equipo'}"? Su historial no se borra y podés volver a enrolarlo cuando quieras.`}
        icon="alertTriangle" confirmText="Revocar" confirmClass="btn-danger"
        onConfirm={handleRevoke} onCancel={() => setRevokeTarget(null)} />

      <ConfirmDialog open={!!cashierToggleTarget}
        title={cashierToggleTarget?.active ? 'Desactivar cajero' : 'Reactivar cajero'}
        message={cashierToggleTarget?.active
          ? `¿Desactivar a "${cashierToggleTarget?.name}"? No podrá entrar con su PIN, pero su historial se conserva y podés reactivarlo cuando quieras.`
          : `¿Reactivar a "${cashierToggleTarget?.name}"? Volverá a poder entrar con su PIN.`}
        icon={cashierToggleTarget?.active ? 'alertTriangle' : 'user'}
        confirmText={cashierToggleTarget?.active ? 'Desactivar' : 'Reactivar'}
        confirmClass={cashierToggleTarget?.active ? 'btn-danger' : 'btn-primary'}
        onConfirm={handleToggleCashier} onCancel={() => setCashierToggleTarget(null)} />
    </div>
  );
}
