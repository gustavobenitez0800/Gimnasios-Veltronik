// ============================================
// VELTRONIK V2 - SETTINGS PAGE (Fixed & Enhanced)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase, gymService, errorService } from '../services';
import { formatCurrency } from '../lib/utils';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { apiCall } from '../lib/api';
import CONFIG from '../lib/config';
import gymLogoSrc from '../assets/VeltronikGym.png';
import restoLogoSrc from '../assets/VeltronikRestaurante.png';

export default function SettingsPage() {
  const { showToast } = useToast();
  const { user, gym: authGym, profile, logout, refreshAuth } = useAuth();
  const { preference, setTheme } = useTheme();
  const currentRole = localStorage.getItem('current_org_role');
  const orgType = authGym?.type || localStorage.getItem('current_org_type') || 'GYM';
  const orgLabel = { GYM: 'gimnasio', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' }[orgType] || 'negocio';
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
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [verifyingSubscription, setVerifyingSubscription] = useState(false);

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

      // Try to get subscription info
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('gym_id', gymData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub) {
          hasSubscription = sub.status === 'active' || sub.status === 'past_due';
          payerEmail = sub.mp_payer_email || '';

          // Determine next payment date from best available source
          const nextDate = sub.current_period_end || sub.next_payment_date;
          
          if (nextDate) {
            const endDate = new Date(nextDate);
            const diffDays = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
            const dateStr = endDate.toLocaleDateString('es-AR');
            nextPaymentText = diffDays > 0
              ? `${dateStr} (en ${diffDays} días)`
              : diffDays === 0 ? `${dateStr} (hoy)` : `${dateStr} (vencido hace ${Math.abs(diffDays)} días)`;
          } else if (sub.last_payment_date) {
            // Fallback: last_payment_date + 30 days
            const lastPay = new Date(sub.last_payment_date);
            const estimated = new Date(lastPay);
            estimated.setDate(estimated.getDate() + 30);
            const diffDays = Math.ceil((estimated - new Date()) / (1000 * 60 * 60 * 24));
            const dateStr = estimated.toLocaleDateString('es-AR');
            nextPaymentText = diffDays > 0
              ? `~${dateStr} (estimado, en ${diffDays} días)`
              : `~${dateStr} (estimado)`;
          }
        }
      } catch {
        // Subscription table may not exist
      }

      // Fallback: trial_ends_at
      if (!hasSubscription && nextPaymentText === '--' && gymData.trial_ends_at) {
        const trialEnd = new Date(gymData.trial_ends_at);
        const diffDays = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        const dateStr = trialEnd.toLocaleDateString('es-AR');
        nextPaymentText = diffDays >= 0
          ? `${dateStr} (${diffDays} días de prueba restantes)`
          : `${dateStr} (período de prueba finalizado)`;
      }

      // Load billing history
      let billingHistory = [];
      try {
        const { data: payments } = await supabase
          .from('subscription_payments')
          .select('id, amount, status, payment_date, created_at')
          .eq('gym_id', gymData.id)
          .order('created_at', { ascending: false })
          .limit(6);
        billingHistory = payments || [];
      } catch { /* table may not exist */ }

      // Use org-type aware pricing
      const orgType = gymData.type || localStorage.getItem('current_org_type') || 'GYM';
      const priceMap = { GYM: 35000, RESTO: 45000, KIOSK: 25000, OTHER: 35000 };
      const amount = priceMap[orgType] || CONFIG.SUBSCRIPTION_PRICE || 0;

      const planNameMap = { GYM: 'Veltronik Pro', RESTO: 'Veltronik Restaurante', KIOSK: 'Veltronik Kiosco', OTHER: 'Veltronik Business' };

      setSubscriptionInfo({
        plan: planNameMap[orgType] || 'Veltronik Pro',
        status: gymData.status || 'active',
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

  // Update payment method — generates new MP checkout link
  const handleUpdatePaymentMethod = async () => {
    const gymId = authGym?.id || localStorage.getItem('current_org_id');
    const email = subscriptionInfo.payerEmail || user?.email || profile?.email;

    if (!gymId || !email) {
      showToast('No se encontraron los datos necesarios', 'error');
      return;
    }

    setUpdatingPayment(true);
    try {
      const { ok, data: result } = await apiCall('/api/update-payment-method', {
        gym_id: gymId,
        payer_email: email,
      });

      if (!ok) {
        throw new Error(result.error || 'Error al actualizar método de pago');
      }

      const checkoutUrl = CONFIG.DEBUG
        ? (result.data?.sandbox_init_point || result.data?.init_point)
        : (result.data?.init_point || result.data?.sandbox_init_point);

      if (checkoutUrl) {
        showToast('Redirigiendo a Mercado Pago para actualizar tu tarjeta...', 'info');
        setTimeout(() => { window.location.href = checkoutUrl; }, 1000);
      } else {
        throw new Error('No se obtuvo URL de checkout');
      }
    } catch (error) {
      showToast(error.message || 'Error al actualizar método de pago', 'error');
    } finally {
      setUpdatingPayment(false);
    }
  };

  // Verify subscription status with MercadoPago
  const handleVerifySubscription = async () => {
    const gymId = authGym?.id || localStorage.getItem('current_org_id');
    if (!gymId) {
      showToast('No se encontró la organización', 'error');
      return;
    }

    setVerifyingSubscription(true);
    try {
      const { ok, data: result } = await apiCall('/api/verify-subscription', {
        gym_id: gymId,
      });

      if (!ok) {
        throw new Error(result.error || 'Error al verificar suscripción');
      }

      if (result.changed) {
        showToast(`✅ Estado sincronizado: ${result.message}`, 'success');
        // Refresh all data
        if (refreshAuth) {
          try { await refreshAuth(); } catch { /* ignore */ }
        }
        await loadSettings();
      } else {
        showToast('✅ Suscripción ya sincronizada correctamente', 'success');
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
      const gymId = authGym?.id || localStorage.getItem('current_org_id');
      if (!gymId) {
        showToast('No se encontró la organización', 'error');
        return;
      }

      const { ok, data: result } = await apiCall('/api/cancel-subscription', {
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
  const accountName = profile?.full_name || user?.user_metadata?.full_name || '--';
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
            {orgType === 'GYM' ? (
              <img src={gymLogoSrc} alt="Gym" style={{ height: '1.2em' }} />
            ) : orgType === 'RESTO' ? (
              <img src={restoLogoSrc} alt="Resto" style={{ height: '1.2em' }} />
            ) : orgType === 'KIOSK' ? (
              '🏪 '
            ) : (
              '🏢 '
            )}
            Información del {orgLabelCap}
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
            <h2 className="settings-section-title">💳 Suscripción</h2>
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
                ⚠️ Tu suscripción tiene un pago pendiente. Actualizá tu método de pago para restaurar el acceso.
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
                  onClick={handleUpdatePaymentMethod}
                  disabled={updatingPayment}
                  style={{ flex: '1', minWidth: '200px' }}
                >
                  {updatingPayment ? (
                    <><span className="spinner" /> Procesando...</>
                  ) : (
                    '🔄 Cambiar Tarjeta / Método de Pago'
                  )}
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
                    '🔍 Verificar Estado con MP'
                  )}
                </button>
              </div>
            )}
            {subscriptionInfo.hasSubscription && subscriptionInfo.payerEmail && (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem' }}>
                💡 Si tu tarjeta fue rechazada o querés cambiar el método de pago, presioná "Cambiar Tarjeta".
                Si pagaste y el sistema no lo reconoce, usá "Verificar Estado con MP" para sincronizar.
              </p>
            )}

            {/* Billing History */}
            {subscriptionInfo.billingHistory && subscriptionInfo.billingHistory.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  📋 Historial de Facturación
                </h3>
                <div className="billing-history-list">
                  {subscriptionInfo.billingHistory.map((p, i) => (
                    <div key={p.id || i} className="billing-history-item">
                      <div className="billing-history-left">
                        <span className="billing-history-date">
                          {new Date(p.payment_date || p.created_at).toLocaleDateString('es-AR')}
                        </span>
                        <span className={`billing-history-badge badge-${p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'error' : 'warning'}`}>
                          {p.status === 'approved' ? '✓ Aprobado' : p.status === 'rejected' ? '✗ Rechazado' : '◌ Pendiente'}
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
          <h2 className="settings-section-title">👤 Mi Cuenta</h2>
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

        {/* Appearance */}
        <div className="settings-section">
          <h2 className="settings-section-title">🎨 Apariencia</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: 'var(--font-size-sm)' }}>
            Elige el tema de la interfaz
          </p>
          <div className="theme-options">
            <div className={`theme-option ${preference === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
              <div className="theme-option-icon sun">☀️</div>
              <span className="theme-option-text" style={{ color: '#92400e' }}>Claro</span>
            </div>
            <div className={`theme-option ${preference === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
              <div className="theme-option-icon moon">🌙</div>
              <span className="theme-option-text" style={{ color: '#e0e7ff' }}>Oscuro</span>
            </div>
            <div className={`theme-option ${preference === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}>
              <div className="theme-option-icon system">🖥️</div>
              <span className="theme-option-text">Sistema</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="danger-zone-container">
          <div className="danger-header">
            <h2 className="danger-title">⚠️ Zona de Peligro</h2>
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
        icon="⚠️" confirmText={cancellingSubscription ? 'Cancelando...' : 'Sí, cancelar'} confirmClass="btn-danger"
        onConfirm={handleCancelSubscription} onCancel={() => setConfirmCancel(false)} />

      <ConfirmDialog open={confirmLogout} title="Cerrar Sesión"
        message="¿Estás seguro de cerrar tu sesión?"
        icon="🚪" confirmText="Cerrar Sesión" confirmClass="btn-danger"
        onConfirm={handleLogout} onCancel={() => setConfirmLogout(false)} />
    </div>
  );
}
