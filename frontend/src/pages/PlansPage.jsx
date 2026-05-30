// ============================================
// VELTRONIK V2 - PLANS PAGE (Premium Subscription Checkout)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import apiClient from '../lib/apiClient';

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
  // (Otras omitidas por brevedad, asumen default)
};

const TYPE_LABELS = { GYM: 'gimnasio', PILATES: 'estudio', CLUB: 'club', ACADEMY: 'academia', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' };

export default function PlansPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gym, subscription, isActiveSubscription } = useAuth();
  const [subscribing, setSubscribing] = useState(false);

  const orgType = gym?.type || localStorage.getItem('current_org_type') || 'GYM';
  const price = 80000; // Tarifa plana inamovible (Kill Switch V2)
  const features = FEATURES_BY_TYPE[orgType] || FEATURES_BY_TYPE.GYM;

  // Si ya tiene suscripción activa, no debería estar acá
  if (isActiveSubscription(subscription)) {
    navigate(CONFIG.ROUTES.DASHBOARD, { replace: true });
  }

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      // Llamamos a nuestro nuevo endpoint en Java que genera la URL de Mercado Pago
      const response = await apiClient.post('/core/subscriptions/checkout');
      
      const { ok, init_point, error } = response.data;

      if (!ok || !init_point) {
        throw new Error(error || 'Tuvimos un problema al preparar la suscripción con Mercado Pago.');
      }

      showToast('Abriendo portal de pagos seguro...', 'info');
      
      // Redirigimos al portal de MercadoPago
      setTimeout(() => { window.location.href = init_point; }, 1000);
      
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Error de conexión';
      showToast('Error: ' + msg, 'error');
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
        </div>

        {/* Pricing Card */}
        <div className="plans-cards-container">
          <div className="premium-plan-card recommended-neon">
            <div className="plan-floating-badge" style={{
              position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white',
              padding: '6px 20px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
            }}>
              Veltronik Premium
            </div>

            <div className="plan-card-header text-center" style={{ marginTop: '0.5rem' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'white' }}>
                Veltronik Premium
              </h2>
              <p className="plan-desc" style={{ color: '#9ca3af', margin: '0 auto', maxWidth: '80%' }}>
                Acceso completo e ilimitado a todas las funcionalidades
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
                  <><span className="spinner-small" /> Procesando...</>
                ) : (
                  'Suscribirme ahora'
                )}
              </button>
              
              <div className="secure-payment-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#eab308" stroke="none">
                     <path d="M12 2C9.2 2 7 4.2 7 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-1V7c0-2.8-2.2-5-5-5zm0 2c1.7 0 3 1.3 3 3v3H9V7c0-1.7 1.3-3 3-3zm0 11c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                  </svg>
                  <span>Suscripción segura mensual procesada por Mercado Pago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
