// ============================================
// VELTRONIK V2 - PLANS PAGE (Premium Subscription Checkout)
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
    'Gestión ilimitada de socios activos',
    'Control de caja y pagos mensuales',
    'Dashboard inteligente con métricas clave',
    'Control de acceso automatizado y asistencia',
    'Múltiples perfiles de usuario por equipo',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
  RESTO: [
    'Gestión interactiva de mesas y sectores',
    'Menú digital organizado por categorías',
    'Sistema integral de comandas y pedidos',
    'Pantalla sincronizada para cocina',
    'Cierre y apertura de caja automatizados',
    'Control de inventario preventivo',
    'Reportes financieros y análisis de ventas',
    'Soporte técnico y asistencia prioritaria',
  ],
  KIOSK: [
    'Control rápido de inventario y stock',
    'Sistema de punto de venta ágil',
    'Dashboard con rendimiento diario',
    'Arqueo y control de caja',
    'Gestión de múltiples vendedores',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
  OTHER: [
    'Panel de control completo y adaptable',
    'Dashboard inteligente con métricas clave',
    'Múltiples perfiles de usuario por equipo',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
};

const TYPE_LABELS = { GYM: 'gimnasio', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' };
const TYPE_ICONS = { GYM: '/assets/VeltronikGym.png', RESTO: '/assets/VeltronikRestaurante.png', KIOSK: '🏪', OTHER: '📱' };
const TYPE_IS_IMAGE = { GYM: true, RESTO: true, KIOSK: false, OTHER: false };

export default function PlansPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gym, profile, isTrialActive, trialDaysRemaining, subscription, isActiveSubscription } = useAuth();
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
    if (!gymId || !payerEmail) { 
      showToast('No pudimos validar la información necesaria. Por favor, intenta de nuevo.', 'error'); 
      return; 
    }

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
        showToast('Ya cuentas con una suscripción activa ✅', 'success');
        setTimeout(() => navigate(CONFIG.ROUTES.DASHBOARD), 1500);
        return;
      }

      if (!ok) throw new Error(result.error || 'Tuvimos un problema al preparar la suscripción. Intenta en unos minutos.');

      const checkoutUrl = CONFIG.DEBUG
        ? (result.data?.sandbox_init_point || result.data?.init_point)
        : (result.data?.init_point || result.data?.sandbox_init_point);

      if (checkoutUrl) {
        showToast('Abriendo portal de pagos seguro...', 'info');
        setTimeout(() => { window.location.href = checkoutUrl; }, 1000);
      } else {
        throw new Error('No se pudo generar el acceso al portal de pagos.');
      }
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="premium-plans-wrapper">
      <div className="premium-plans-bg">
        <div className="plans-glow plans-glow-1"></div>
        <div className="plans-glow plans-glow-2"></div>
      </div>
      
      <div className="premium-plans-content">
        {/* Nav Header */}
        <div className="plans-nav">
          <div className="brand-logo">
            <div className="logo-icon">V</div>
            <span className="logo-text">Veltronik</span>
          </div>
          <div className="plans-nav-actions">
            {isTrialActive && (
              <button className="premium-btn-ghost" onClick={() => navigate(CONFIG.ROUTES.DASHBOARD)}>
                Ir al Dashboard
              </button>
            )}
            <button className="premium-btn-outline" onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
              Volver al Lobby
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="plans-hero text-center">
          <h1 className="plans-hero-title">
            Potencia tu <span className="text-gradient">{TYPE_LABELS[orgType] || 'negocio'}</span>
          </h1>
          <p className="plans-hero-subtitle">
            Accede a todas las herramientas profesionales que necesitas para crecer, sin límites y con soporte prioritario.
          </p>

          {/* Trial / Error Notices */}
          {isTrialActive && trialDaysRemaining > 0 && (
            <div className="premium-notice notice-info">
              <span className="notice-icon">✨</span>
              <span>Te quedan <strong>{trialDaysRemaining} días</strong> de prueba. Asegura tu acceso continuo suscribiéndote ahora.</span>
            </div>
          )}

          {!isTrialActive && !isActiveSubscription(subscription) && (
            <div className="premium-notice notice-warning">
              <span className="notice-icon">⚠️</span>
              <span>
                {subscription 
                  ? 'Tu suscripción requiere atención. Renueva ahora para recuperar el acceso a tu información.'
                  : 'Tu período de prueba ha finalizado. Suscríbete para continuar operando sin interrupciones.'}
              </span>
            </div>
          )}
        </div>

        {/* Pricing Card */}
        <div className="plans-cards-container">
          <div className="premium-plan-card recommended">
            <div className="plan-card-header">
              <div className="plan-badge">
                {TYPE_IS_IMAGE[orgType] ? (
                  <img src={TYPE_ICONS[orgType]} alt="" className="plan-badge-icon" />
                ) : (
                  <span className="plan-badge-icon">{TYPE_ICONS[orgType] || '💎'}</span>
                )}
                <span>Veltronik {orgType === 'RESTO' ? 'Restaurante' : 'Pro'}</span>
              </div>
              <h2 className="plan-price-title">
                <span className="plan-currency">$</span>
                <span className="plan-amount">{price.toLocaleString('es-AR')}</span>
                <span className="plan-period">/ mes</span>
              </h2>
              <p className="plan-desc">Solución integral para {TYPE_LABELS[orgType] || 'tu negocio'}</p>
            </div>

            <div className="plan-card-body">
              <ul className="premium-features-list">
                {features.map((f, i) => (
                  <li key={i}>
                    <div className="feature-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="plan-card-footer">
              <button 
                className="premium-btn-primary full-width" 
                disabled={subscribing} 
                onClick={handleSubscribe}
              >
                {subscribing ? (
                  <><span className="spinner-small" /> Procesando pago seguro...</>
                ) : (
                  'Comenzar Suscripción'
                )}
              </button>
              
              <div className="secure-payment-info">
                <svg className="lock-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Pago encriptado y seguro a través de Mercado Pago</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="plans-footer text-center">
          <p>Cancela en cualquier momento. Sin contratos ni letras chicas.</p>
          <div className="support-links-row">
            <a href="https://www.instagram.com/veltroniik/" target="_blank" rel="noreferrer" className="support-link instagram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              <span>@veltroniik</span>
            </a>
            <a href="mailto:veltronikcompany@gmail.com" className="support-link email">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span>Soporte</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
