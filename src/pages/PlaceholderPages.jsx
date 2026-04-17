// ============================================
// VELTRONIK - PLACEHOLDER PAGES
// ============================================
// Solo contiene páginas que aún no tienen
// implementación propia completa.
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';

/**
 * Payment Callback — procesa la respuesta de MercadoPago
 */
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
    <div className="auth-card">
      <div style={{ textAlign: 'center' }}>
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
