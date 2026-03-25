// ============================================
// VELTRONIK - PLACEHOLDER PAGES (Phase 1)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, EmptyState } from '../components/Layout';
import CONFIG from '../lib/config';

export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Vista general de tu negocio" icon="dashboard" />
      <EmptyState
        icon="dashboard"
        title="Dashboard en desarrollo"
        description="Esta sección será migrada en la Fase 2"
      />
    </div>
  );
}

export function MembersPage() {
  return (
    <div>
      <PageHeader title="Socios" subtitle="Gestión de socios" icon="users" />
      <EmptyState
        icon="users"
        title="Socios en desarrollo"
        description="Esta sección será migrada en la Fase 2"
      />
    </div>
  );
}

export function PaymentsPage() {
  return (
    <div>
      <PageHeader title="Pagos" subtitle="Gestión de pagos de socios" icon="wallet" />
      <EmptyState
        icon="wallet"
        title="Pagos en desarrollo"
        description="Esta sección será migrada en la Fase 2"
      />
    </div>
  );
}

export function ClassesPage() {
  return (
    <div>
      <PageHeader title="Clases" subtitle="Gestión de clases" icon="calendar" />
      <EmptyState
        icon="calendar"
        title="Clases en desarrollo"
        description="Esta sección será migrada en la Fase 3"
      />
    </div>
  );
}

export function AccessPage() {
  return (
    <div>
      <PageHeader title="Control de Acceso" subtitle="Acceso de socios" icon="door" />
      <EmptyState
        icon="door"
        title="Acceso en desarrollo"
        description="Esta sección será migrada en la Fase 3"
      />
    </div>
  );
}

export function RetentionPage() {
  return (
    <div>
      <PageHeader title="Retención" subtitle="Análisis de retención" icon="shield" />
      <EmptyState
        icon="shield"
        title="Retención en desarrollo"
        description="Esta sección será migrada en la Fase 3"
      />
    </div>
  );
}

export function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reportes" subtitle="Reportes y estadísticas" icon="chart" />
      <EmptyState
        icon="chart"
        title="Reportes en desarrollo"
        description="Esta sección será migrada en la Fase 3"
      />
    </div>
  );
}

export function TeamPage() {
  return (
    <div>
      <PageHeader title="Equipo" subtitle="Gestión del equipo" icon="userCog" />
      <EmptyState
        icon="userCog"
        title="Equipo en desarrollo"
        description="Esta sección será migrada en la Fase 3"
      />
    </div>
  );
}

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Ajustes" subtitle="Configuración del sistema" icon="settings" />
      <EmptyState
        icon="settings"
        title="Ajustes en desarrollo"
        description="Esta sección será migrada en la Fase 4"
      />
    </div>
  );
}

export function OnboardingPage() {
  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Crear tu Negocio</h2>
          <p className="auth-subtitle">Esta sección será migrada en la Fase 1 completa</p>
        </div>
      </div>
    </div>
  );
}

export function PlansPage() {
  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Planes</h2>
          <p className="auth-subtitle">Selecciona un plan para tu negocio</p>
        </div>
      </div>
    </div>
  );
}

export function BlockedPage() {
  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Cuenta Bloqueada</h2>
          <p className="auth-subtitle">Tu cuenta ha sido bloqueada. Contacta soporte.</p>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Restablecer Contraseña</h2>
          <p className="auth-subtitle">Ingresa tu nueva contraseña</p>
        </div>
      </div>
    </div>
  );
}

export function PaymentCallbackPage() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verificando tu pago...');

  useEffect(() => {
    // MercadoPago redirects back with query params: ?status=approved&external_reference=gym_id
    const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
    const paymentStatus = params.get('status') || params.get('collection_status');

    if (paymentStatus === 'approved' || paymentStatus === 'authorized') {
      setStatus('success');
      setMessage('¡Pago aprobado! Activando tu suscripción...');
      
      // Esperar a que el webhook procese el pago, luego refrescar auth
      // El webhook puede tardar unos segundos en procesar
      let retries = 0;
      const pollAuth = async () => {
        try {
          await refreshAuth();
        } catch { /* ignore */ }
        retries++;
        if (retries < 3) {
          setTimeout(pollAuth, 2000);
        } else {
          setMessage('¡Pago aprobado! Tu suscripción está activa. Redirigiendo...');
          setTimeout(() => navigate(CONFIG.ROUTES.DASHBOARD, { replace: true }), 1500);
        }
      };
      // Dar 3 segundos iniciales para que el webhook procese
      setTimeout(pollAuth, 3000);

    } else if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
      setStatus('pending');
      setMessage('Tu pago está siendo procesado. Te notificaremos cuando se confirme.');
      if (refreshAuth) refreshAuth();
      setTimeout(() => navigate(CONFIG.ROUTES.DASHBOARD, { replace: true }), 5000);
    } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
      setStatus('error');
      setMessage('El pago no pudo ser procesado. Podés intentar nuevamente.');
      setTimeout(() => navigate(CONFIG.ROUTES.PLANS, { replace: true }), 5000);
    } else {
      // No status param — user navigated here directly
      setStatus('pending');
      setMessage('Verificando el estado de tu pago...');
      if (refreshAuth) refreshAuth();
      setTimeout(() => navigate(CONFIG.ROUTES.LOBBY, { replace: true }), 4000);
    }
  }, [navigate, refreshAuth]);

  const icons = { loading: '⏳', success: '✅', pending: '⏳', error: '❌' };
  const colors = { loading: '#3b82f6', success: '#10b981', pending: '#f59e0b', error: '#ef4444' };

  return (
    <div className="auth-wrapper">
      <div className="auth-container" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div className="auth-card">
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem', animation: status === 'loading' ? 'pulse 1.5s infinite' : 'none' }}>
            {icons[status]}
          </div>
          <h2 className="auth-title" style={{ color: colors[status] }}>
            {status === 'success' ? '¡Pago Exitoso!' : status === 'error' ? 'Pago Rechazado' : 'Procesando Pago'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>{message}</p>
          {status === 'loading' && <div className="spinner" style={{ margin: '0 auto' }} />}
          {status === 'error' && (
            <button className="btn btn-primary" onClick={() => navigate(CONFIG.ROUTES.PLANS)} style={{ width: '100%' }}>
              Intentar Nuevamente
            </button>
          )}
          {status === 'success' && (
            <button className="btn btn-primary" onClick={() => navigate(CONFIG.ROUTES.DASHBOARD)} style={{ width: '100%' }}>
              Ir al Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MemberPortalPage() {
  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Portal de Socios</h2>
          <p className="auth-subtitle">Portal de socios en desarrollo</p>
        </div>
      </div>
    </div>
  );
}
