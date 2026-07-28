// ============================================
// VELTRONIK - VUELTA DE MERCADO PAGO
// ============================================
// Pantalla a la que vuelve el usuario después de pagar. Mercado Pago manda el
// resultado en la query (`status`/`collection_status`), pero la suscripción la
// activa el WEBHOOK, que puede tardar unos segundos: por eso el caso aprobado
// espera y reintenta refrescar la sesión antes de mandar al Lobby.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';

const STEPS = {
  loading:  { icon: 'refresh',     title: 'Verificando pago', color: '#3b82f6' },
  success:  { icon: 'checkCircle', title: '¡Pago Exitoso!', color: '#10b981' },
  pending:  { icon: 'clock',       title: 'Pago en Proceso', color: '#f59e0b' },
  error:    { icon: 'xCircle',     title: 'Pago Rechazado', color: '#ef4444' },
  activating: { icon: 'zap',       title: 'Activando tu cuenta', color: '#8b5cf6' },
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function PaymentCallbackPage() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Conectando con Mercado Pago...');
  const [progress, setProgress] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const processed = useRef(false);

  // Siempre volvemos al Lobby: es el único que sabe a dónde mandar al usuario según
  // cómo quedó su suscripción (y acá el estado nuevo todavía no está en el contexto).
  const goToLobby = () => navigate(CONFIG.ROUTES.LOBBY, { replace: true });

  async function handleApproved(stopProgress) {
    setStatus('success');
    setMessage('¡Tu pago fue aprobado exitosamente!');
    setProgress(60);

    // Le damos aire al webhook antes de empezar a preguntar por la suscripción.
    await delay(2500);

    setStatus('activating');
    setMessage('Activando tu suscripción...');
    setProgress(70);

    // Reintentos hasta ~12s: el webhook de Mercado Pago no es instantáneo.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await refreshAuth();
        setProgress(75 + attempt * 4);
      } catch { /* ignore */ }
      await delay(2000);
    }

    stopProgress();
    setProgress(100);
    setMessage('¡Todo listo! Tu cuenta está activa.');
    setStatus('success');
    setShowCTA(true);

    await delay(3000);
    goToLobby();
  }

  async function handlePending(stopProgress) {
    setStatus('pending');
    setMessage('Tu pago está siendo procesado por Mercado Pago. Esto puede demorar unos minutos.');
    setProgress(50);

    try { await refreshAuth(); } catch { /* ignore */ }

    stopProgress();
    setProgress(100);
    setShowCTA(true);

    await delay(6000);
    goToLobby();
  }

  function handleRejected(stopProgress, paymentStatus) {
    stopProgress();
    setStatus('error');
    setProgress(100);

    if (paymentStatus === 'cancelled') {
      setMessage('Cancelaste el pago. No te preocupes, podés intentar nuevamente cuando quieras.');
    } else {
      setMessage('Tu tarjeta fue rechazada. Verificá los datos o probá con otra tarjeta.');
    }

    setShowCTA(true);
  }

  // Sin `status` en la URL no sabemos qué pasó (entró de memoria, o Mercado Pago
  // no lo mandó): preguntamos por la sesión y lo devolvemos al Lobby.
  async function handleUnknown(stopProgress) {
    setStatus('pending');
    setMessage('Verificando el estado de tu pago...');
    setProgress(50);

    try { await refreshAuth(); } catch { /* ignore */ }

    stopProgress();
    setProgress(100);
    setShowCTA(true);

    await delay(4000);
    goToLobby();
  }

  // Flujo de una sola pasada, disparado al montar: lee el resultado del pago y
  // arranca el camino que corresponda. El ref lo blinda contra el doble montaje
  // del StrictMode (si no, se dispararían dos veces los reintentos y el redirect).
  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // La app corre con HashRouter: la query puede venir antes o después del '#'.
    const rawSearch = window.location.search || '';
    const hashSearch = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const params = new URLSearchParams(rawSearch || hashSearch);
    const paymentStatus = params.get('status') || params.get('collection_status') || '';

    // La barra sube sola hasta 90% mientras esperamos; el 100% lo pone cada camino.
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 90));
    }, 100);
    const stopProgress = () => clearInterval(progressInterval);

    if (paymentStatus === 'approved' || paymentStatus === 'authorized') {
      handleApproved(stopProgress);
    } else if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
      handlePending(stopProgress);
    } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
      handleRejected(stopProgress, paymentStatus);
    } else {
      handleUnknown(stopProgress);
    }

    return stopProgress;
    // Corre UNA sola vez, al montar: los handlers son de un solo uso y listarlos acá
    // los volvería a disparar en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="payment-callback-icon" style={{ '--step-color': step.color, color: step.color }}>
          <span className={`callback-icon-svg ${status === 'loading' || status === 'activating' ? 'spinning' : 'bounce-in'}`}>
            <Icon name={step.icon} size="2.75rem" />
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
                  <Icon name="rotateCw" size="1.1em" /> Intentar con otra tarjeta
                </button>
                <button className="btn btn-ghost" style={{ width: '100%' }}
                  onClick={goToLobby}>
                  Volver al inicio
                </button>
              </>
            ) : status === 'success' ? (
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={goToLobby}>
                Continuar <Icon name="arrowRight" size="1.1em" />
              </button>
            ) : (
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={goToLobby}>
                Continuar
              </button>
            )}
          </div>
        )}

        {/* Security badge */}
        <div className="payment-callback-secure">
          <Icon name="lock" size="0.9em" /> Transacción segura procesada por Mercado Pago
        </div>
      </div>
    </div>
  );
}
