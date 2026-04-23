// ============================================
// VELTRONIK V2 - BLOCKED PAGE (Netflix-Level)
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService, supabase } from '../services';
import CONFIG from '../lib/config';

export default function BlockedPage() {
  const navigate = useNavigate();
  const { gym, subscription, isActiveSubscription, isTrialActive, logout, user, profile, refreshAuth } = useAuth();
  const { showToast } = useToast();
  const orgType = localStorage.getItem('current_org_type') || gym?.type || 'GYM';
  const typeLabel = { GYM: 'gimnasio', RESTO: 'restaurante', KIOSK: 'kiosco' }[orgType] || 'negocio';

  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [hasMultipleOrgs, setHasMultipleOrgs] = useState(false);

  // Compute block reason with grace period info
  const blockReason = useMemo(() => {
    if (subscription?.status === 'canceled') {
      return {
        type: 'canceled',
        icon: '🚫',
        title: 'Suscripción cancelada',
        message: `Tu suscripción del ${typeLabel} fue cancelada. Tus datos están seguros y no serán eliminados. Suscribite nuevamente para reactivar tu cuenta.`,
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
      const retryCount = subscription.retry_count || 0;

      const urgencyMessage = daysLeft > 3
        ? `Tenés ${daysLeft} días para resolver esto.`
        : daysLeft > 0
        ? `⚡ Solo te quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} antes de perder acceso.`
        : 'Tu período de gracia expiró.';

      return {
        type: 'past_due',
        icon: '💳',
        title: 'Pago rechazado',
        message: `No pudimos procesar tu pago mensual (intento ${retryCount}/4). ${urgencyMessage} Actualizá tu método de pago para mantener el acceso a tu ${typeLabel}.`,
        showUpdateCard: true,
        daysLeft,
        retryCount,
        accentColor: daysLeft <= 1 ? '#ef4444' : '#f59e0b',
      };
    }

    if (gym?.trial_ends_at && new Date(gym.trial_ends_at) < new Date()) {
      return {
        type: 'trial_expired',
        icon: '⏰',
        title: 'Prueba gratuita finalizada',
        message: `Tu período de prueba de 30 días para tu ${typeLabel} ha finalizado. Tus datos están seguros. Suscribite para seguir usando Veltronik.`,
        showUpdateCard: false,
        accentColor: '#3b82f6',
      };
    }

    return {
      type: 'blocked',
      icon: '🔒',
      title: 'Acceso suspendido',
      message: 'Tu cuenta fue suspendida. Tus datos están seguros. Contactanos o suscribite para reactivar tu acceso.',
      showUpdateCard: false,
      accentColor: '#ef4444',
    };
  }, [subscription, gym, typeLabel]);

  useEffect(() => {
    // If active subscription or trial → redirect to dashboard
    if ((gym && isActiveSubscription(subscription)) || isTrialActive) {
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
  }, [gym, subscription, isActiveSubscription, isTrialActive, navigate]);

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
      showToast('No se encontraron los datos necesarios', 'error');
      return;
    }

    setUpdatingPayment(true);
    try {
      const response = await fetch(`${CONFIG.API_URL}/api/update-payment-method`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym_id: gymId, payer_email: payerEmail }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al actualizar método de pago');
      }

      const checkoutUrl = CONFIG.DEBUG
        ? (result.data?.sandbox_init_point || result.data?.init_point)
        : (result.data?.init_point || result.data?.sandbox_init_point);

      if (checkoutUrl) {
        showToast('Redirigiendo a Mercado Pago...', 'info');
        setTimeout(() => { window.location.href = checkoutUrl; }, 800);
      } else {
        throw new Error('No se obtuvo URL de checkout');
      }
    } catch (error) {
      showToast(error.message || 'Error al actualizar método de pago', 'error');
    } finally {
      setUpdatingPayment(false);
    }
  };

  return (
    <div className="blocked-wrapper">
      {/* Background effects */}
      <div className="blocked-bg">
        <div className="blocked-orb blocked-orb-1" style={{ background: `radial-gradient(circle, ${blockReason.accentColor}33 0%, transparent 70%)` }} />
        <div className="blocked-orb blocked-orb-2" />
      </div>

      <div className="blocked-container">
        <div className="blocked-card">
          {/* Icon */}
          <div className="blocked-icon-wrapper">
            <span className="blocked-icon-emoji">{blockReason.icon}</span>
          </div>

          {/* Title & message */}
          <h1 className="blocked-title">{blockReason.title}</h1>
          <p className="blocked-message">{blockReason.message}</p>

          {/* Grace period countdown */}
          {blockReason.type === 'past_due' && blockReason.daysLeft !== undefined && (
            <div className="blocked-grace-bar">
              <div className="blocked-grace-header">
                <span>Período de gracia</span>
                <span className={blockReason.daysLeft <= 1 ? 'text-danger' : blockReason.daysLeft <= 3 ? 'text-warning' : ''}>
                  {blockReason.daysLeft > 0 ? `${blockReason.daysLeft} días restantes` : 'Expirado'}
                </span>
              </div>
              <div className="blocked-grace-track">
                <div
                  className="blocked-grace-fill"
                  style={{
                    width: `${Math.max(5, ((7 - blockReason.daysLeft) / 7) * 100)}%`,
                    background: blockReason.daysLeft <= 1
                      ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                      : blockReason.daysLeft <= 3
                      ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                      : 'linear-gradient(90deg, var(--primary-500), #f59e0b)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Status badge */}
          <div className="blocked-status-badge" style={{ borderColor: `${blockReason.accentColor}40`, background: `${blockReason.accentColor}15` }}>
            <span style={{ color: blockReason.accentColor }}>
              ⚠️ Estado: <strong>{blockReason.title}</strong>
            </span>
          </div>

          {/* Actions */}
          <div className="blocked-actions">
            <button className="btn btn-primary blocked-btn-main"
              onClick={() => navigate(CONFIG.ROUTES.PLANS)}>
              💳 Reactivar Suscripción
            </button>

            {blockReason.showUpdateCard && (
              <button
                className="btn btn-secondary"
                style={{ width: '100%', padding: '0.75rem' }}
                onClick={handleUpdatePaymentMethod}
                disabled={updatingPayment}
              >
                {updatingPayment ? (
                  <><span className="spinner" /> Procesando...</>
                ) : (
                  '🔄 Cambiar Tarjeta / Método de Pago'
                )}
              </button>
            )}

            {hasMultipleOrgs && (
              <button className="btn btn-ghost" style={{ width: '100%' }}
                onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
                🔄 Ir a Mis Otros Sistemas
              </button>
            )}

            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={logout}>
              Cerrar Sesión
            </button>
          </div>

          {/* Card tips */}
          {blockReason.showUpdateCard && (
            <div className="blocked-tip-box">
              <p>
                💡 <strong>¿Problemas con tu tarjeta?</strong><br />
                Presioná "Cambiar Tarjeta" para ingresar una nueva tarjeta o elegir otro método de pago en Mercado Pago.
                Si usás tarjeta de débito, asegurate de tener saldo suficiente.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="blocked-footer">
            <p>¿Necesitás ayuda? Contactanos</p>
            <div className="blocked-footer-links">
              <a href="https://www.instagram.com/veltroniik/" target="_blank" rel="noreferrer">📷 Instagram</a>
              <a href="mailto:veltronikcompany@gmail.com">📧 Email</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
