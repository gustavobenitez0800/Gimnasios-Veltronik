// ============================================
// VELTRONIK V2 - PLANS PAGE (Subscription checkout)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import supabase from '../lib/supabase';

const FEATURES = [
  'Gestión ilimitada de socios',
  'Registro de pagos y cuotas',
  'Dashboard con estadísticas',
  'Múltiples usuarios por gimnasio',
  'Soporte técnico prioritario',
  'Actualizaciones automáticas',
];

export default function PlansPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gym, profile, isTrialActive, trialDaysRemaining, subscription, isActiveSubscription } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  // If already active subscription → go to dashboard
  useEffect(() => {
    if (isActiveSubscription(subscription)) {
      navigate(CONFIG.ROUTES.DASHBOARD, { replace: true });
    }
  }, [subscription, isActiveSubscription, navigate]);

  // Fetch default plan from DB
  useEffect(() => {
    async function loadPlan() {
      try {
        const { data } = await supabase
          .from('plans')
          .select('*')
          .eq('name', 'Profesional')
          .single();
        if (data) setSelectedPlan(data);
      } catch { /* fallback to hardcoded */ }
    }
    loadPlan();
  }, []);

  const handleSubscribe = async () => {
    if (!gym || !profile) { showToast('Datos de usuario no disponibles', 'error'); return; }

    setSubscribing(true);
    try {
      const response = await fetch(`${CONFIG.API_URL}/api/create-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gym_id: gym.id,
          payer_email: profile.email,
          plan_id: selectedPlan?.id || null,
        }),
      });

      const result = await response.json();

      if (result.already_active) {
        showToast('Ya tenés una suscripción activa ✅', 'success');
        setTimeout(() => navigate(CONFIG.ROUTES.DASHBOARD), 1500);
        return;
      }

      if (!response.ok || !result.success) throw new Error(result.error || 'Error al crear suscripción');

      const checkoutUrl = CONFIG.DEBUG
        ? (result.data?.sandbox_init_point || result.data?.init_point)
        : (result.data?.init_point || result.data?.sandbox_init_point);

      if (checkoutUrl) {
        showToast('Redirigiendo a Mercado Pago...', 'info');
        setTimeout(() => { window.location.href = checkoutUrl; }, 1000);
      } else {
        throw new Error('No se obtuvo URL de checkout');
      }
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="plans-wrapper">
      <div className="plans-container">
        {/* Header */}
        <div className="plans-header">
          <h1>🚀 Activa tu gimnasio</h1>
          <p style={{ color: 'var(--text-muted)' }}>Suscripción mensual para acceso completo al sistema</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {isTrialActive && (
              <button className="btn btn-secondary"
                onClick={() => navigate(CONFIG.ROUTES.DASHBOARD)}>
                ← Volver al Dashboard
              </button>
            )}
            <button className="btn btn-ghost"
              onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
              ← Volver al Lobby
            </button>
          </div>
        </div>

        {/* Trial notice */}
        {isTrialActive && trialDaysRemaining > 0 && (
          <div className="plans-trial-notice">
            ✨ Tenés <strong>{trialDaysRemaining} días</strong> restantes de prueba gratuita. Suscribite ahora para no perder acceso.
          </div>
        )}

        {/* Expired trial notice */}
        {!isTrialActive && !isActiveSubscription(subscription) && (
          <div style={{
            padding: '1rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center', marginBottom: '2rem',
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444'
          }}>
            ⚠️ Tu período de prueba gratuita ha finalizado. <strong>Tus datos están seguros</strong>. Suscribite para seguir usando Veltronik.
          </div>
        )}

        {/* Plan Card */}
        <div className="plan-card">
          <div className="plan-badge">💎 Plan Único</div>
          <h2 className="plan-name">Veltronik Pro</h2>
          <p className="plan-desc">Acceso completo a todas las funcionalidades</p>
          <div className="plan-price-box">
            <span className="plan-currency">$</span>
            <span className="plan-amount">{(CONFIG.SUBSCRIPTION_PRICE || 35000).toLocaleString('es-AR')}</span>
            <span className="plan-period">por mes</span>
          </div>
          <ul className="plan-features">
            {FEATURES.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
          <button className="subscribe-button" disabled={subscribing} onClick={handleSubscribe}>
            {subscribing ? <><span className="spinner" /> Procesando...</> : 'Suscribirme ahora'}
          </button>
          <div className="plan-payment-info">
            <p>🔒 Pago seguro procesado por Mercado Pago</p>
            <p>Cancelá cuando quieras • Sin permanencia mínima</p>
          </div>
        </div>

        {/* Footer */}
        <div className="plans-footer">
          <p>¿Tenés dudas? Contactanos</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
            <a href="https://www.instagram.com/veltroniik/" target="_blank" rel="noreferrer" style={{ color: '#E4405F' }}>📷 Instagram</a>
            <a href="mailto:veltronikcompany@gmail.com" style={{ color: '#EA4335' }}>📧 Email</a>
          </div>
        </div>
      </div>
    </div>
  );
}
