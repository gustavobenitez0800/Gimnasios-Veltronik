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
  PILATES: [
    'Gestión ilimitada de alumnos',
    'Administración de turnos y cupos limitados',
    'Control de pagos mensuales y clases sueltas',
    'Control de asistencia automatizado',
    'Dashboard inteligente de rentabilidad',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
  CLUB: [
    'Gestión masiva de socios plenos',
    'Control de cuotas sociales y disciplinas',
    'Sistema de control de acceso general',
    'Múltiples perfiles (Administración y Staff)',
    'Dashboard inteligente con métricas clave',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
  ACADEMY: [
    'Gestión ilimitada de alumnos y graduaciones',
    'Control de asistencia por disciplina',
    'Control de caja y cuotas mensuales',
    'Múltiples instructores y perfiles',
    'Dashboard inteligente de crecimiento',
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

const TYPE_LABELS = { GYM: 'gimnasio', PILATES: 'estudio', CLUB: 'club', ACADEMY: 'academia', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' };
const TYPE_ICONS = { GYM: '/assets/VeltronikGym.png', PILATES: '🧘‍♀️', CLUB: '⚽', ACADEMY: '🥋', RESTO: '/assets/VeltronikRestaurante.png', KIOSK: '🏪', OTHER: '📱' };
const TYPE_IS_IMAGE = { GYM: true, PILATES: false, CLUB: false, ACADEMY: false, RESTO: true, KIOSK: false, OTHER: false };

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

      if (!ok) {
        const detailMsg = result.details ? ` (${result.details})` : '';
        throw new Error((result.error || 'Tuvimos un problema al preparar la suscripción.') + detailMsg);
      }

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
        {/* Header simplificado como en el screenshot */}
        <div className="plans-hero text-center" style={{ paddingTop: '2rem' }}>
          <h1 className="plans-hero-title" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            🚀 Activá tu {TYPE_LABELS[orgType] || 'negocio'}
          </h1>
          <p className="plans-hero-subtitle" style={{ color: '#9ca3af', marginBottom: '2rem' }}>
            Suscripción mensual para acceso completo al sistema
          </p>

          <button className="premium-btn-ghost" onClick={() => navigate(CONFIG.ROUTES.LOBBY)} style={{ marginBottom: '2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            ← Volver al Lobby
          </button>

          {/* Trial / Error Notices */}
          {isTrialActive && trialDaysRemaining > 0 && (
            <div className="premium-notice notice-info" style={{ maxWidth: '460px', margin: '0 auto 2rem', textAlign: 'left', padding: '1rem', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)' }}>
              <span className="notice-icon">✨</span>
              <span>Te quedan <strong>{trialDaysRemaining} días</strong> de prueba. Asegura tu acceso continuo suscribiéndote ahora.</span>
            </div>
          )}

          {!isTrialActive && !isActiveSubscription(subscription) && (
            <div className="premium-notice notice-warning" style={{ maxWidth: '460px', margin: '0 auto 2rem', textAlign: 'center', padding: '1.2rem', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', background: 'rgba(30, 10, 10, 0.8)' }}>
              <div style={{ color: '#ef4444', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                ⚠️ Tu período de prueba gratuita ha finalizado.
              </div>
              <div style={{ color: '#f87171' }}>Tus datos están seguros.</div>
              <div style={{ color: '#fca5a5', fontSize: '0.9rem', marginTop: '0.2rem' }}>Suscribite para seguir usando Veltronik.</div>
            </div>
          )}
        </div>

        {/* Pricing Card */}
        <div className="plans-cards-container">
          <div className="premium-plan-card recommended-neon">
            {/* Badge flotante */}
            <div className="plan-floating-badge" style={{
              position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white',
              padding: '6px 20px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
            }}>
              Veltronik {{ GYM: 'Pro', PILATES: 'Pilates', CLUB: 'Club', ACADEMY: 'Academia', RESTO: 'Restaurante', KIOSK: 'Kiosco', OTHER: 'Pro' }[orgType] || 'Pro'}
            </div>

            <div className="plan-card-header text-center" style={{ marginTop: '0.5rem' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'white' }}>
                Veltronik {{ GYM: 'Pro', PILATES: 'Pilates', CLUB: 'Club', ACADEMY: 'Academia', RESTO: 'Restaurante', KIOSK: 'Kiosco', OTHER: 'Pro' }[orgType] || 'Pro'}
              </h2>
              <p className="plan-desc" style={{ color: '#9ca3af', margin: '0 auto', maxWidth: '80%' }}>
                Acceso completo a todas las funcionalidades de {TYPE_LABELS[orgType] || 'tu negocio'}
              </p>

              {/* Price Box Oscura */}
              <div style={{
                background: '#0f172a', borderRadius: '16px', padding: '1.5rem',
                margin: '1.5rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center'
              }}>
                <h2 className="plan-price-title" style={{ margin: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                  <span className="plan-currency" style={{ fontSize: '1.5rem', color: '#9ca3af', marginTop: '0.5rem', marginRight: '0.2rem' }}>$</span>
                  <span className="plan-amount" style={{ fontSize: '4.5rem', fontWeight: '800', lineHeight: 1, letterSpacing: '-2px', color: 'white' }}>{price.toLocaleString('es-AR')}</span>
                </h2>
                <span className="plan-period" style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '1rem' }}>por mes</span>
              </div>
            </div>

            <div className="plan-card-body" style={{ borderTop: 'none', paddingTop: '0' }}>
              <ul className="premium-features-list" style={{ gap: '0' }}>
                {features.map((f, i) => (
                  <li key={i} style={{ 
                    padding: '1rem 0', 
                    borderBottom: i < features.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    alignItems: 'center'
                  }}>
                    <div className="feature-check" style={{ color: '#10b981', marginRight: '0.75rem', display: 'flex' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <span style={{ color: '#e5e7eb', fontSize: '0.95rem' }}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="plan-card-footer" style={{ marginTop: '1.5rem' }}>
              <button 
                className="premium-btn-primary full-width" 
                style={{ 
                  background: '#0ea5e9', color: 'white', padding: '1.2rem', 
                  borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold',
                  boxShadow: '0 4px 20px 0 rgba(14, 165, 233, 0.4)',
                  border: 'none', width: '100%', cursor: 'pointer',
                  transition: 'all 0.2s', marginBottom: '1.5rem'
                }}
                disabled={subscribing} 
                onClick={handleSubscribe}
              >
                {subscribing ? (
                  <><span className="spinner-small" /> Procesando pago...</>
                ) : (
                  'Suscribirme ahora'
                )}
              </button>
              
              <div className="secure-payment-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#eab308" stroke="none">
                     <path d="M12 2C9.2 2 7 4.2 7 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-1V7c0-2.8-2.2-5-5-5zm0 2c1.7 0 3 1.3 3 3v3H9V7c0-1.7 1.3-3 3-3zm0 11c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                  </svg>
                  <span>Pago seguro procesado por Mercado Pago</span>
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                  Cancelá cuando quieras • Sin permanencia mínima
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="plans-footer text-center" style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: 'none' }}>
          <p style={{ marginBottom: '1rem', color: '#9ca3af' }}>¿Tenés dudas? Contactanos</p>
          <div className="support-links-row" style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
            <a href="https://www.instagram.com/veltroniik/" target="_blank" rel="noreferrer" className="support-link instagram" style={{ color: '#ef4444', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              <span>Instagram</span>
            </a>
            <a href="mailto:veltronikcompany@gmail.com" className="support-link email" style={{ color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span>Email</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
