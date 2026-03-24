// ============================================
// VELTRONIK V2 - SETTINGS PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { updateGym, getGym, getSupabaseErrorMessage } from '../lib/supabase';
import supabase from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import CONFIG from '../lib/config';

export default function SettingsPage() {
  const { showToast } = useToast();
  const { user, gym: authGym, profile, logout } = useAuth();
  const { preference, setTheme } = useTheme();
  const currentRole = localStorage.getItem('current_org_role');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Gym form
  const [gymForm, setGymForm] = useState({ name: '', address: '', phone: '', email: '' });

  // Subscription info
  const [subscriptionInfo, setSubscriptionInfo] = useState({
    plan: 'Veltronik Pro', status: 'active', nextPayment: '--', amount: '--'
  });

  // Danger zone confirm
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch gym data (fresh from DB)
      const gymData = authGym || await getGym();
      if (!gymData) { setLoading(false); return; }

      setGymForm({
        name: gymData.name || '',
        address: gymData.address || '',
        phone: gymData.phone || '',
        email: gymData.email || '',
      });

      // Subscription info
      let nextPaymentText = '--';
      const amount = CONFIG.SUBSCRIPTION_PRICE || 0;

      // Try to get subscription info
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('gym_id', gymData.id)
          .maybeSingle();

        if (sub) {
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
      if (nextPaymentText === '--' && gymData.trial_ends_at) {
        const trialEnd = new Date(gymData.trial_ends_at);
        const diffDays = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        const dateStr = trialEnd.toLocaleDateString('es-AR');
        nextPaymentText = diffDays >= 0
          ? `${dateStr} (${diffDays} días de prueba restantes)`
          : `${dateStr} (período de prueba finalizado)`;
      }

      setSubscriptionInfo({
        plan: 'Veltronik Pro',
        status: gymData.status || 'active',
        nextPayment: nextPaymentText,
        amount: formatCurrency(amount),
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
      await updateGym({
        name: gymForm.name.trim(),
        address: gymForm.address.trim() || null,
        phone: gymForm.phone.trim() || null,
        email: gymForm.email.trim() || null,
      });
      showToast('Configuración guardada', 'success');
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Cancel subscription properly
  const handleCancelSubscription = async () => {
    try {
      // First, cancel the subscription record in the database
      const gymId = authGym?.id || localStorage.getItem('current_org_id');
      if (gymId) {
        // Update subscription status to canceled
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('gym_id', gymId)
          .in('status', ['active', 'pending', 'past_due']);
        
        // Update gym status to blocked
        await updateGym({ status: 'blocked' });
      }

      showToast('Suscripción cancelada. Tus datos están seguros.', 'info');
      setConfirmCancel(false);
      setTimeout(() => { window.location.hash = '#/blocked'; }, 2000);
    } catch (error) {
      showToast(getSupabaseErrorMessage(error), 'error');
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      showToast('Error al cerrar sesión', 'error');
    }
  };

  if (loading) return <div className="dashboard-loading"><span className="spinner" /> Cargando configuración...</div>;

  const accountEmail = user?.email || profile?.email || '--';
  const accountName = profile?.full_name || user?.user_metadata?.full_name || '--';
  const accountRole = currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : '--';
  const statusLabels = { active: '● Activo', pending: '○ Pendiente', blocked: '● Bloqueado', trial: '● Prueba' };

  return (
    <div className="settings-page">
      <PageHeader title="Configuración" subtitle="Gestión de tu gimnasio y cuenta" icon="settings" />

      <div className="settings-grid">
        {/* Gym Info */}
        <div className="settings-section">
          <h2 className="settings-section-title">🏋️ Información del Gimnasio</h2>
          <form onSubmit={handleSaveGym}>
            <div className="modal-form">
              <div className="form-group full-width">
                <label className="form-label">Nombre del gimnasio *</label>
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
        </div>

        {/* Subscription */}
        <div className="settings-section">
          <h2 className="settings-section-title">💳 Suscripción</h2>
          <div className="subscription-card">
            <div className="subscription-plan">{subscriptionInfo.plan}</div>
            <div className="subscription-status">{statusLabels[subscriptionInfo.status] || subscriptionInfo.status}</div>
          </div>
          <div className="info-row">
            <span className="info-label">Próximo cobro</span>
            <span className="info-value">{subscriptionInfo.nextPayment}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Monto mensual</span>
            <span className="info-value">{subscriptionInfo.amount}</span>
          </div>
        </div>

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
            <div className="danger-item">
              <div className="danger-info">
                <h3>Cancelar Suscripción</h3>
                <p>Perderás el acceso inmediato a todas las funciones premium y tus datos podrían eliminarse después de 30 días.</p>
              </div>
              <button className="btn-outline-danger" onClick={() => setConfirmCancel(true)}>Cancelar Suscripción</button>
            </div>
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
        message="¿Estás seguro de cancelar tu suscripción? Perderás acceso al sistema al finalizar el período actual."
        icon="⚠️" confirmText="Sí, cancelar" confirmClass="btn-danger"
        onConfirm={handleCancelSubscription} onCancel={() => setConfirmCancel(false)} />

      <ConfirmDialog open={confirmLogout} title="Cerrar Sesión"
        message="¿Estás seguro de cerrar tu sesión?"
        icon="🚪" confirmText="Cerrar Sesión" confirmClass="btn-danger"
        onConfirm={handleLogout} onCancel={() => setConfirmLogout(false)} />
    </div>
  );
}
