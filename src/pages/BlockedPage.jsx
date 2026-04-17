// ============================================
// VELTRONIK V2 - BLOCKED PAGE
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { gymService } from '../services';
import CONFIG from '../lib/config';

export default function BlockedPage() {
  const navigate = useNavigate();
  const { gym, subscription, isActiveSubscription, isTrialActive, logout } = useAuth();
  const orgType = localStorage.getItem('current_org_type') || gym?.organization_type || 'GYM';
  const typeLabel = { GYM: 'gimnasio', RESTO: 'restaurante', KIOSK: 'kiosco' }[orgType] || 'negocio';

  const blockReason = useMemo(() => {
    if (subscription?.status === 'canceled') {
      return { title: 'Suscripción cancelada', message: `Tu suscripción del ${typeLabel} fue cancelada. Tus datos están seguros y no serán eliminados. Suscribite nuevamente para reactivar tu cuenta.` };
    }
    if (subscription?.status === 'past_due') {
      return { title: 'Pago vencido', message: 'No pudimos procesar tu pago mensual. Tu cuenta fue bloqueada. Actualizá tu método de pago para reactivarla.' };
    }
    if (gym?.trial_ends_at && new Date(gym.trial_ends_at) < new Date()) {
      return { title: 'Prueba gratuita finalizada', message: `Tu período de prueba de 30 días para tu ${typeLabel} ha finalizado. Tus datos están seguros. Suscribite para seguir usando Veltronik.` };
    }
    return { title: 'Bloqueado', message: 'Tu cuenta fue suspendida. Tus datos están seguros. Contactanos o suscribite para reactivar tu acceso.' };
  }, [subscription, gym, typeLabel]);

  const [hasMultipleOrgs, setHasMultipleOrgs] = useState(false);

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

  return (
    <div className="auth-wrapper">
      <div className="auth-container" style={{ maxWidth: 500, textAlign: 'center' }}>
        <div className="auth-card">
          <div style={{ fontSize: '5rem', marginBottom: '1.5rem', animation: 'pulse 2s infinite' }}>🔒</div>
          <h1 className="auth-title">Acceso Suspendido</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>{blockReason.message}</p>

          <div style={{
            padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--border-radius-md)', marginBottom: '2rem'
          }}>
            <p style={{ color: 'var(--error-500)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
              ⚠️ Estado actual: <strong>{blockReason.title}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}
              onClick={() => navigate(CONFIG.ROUTES.PLANS)}>
              💳 Reactivar Suscripción
            </button>
            {hasMultipleOrgs && (
              <button className="btn btn-secondary" style={{ width: '100%' }}
                onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
                🔄 Ir a Mis Otros Sistemas
              </button>
            )}
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={logout}>
              Cerrar Sesión
            </button>
          </div>

          <div style={{ marginTop: '2rem', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
            <p>¿Necesitás ayuda? Contactanos</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
              <a href="https://www.instagram.com/veltroniik/" target="_blank" rel="noreferrer" style={{ color: '#E4405F' }}>📷 Instagram</a>
              <a href="mailto:veltronikcompany@gmail.com" style={{ color: '#EA4335' }}>📧 Email</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
