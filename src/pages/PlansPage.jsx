// ============================================
// VELTRONIK V2 - PLANS PAGE (Subscription checkout)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import { apiCall } from '../lib/api';
import { supabase } from '../services';

const FEATURES_BY_TYPE = {
  GYM: [
    'Gestión ilimitada de socios',
    'Registro de pagos y cuotas',
    'Dashboard con estadísticas',
    'Control de acceso y asistencia',
    'Múltiples usuarios por organización',
    'Soporte técnico prioritario',
    'Actualizaciones automáticas',
  ],
  RESTO: [
    'Gestión de mesas y áreas',
    'Menú digital con categorías',
    'Sistema de pedidos completo',
    'Pantalla de cocina en tiempo real',
    'Caja diaria con cierre automático',
    'Inventario con alertas de stock',
    'Reservas online',
    'Reportes de ventas y análisis',
    'Soporte técnico prioritario',
  ],
  KIOSK: [
    'Gestión de inventario y stock',
    'Punto de venta rápido',
    'Dashboard con estadísticas',
    'Control de caja diaria',
    'Múltiples usuarios',
    'Soporte técnico prioritario',
    'Actualizaciones automáticas',
  ],
  OTHER: [
    'Panel de gestión completo',
    'Dashboard con estadísticas',
    'Equipo de trabajo multi-usuario',
    'Soporte técnico prioritario',
    'Actualizaciones automáticas',
  ],
};

const TYPE_LABELS = { GYM: 'gimnasio', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' };
const TYPE_ICONS = { GYM: '/assets/VeltronikGym.png', RESTO: '/assets/VeltronikRestaurante.png', KIOSK: '🏪', OTHER: '📱' };
const TYPE_IS_IMAGE = { GYM: true, RESTO: true, KIOSK: false, OTHER: false };

export default function PlansPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gym, profile, isTrialActive, trialDaysRemaining, subscription, isActiveSubscription, refreshOrgContext } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [resolvedGym, setResolvedGym] = useState(gym);

  // Get current org type from localStorage (set when user selects org in Lobby)
  const orgType = localStorage.getItem('current_org_type') || resolvedGym?.type || 'GYM';
  const price = CONFIG.PRICES_BY_TYPE[orgType] || CONFIG.SUBSCRIPTION_PRICE;
  const features = FEATURES_BY_TYPE[orgType] || FEATURES_BY_TYPE.GYM;

  // If gym is not loaded in AuthContext (coming from blocked state), load it from localStorage
  useEffect(() => {
    async function resolveGym() {
      if (gym) {
        setResolvedGym(gym);
        return;
      }
      const orgId = localStorage.getItem('current_org_id');
      if (!orgId) return;
      try {
        const { data } = await supabase
          .from('gyms')
          .select('*')
          .eq('id', orgId)
          .maybeSingle();
        if (data) setResolvedGym(data);
      } catch { /* silent */ }
    }
    resolveGym();
  }, [gym]);

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
          .maybeSingle();
        if (data) setSelectedPlan(data);
      } catch { /* fallback to hardcoded */ }
    }
    loadPlan();
  }, []);

  const handleSubscribe = async () => {
    const gymId = resolvedGym?.id || localStorage.getItem('current_org_id');
    const payerEmail = profile?.email;
    if (!gymId || !payerEmail) { showToast('Datos de usuario no disponibles', 'error'); return; }

    setSubscribing(true);
    try {
      const { ok, data: result } = await apiCall('/api/create-subscription', {
        gym_id: gymId,
        payer_email: payerEmail,
        plan_id: selectedPlan?.id || null,
        org_type: orgType,
        price: price,
      });

      if (result.already_active) {
        showToast('Ya tenés una suscripción activa ✅', 'success');
        setTimeout(() => navigate(CONFIG.ROUTES.DASHBOARD), 1500);
        return;
      }

      if (!ok) throw new Error(result.error || 'Error al crear suscripción');

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
          <h1>🚀 Activá tu {TYPE_LABELS[orgType] || 'negocio'}</h1>
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

        {/* Expired / Inactive notice */}
        {!isTrialActive && !isActiveSubscription(subscription) && (
          <div style={{
            padding: '1rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center', marginBottom: '2rem',
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444'
          }}>
            {subscription ? (
              <>⚠️ Tu suscripción está inactiva o presenta problemas. <strong>Tus datos están seguros</strong>. Renová tu suscripción para seguir usando Veltronik.</>
            ) : (
              <>⚠️ Tu período de prueba gratuita ha finalizado. <strong>Tus datos están seguros</strong>. Suscribite para seguir usando Veltronik.</>
            )}
          </div>
        )}

        <div className="plan-card">
          <div className="plan-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {TYPE_IS_IMAGE[orgType] ? (
              <img src={TYPE_ICONS[orgType]} alt="" style={{ height: '1.2em' }} />
            ) : (
              TYPE_ICONS[orgType] || '💎'
            )}
            Veltronik {orgType === 'RESTO' ? 'Restaurante' : 'Pro'}
          </div>
          <h2 className="plan-name">Veltronik {orgType === 'RESTO' ? 'Restaurante' : 'Pro'}</h2>
          <p className="plan-desc">Acceso completo a todas las funcionalidades de {TYPE_LABELS[orgType] || 'tu negocio'}</p>
          <div className="plan-price-box">
            <span className="plan-currency">$</span>
            <span className="plan-amount">{price.toLocaleString('es-AR')}</span>
            <span className="plan-period">por mes</span>
          </div>
          <ul className="plan-features">
            {features.map((f, i) => <li key={i}>{f}</li>)}
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
