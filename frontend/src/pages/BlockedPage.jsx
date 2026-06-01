// ============================================
// VELTRONIK V2 - BLOCKED PAGE (MURO DE TRANSICIÓN)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { useToast } from '../contexts/ToastContext';
import Icon from '../components/Icon';
import CONFIG from '../lib/config';

export default function BlockedPage() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    try {
      setLoading(true);
      // Solicitar link de pago al backend Java
      const response = await apiClient.get('/billing/subscription-link');
      const { init_point } = response.data;
      
      if (init_point) {
        // Redirigir a Mercado Pago
        window.location.href = init_point;
      } else {
        throw new Error('No se recibió el link de pago');
      }
    } catch (error) {
      console.error('Error al generar suscripción:', error);
      showToast('Error al conectar con Mercado Pago', 'error');
      setLoading(false);
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
        padding: '3rem', 
        borderRadius: '24px', 
        maxWidth: '550px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
      }}>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', color: 'var(--primary-400)' }}><Icon name="rocket" size="3.25rem" /></div>
        
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: '800', 
          marginBottom: '1.5rem', 
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Bienvenido al nuevo estándar de Veltronik
        </h1>
        
        <p style={{ color: '#d1d5db', marginBottom: '1.5rem', lineHeight: '1.7', fontSize: '1.05rem', textAlign: 'left' }}>
          Durante el último año trabajamos en secreto para reconstruir Veltronik desde cero. No hicimos una simple actualización; creamos un <b>sistema de nivel empresarial</b>.
        </p>

        <p style={{ color: '#d1d5db', marginBottom: '1.5rem', lineHeight: '1.7', fontSize: '1.05rem', textAlign: 'left' }}>
          A partir de hoy, tu negocio corre sobre infraestructura blindada: cero caídas, pagos automáticos infalibles, seguridad total de tus datos y una interfaz muchísimo más rápida.
        </p>

        <p style={{ color: '#d1d5db', marginBottom: '2.5rem', lineHeight: '1.7', fontSize: '1.05rem', textAlign: 'left' }}>
          Para sostener este nivel de excelencia y las nuevas herramientas con Inteligencia Artificial, nuestro pase mensual se actualiza a <b style={{color: '#fff'}}>$80.000 ARS</b>. Para continuar usando tu cuenta con todas tus sucursales y socios intactos, por favor actualizá tu método de pago.
        </p>

        <button 
          onClick={handleSubscribe}
          disabled={loading}
          style={{
            background: 'linear-gradient(90deg, #3b82f6, #2563eb)', 
            color: 'white', 
            padding: '1.2rem 2rem', 
            borderRadius: '12px', 
            fontSize: '1.1rem', 
            fontWeight: 'bold', 
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer', 
            width: '100%', 
            marginBottom: '1rem',
            boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
            transition: 'transform 0.2s',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Conectando con Mercado Pago...' : 'Actualizar mi suscripción a V2'}
        </button>

        <button
          onClick={() => navigate(CONFIG.ROUTES.LOBBY)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)', 
            color: '#fff', 
            padding: '1rem', 
            borderRadius: '12px', 
            border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer', 
            width: '100%',
            marginBottom: '1rem',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
          onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
        >
          Ya pagué (Reintentar conexión)
        </button>

        <button 
          onClick={logout}
          style={{
            background: 'transparent', color: '#9ca3af', padding: '1rem', 
            borderRadius: '12px', border: '1px solid #374151',
            cursor: 'pointer', width: '100%',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
          onMouseOut={(e) => e.target.style.background = 'transparent'}
        >
          Cerrar Sesión
        </button>
      </div>

    </div>
  );
}
