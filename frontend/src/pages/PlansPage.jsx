// ============================================
// VELTRONIK V2 - PLANS PAGE (Premium Subscription Checkout)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import apiClient from '../lib/apiClient';
import Icon from '../components/Icon';

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
      const response = await apiClient.post('/core/subscriptions/checkout');
      const { ok, init_point, error } = response.data;

      if (!ok || !init_point) {
        throw new Error(error || 'Tuvimos un problema al preparar la suscripción con Mercado Pago.');
      }

      showToast('Abriendo portal de pagos seguro...', 'info');
      setTimeout(() => { window.location.href = init_point; }, 1000);
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Error de conexión';
      showToast('Error: ' + msg, 'error');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="plans-page">
      {/* Realce de fondo sutil (un solo gradiente tenue, sin orbes) */}
      <div className="plans-page-bg" />

      <div className="plans-page-content">
        {/* Volver */}
        <button className="plans-back" onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
          <Icon name="chevronLeft" size="1em" /> Volver al Lobby
        </button>

        {/* Hero */}
        <div className="plans-hero">
          <h1 className="plans-hero-title">Activá tu {TYPE_LABELS[orgType] || 'negocio'}</h1>
          <p className="plans-hero-subtitle">Suscripción mensual para acceso completo al sistema</p>
        </div>

        {/* Card de precio */}
        <div className="plans-card">
          <div className="plans-card-badge">Veltronik Premium</div>

          <div className="plans-card-head">
            <h2 className="plans-card-title">Veltronik Premium</h2>
            <p className="plans-card-desc">Acceso completo e ilimitado a todas las funcionalidades</p>
          </div>

          {/* Precio */}
          <div className="plans-price-box">
            <div className="plans-price">
              <span className="plans-price-currency">$</span>
              <span className="plans-price-amount tabular-nums">{price.toLocaleString('es-AR')}</span>
            </div>
            <span className="plans-price-period">por mes</span>
          </div>

          {/* Features */}
          <ul className="plans-features">
            {features.map((f, i) => (
              <li key={i} className="plans-feature">
                <span className="plans-feature-check"><Icon name="check" size="1.1em" /></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button className="btn btn-primary btn-lg plans-cta" disabled={subscribing} onClick={handleSubscribe}>
            {subscribing ? <><span className="spinner" /> Procesando...</> : 'Suscribirme ahora'}
          </button>

          <div className="plans-secure">
            <Icon name="lock" size="0.9em" />
            <span>Suscripción mensual segura procesada por Mercado Pago</span>
          </div>
        </div>
      </div>
    </div>
  );
}
