// ============================================
// VELTRONIK V2 - BLOCKED PAGE (MURO DE PAGO)
// ============================================
// Cobro principal: el cliente pone la tarjeta acá mismo (Card Payment Brick) y queda
// suscripto, sin login de MP ni email que coincida. Se deja el link de MP como respaldo.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { useToast } from '../contexts/ToastContext';
import CardCheckout from '../components/CardCheckout';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

export default function BlockedPage() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // Pago OK con tarjeta → el backend ya reactivó. Volvemos al Lobby, que re-evalúa el acceso
  // y enruta al dashboard.
  const handleSuccess = () => {
    showToast('¡Pago confirmado! Activando tu cuenta…', 'success');
    setTimeout(() => navigate(CONFIG.ROUTES.LOBBY), 1500);
  };

  // Respaldo: el link clásico de Mercado Pago (por si el formulario de tarjeta fallara).
  const handleFallbackLink = async () => {
    try {
      setFallbackLoading(true);
      const response = await apiClient.get('/billing/subscription-link');
      const { init_point } = response.data;
      if (init_point) {
        window.location.href = init_point;
      } else {
        throw new Error('No se recibió el link de pago');
      }
    } catch (error) {
      console.error('Error al generar suscripción:', error);
      showToast('No se pudo abrir el pago alternativo', 'error');
      setFallbackLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0a0a0a', color: '#fff', textAlign: 'center', padding: '2rem',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '2.5rem',
        borderRadius: '24px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
      }}>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', color: 'var(--primary-400)' }}>
          <Icon name="rocket" size="3rem" />
        </div>

        <h1 style={{
          fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.75rem',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>
          Activá tu suscripción a Veltronik
        </h1>

        <p style={{ color: '#d1d5db', marginBottom: '1.5rem', lineHeight: '1.6', fontSize: '0.98rem' }}>
          Ingresá tu tarjeta y listo — el cobro es mensual de <b style={{ color: '#fff' }}>$80.000 ARS</b> y
          tus sucursales y socios siguen intactos. Pago seguro procesado por Mercado Pago.
        </p>

        {/* Formulario de tarjeta (tokeniza y suscribe sin salir de la app) */}
        <CardCheckout onSuccess={handleSuccess} />

        {/* Respaldo: link clásico de Mercado Pago */}
        <button
          onClick={handleFallbackLink}
          disabled={fallbackLoading}
          style={{
            background: 'transparent', color: '#9ca3af', padding: '0.85rem',
            borderRadius: '12px', border: '1px solid #374151',
            cursor: fallbackLoading ? 'not-allowed' : 'pointer', width: '100%',
            marginTop: '1.25rem', fontSize: '0.9rem'
          }}
        >
          {fallbackLoading ? 'Abriendo…' : 'Prefiero pagar con el link de Mercado Pago'}
        </button>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button
            onClick={() => navigate(CONFIG.ROUTES.LOBBY)}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '0.85rem',
              borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: '0.9rem'
            }}
          >
            Ya pagué (reintentar)
          </button>
          <button
            onClick={logout}
            style={{
              flex: 1, background: 'transparent', color: '#9ca3af', padding: '0.85rem',
              borderRadius: '12px', border: '1px solid #374151', cursor: 'pointer', fontSize: '0.9rem'
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
