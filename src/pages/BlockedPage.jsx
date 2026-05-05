// ============================================
// VELTRONIK V2 - BLOCKED PAGE (Premium & Professional)
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService, supabase } from '../services';
import { apiCall } from '../lib/api';
import CONFIG from '../lib/config';

export default function BlockedPage() {
  const navigate = useNavigate();
  const { gym, subscription, hasValidAccess, logout, user, profile, refreshAuth } = useAuth();
  const { showToast } = useToast();
  const orgType = localStorage.getItem('current_org_type') || gym?.type || 'GYM';
  const typeLabel = { GYM: 'gimnasio', PILATES: 'estudio', CLUB: 'club', ACADEMY: 'academia', RESTO: 'restaurante', KIOSK: 'kiosco', OTHER: 'negocio' }[orgType] || 'negocio';

  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [hasMultipleOrgs, setHasMultipleOrgs] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Verify subscription status with MercadoPago
  const handleVerifyStatus = async () => {
    const gymId = gym?.id || localStorage.getItem('current_org_id');
    if (!gymId) return;

    setVerifying(true);
    try {
      const { ok, data: result } = await apiCall('/api/verify-subscription', {
        gym_id: gymId,
      });

      if (ok && result.changed) {
        showToast(`✅ ${result.message}`, 'success');
        if (refreshAuth) {
          try { await refreshAuth(); } catch { /* ignore */ }
        }
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        showToast(result.message || 'El estado de la suscripción está actualizado', 'info');
      }
    } catch {
      showToast('No pudimos verificar el estado en este momento. Intenta de nuevo más tarde.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  // Compute block reason with grace period info and beautiful professional wording
  const blockReason = useMemo(() => {
    if (subscription?.status === 'canceled') {
      return {
        type: 'canceled',
        emoji: '💡',
        title: 'Suscripción Inactiva',
        message: `La suscripción de tu ${typeLabel} se encuentra inactiva. Toda tu información y configuraciones están guardadas de forma segura. Puedes reactivar tu cuenta en cualquier momento para continuar utilizando la plataforma.`,
        showUpdateCard: false,
        accentColor: '#64748b',
      };
    }

    if (subscription?.status === 'past_due') {
      // Calculate grace period
      const graceEnd = subscription.grace_period_ends_at
        ? new Date(subscription.grace_period_ends_at)
        : null;
      const now = new Date();
      const daysLeft = graceEnd
        ? Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)))
        : 0;
      
      const urgencyMessage = daysLeft > 3
        ? `Cuentas con ${daysLeft} días de gracia para actualizar tus datos sin afectar tu acceso.`
        : daysLeft > 0
        ? `Te quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} para mantener el servicio activo sin interrupciones.`
        : 'El período de gracia ha finalizado.';

      return {
        type: 'past_due',
        emoji: '💳',
        title: 'Actualización de Pago Requerida',
        message: `Tuvimos un inconveniente al procesar el último ciclo de tu suscripción. ${urgencyMessage} Por favor, actualiza tu método de pago para seguir disfrutando de todas las funciones de Veltronik.`,
        showUpdateCard: true,
        daysLeft,
        accentColor: daysLeft <= 1 ? '#ef4444' : '#f59e0b',
      };
    }

    if (gym?.trial_ends_at && new Date(gym.trial_ends_at) < new Date()) {
      return {
        type: 'trial_expired',
        emoji: '✨',
        title: 'Tu período de prueba ha finalizado',
        message: `Esperamos que hayas disfrutado tus días de prueba en tu ${typeLabel}. Tu información está guardada de forma segura. Elige un plan para aprovechar al máximo todas las herramientas de Veltronik.`,
        showUpdateCard: false,
        accentColor: '#3b82f6',
      };
    }

    return {
      type: 'blocked',
      emoji: '⏸️',
      title: 'Acceso en Pausa',
      message: 'El acceso a tu espacio de trabajo se encuentra temporalmente en pausa. Tu información y base de datos están seguras con nosotros. Reactiva tu plan para volver a operar con normalidad.',
      showUpdateCard: false,
      accentColor: '#8b5cf6',
    };
  }, [subscription, gym, typeLabel]);

  useEffect(() => {
    // If valid access → redirect to dashboard
    if (gym && hasValidAccess(gym, subscription)) {
      navigate(CONFIG.ROUTES.DASHBOARD, { replace: true });
      return;
    }

    // Check for multiple orgs
    (async () => {
      try {
        const orgs = await gymService.getUserGyms();
        if (orgs?.length > 1) setHasMultipleOrgs(true);
      } catch { /* silent */ }
    })();
  }, [gym, subscription, hasValidAccess, navigate]);

  // Update payment method
  const handleUpdatePaymentMethod = async () => {
    const gymId = gym?.id || localStorage.getItem('current_org_id');
    
    let payerEmail = user?.email || profile?.email;
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('mp_payer_email')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sub?.mp_payer_email) payerEmail = sub.mp_payer_email;
    } catch { /* use fallback email */ }

    if (!gymId || !payerEmail) {
      showToast('No pudimos validar la información necesaria. Por favor, intenta de nuevo.', 'error');
      return;
    }

    setUpdatingPayment(true);
    try {
      const { ok, data: result } = await apiCall('/api/update-payment-method', {
        gym_id: gymId,
        payer_email: payerEmail,
      });

      if (!ok) {
        throw new Error(result.error || 'Tuvimos un problema al preparar la actualización. Intenta en unos minutos.');
      }

      const checkoutUrl = CONFIG.DEBUG
        ? (result.data?.sandbox_init_point || result.data?.init_point)
        : (result.data?.init_point || result.data?.sandbox_init_point);

      if (checkoutUrl) {
        showToast('Abriendo portal de pagos seguro...', 'info');
        setTimeout(() => { window.location.href = checkoutUrl; }, 800);
      } else {
        throw new Error('No se pudo generar el acceso al portal de pagos.');
      }
    } catch (error) {
      showToast(error.message || 'Tuvimos un inconveniente al conectar con el servidor. Revisa tu conexión e intenta de nuevo.', 'error');
    } finally {
      setUpdatingPayment(false);
    }
  };

  return (
    <div className="premium-blocked-wrapper">
      {/* Dynamic Background Effects */}
      <div className="premium-blocked-bg">
        <div className="glow-orb" style={{ background: `radial-gradient(circle, ${blockReason.accentColor}33 0%, transparent 70%)`, top: '-10%', right: '-5%' }} />
        <div className="glow-orb" style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)', bottom: '-20%', left: '-10%', animationDelay: '-3s' }} />
      </div>

      <div className="premium-blocked-content">
        {/* Left Side: Brand & Context */}
        <div className="premium-blocked-info">
          <div className="brand-logo">
            <div className="logo-icon">V</div>
            <span className="logo-text">Veltronik</span>
          </div>
          
          <div className="status-hero">
            <span className="status-emoji" role="img" aria-label="status">{blockReason.emoji}</span>
            <h1 className="status-title">{blockReason.title}</h1>
            <p className="status-message">{blockReason.message}</p>
          </div>

          {blockReason.type === 'past_due' && blockReason.daysLeft !== undefined && (
            <div className="grace-period-indicator">
              <div className="grace-period-header">
                <span className="grace-label">Estado del servicio</span>
                <span className="grace-value" style={{ color: blockReason.accentColor }}>
                  {blockReason.daysLeft > 0 ? `${blockReason.daysLeft} días de gracia` : 'Período finalizado'}
                </span>
              </div>
              <div className="grace-progress-track">
                <div
                  className="grace-progress-fill"
                  style={{
                    width: `${Math.max(5, ((7 - blockReason.daysLeft) / 7) * 100)}%`,
                    background: blockReason.accentColor,
                    boxShadow: `0 0 10px ${blockReason.accentColor}80`
                  }}
                />
              </div>
            </div>
          )}
          
          <div className="support-info">
            <p>¿Necesitas ayuda con tu cuenta?</p>
            <div className="support-links-row">
              <a href="mailto:veltronikcompany@gmail.com" className="support-link email">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                <span>Contactar Soporte</span>
              </a>
            </div>
          </div>
        </div>

        {/* Right Side: Actions Panel */}
        <div className="premium-blocked-actions-panel">
          <div className="actions-card">
            <div className="actions-header">
              <h3>Opciones disponibles</h3>
              <p>Elige cómo deseas continuar</p>
            </div>

            <div className="action-buttons-stack">
              <button 
                className="premium-btn-primary full-width"
                onClick={() => navigate(CONFIG.ROUTES.PLANS)}
              >
                <span className="btn-icon">💎</span>
                <span className="btn-text">Ver Planes y Reactivar</span>
              </button>

              {blockReason.showUpdateCard && (
                <button
                  className="premium-btn-secondary full-width"
                  onClick={handleUpdatePaymentMethod}
                  disabled={updatingPayment}
                >
                  <span className="btn-icon">💳</span>
                  <span className="btn-text">
                    {updatingPayment ? 'Procesando solicitud...' : 'Actualizar Método de Pago'}
                  </span>
                </button>
              )}

              <div className="action-divider"><span>Otras opciones</span></div>

              <button
                className="premium-btn-outline full-width"
                onClick={handleVerifyStatus}
                disabled={verifying}
              >
                {verifying ? (
                  <><span className="spinner-small" /> Sincronizando estado...</>
                ) : (
                  '🔄 Sincronizar estado del pago'
                )}
              </button>

              <div className="secondary-actions-row">
                <button className="premium-btn-ghost" onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
                  Ir al Lobby
                </button>
                <button className="premium-btn-ghost text-muted" onClick={logout}>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
