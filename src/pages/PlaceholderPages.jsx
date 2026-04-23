// ============================================
// VELTRONIK - PLACEHOLDER PAGES
// ============================================
// Solo contiene páginas que aún no tienen
// implementación propia completa.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';

// ============================================
// PAYMENT CALLBACK — Netflix-level checkout flow
// ============================================

const STEPS = {
  loading:  { icon: '🔄', title: 'Verificando pago', color: '#3b82f6' },
  success:  { icon: '✅', title: '¡Pago Exitoso!', color: '#10b981' },
  pending:  { icon: '⏳', title: 'Pago en Proceso', color: '#f59e0b' },
  error:    { icon: '❌', title: 'Pago Rechazado', color: '#ef4444' },
  activating: { icon: '⚡', title: 'Activando tu cuenta', color: '#8b5cf6' },
};

export function PaymentCallbackPage() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Conectando con Mercado Pago...');
  const [progress, setProgress] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // Parse query params from hash-based routing
    const rawSearch = window.location.search || '';
    const hashSearch = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const params = new URLSearchParams(rawSearch || hashSearch);

    const paymentStatus = params.get('status') || params.get('collection_status') || '';
    const externalRef = params.get('external_reference') || '';

    // Smooth progress animation
    let progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 90));
    }, 100);

    const cleanup = () => clearInterval(progressInterval);

    if (paymentStatus === 'approved' || paymentStatus === 'authorized') {
      handleApproved(cleanup);
    } else if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
      handlePending(cleanup);
    } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
      handleRejected(cleanup, paymentStatus);
    } else {
      // No status — user navigated here directly or unknown state
      handleUnknown(cleanup);
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApproved(cleanup) {
    setStatus('success');
    setMessage('¡Tu pago fue aprobado exitosamente!');
    setProgress(60);

    // Give webhook 3 seconds to process, then start polling
    await delay(2500);

    setStatus('activating');
    setMessage('Activando tu suscripción...');
    setProgress(70);

    // Poll auth state to detect when subscription is active
    let activated = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await refreshAuth();
        // Check if we now have an active subscription by reloading
        activated = true;
        setProgress(85 + attempt * 3);
      } catch { /* ignore */ }
      await delay(2000);
    }

    cleanup();
    setProgress(100);
    setMessage('¡Todo listo! Tu cuenta está activa.');
    setStatus('success');
    setShowCTA(true);

    // Auto redirect after showing success
    await delay(3000);
    navigate(CONFIG.ROUTES.DASHBOARD, { replace: true });
  }

  async function handlePending(cleanup) {
    setStatus('pending');
    setMessage('Tu pago está siendo procesado por Mercado Pago. Esto puede demorar unos minutos.');
    setProgress(50);

    try { await refreshAuth(); } catch { /* ignore */ }

    cleanup();
    setProgress(100);
    setShowCTA(true);

    await delay(6000);
    navigate(CONFIG.ROUTES.DASHBOARD, { replace: true });
  }

  async function handleRejected(cleanup, paymentStatus) {
    cleanup();
    setStatus('error');
    setProgress(100);

    if (paymentStatus === 'cancelled') {
      setMessage('Cancelaste el pago. No te preocupes, podés intentar nuevamente cuando quieras.');
    } else {
      setMessage('Tu tarjeta fue rechazada. Verificá los datos o probá con otra tarjeta.');
    }

    setShowCTA(true);
  }

  async function handleUnknown(cleanup) {
    setStatus('pending');
    setMessage('Verificando el estado de tu pago...');
    setProgress(50);

    try { await refreshAuth(); } catch { /* ignore */ }

    cleanup();
    setProgress(100);
    setShowCTA(true);

    await delay(4000);
    navigate(CONFIG.ROUTES.LOBBY, { replace: true });
  }

  const step = STEPS[status];

  return (
    <div className="payment-callback-wrapper">
      {/* Animated background */}
      <div className="payment-callback-bg">
        <div className="payment-callback-orb orb-1" />
        <div className="payment-callback-orb orb-2" />
      </div>

      <div className="payment-callback-card">
        {/* Icon with animation */}
        <div className="payment-callback-icon" style={{ '--step-color': step.color }}>
          <span className={`callback-icon-emoji ${status === 'loading' || status === 'activating' ? 'spinning' : 'bounce-in'}`}>
            {step.icon}
          </span>
        </div>

        {/* Title */}
        <h1 className="payment-callback-title" style={{ color: step.color }}>
          {step.title}
        </h1>

        {/* Message */}
        <p className="payment-callback-message">{message}</p>

        {/* Progress bar */}
        <div className="payment-callback-progress">
          <div className="payment-callback-progress-bar">
            <div
              className="payment-callback-progress-fill"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${step.color}, ${status === 'error' ? '#ef4444' : '#8b5cf6'})`,
              }}
            />
          </div>
          <span className="payment-callback-progress-text">
            {progress < 100 ? `${progress}%` : 'Completado'}
          </span>
        </div>

        {/* Loading dots */}
        {(status === 'loading' || status === 'activating') && (
          <div className="payment-callback-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}

        {/* CTAs */}
        {showCTA && (
          <div className="payment-callback-actions">
            {status === 'error' ? (
              <>
                <button className="btn btn-primary" style={{ width: '100%' }}
                  onClick={() => navigate(CONFIG.ROUTES.PLANS)}>
                  🔄 Intentar con otra tarjeta
                </button>
                <button className="btn btn-ghost" style={{ width: '100%' }}
                  onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
                  Volver al inicio
                </button>
              </>
            ) : status === 'success' ? (
              <button className="btn btn-primary" style={{ width: '100%' }}
                onClick={() => navigate(CONFIG.ROUTES.DASHBOARD, { replace: true })}>
                🚀 Ir al Dashboard
              </button>
            ) : (
              <button className="btn btn-primary" style={{ width: '100%' }}
                onClick={() => navigate(CONFIG.ROUTES.DASHBOARD, { replace: true })}>
                Continuar al Dashboard
              </button>
            )}
          </div>
        )}

        {/* Security badge */}
        <div className="payment-callback-secure">
          🔒 Transacción segura procesada por Mercado Pago
        </div>
      </div>
    </div>
  );
}

/**
 * Member Portal — portal de autoservicio para socios
 */
export function MemberPortalPage() {
  return (
    <div className="auth-card">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👤</div>
        <h2 className="auth-title">Portal de Socios</h2>
        <p className="auth-subtitle">Esta función estará disponible próximamente</p>
      </div>
    </div>
  );
}

// Utility
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
