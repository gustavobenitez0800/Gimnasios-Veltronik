// ============================================
// VELTRONIK - LAYOUT COMPONENTS
// ============================================

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Icon from './Icon';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';
import GymLogo from './GymLogo';
import { derivarPaleta } from '../lib/brandColor';

import ErrorBoundary from './ErrorBoundary';

/**
 * Header móvil que se retrae al bajar y vuelve al subir.
 *
 * Un header clavado arriba se come una franja de pantalla PERMANENTE, que en un
 * teléfono es carísima. Este se comporta como el de las apps nativas: molesta cero
 * mientras leés hacia abajo y aparece apenas hacés el gesto de volver.
 *
 * Detalles que importan:
 *  - El umbral de 8px ignora el temblor del dedo (si no, el header parpadea).
 *  - Cerca del tope (<64px) siempre se muestra: nadie quiere "buscar" el menú al
 *    llegar arriba de todo.
 *  - rAF: el listener es pasivo y no calcula nada durante el scroll.
 */
function useAutoHideHeader() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const NOISE = 8;      // px de temblor que ignoramos
    const ALWAYS_SHOW = 64; // px desde el tope donde el header es intocable

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY;
        if (y < ALWAYS_SHOW) {
          setHidden(false);
          lastY = y;
        } else if (delta > NOISE) {
          setHidden(true);
          lastY = y;
        } else if (delta < -NOISE) {
          setHidden(false);
          lastY = y;
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return [hidden, setHidden];
}

/**
 * Main app layout with sidebar (for dashboard pages)
 * Includes payment warning banner for past_due subscriptions.
 */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading, subscription, gym, orgName } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toggleRef = useRef(null);
  const [headerHidden, setHeaderHidden] = useAutoHideHeader();

  // Al cambiar de sección la página vuelve arriba: el header también.
  useEffect(() => { setHeaderHidden(false); }, [location.pathname, setHeaderHidden]);

  // Cierre del drawer reutilizable: además de ocultarlo, devuelve el foco al botón
  // hamburguesa (en desktop el botón está display:none → focus() es no-op inocuo).
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Drawer móvil abierto → bloquear el scroll del fondo y cerrar con Escape.
  // El lock vive en <body> (CSS solo lo aplica en mobile); el listener se limpia al cerrar.
  useEffect(() => {
    if (!sidebarOpen) return;
    document.body.classList.add('sidebar-drawer-open');
    const onKey = (e) => { if (e.key === 'Escape') closeSidebar(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sidebar-drawer-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [sidebarOpen, closeSidebar]);

  // Payment warning banner logic
  const paymentWarning = useMemo(() => {
    if (!subscription) return null;

    if (subscription.status === 'past_due') {
      // DTO en camelCase (gracePeriodEndsAt); snake_case por compatibilidad.
      const graceRaw = subscription.gracePeriodEndsAt ?? subscription.grace_period_ends_at;
      const graceEnd = graceRaw ? new Date(graceRaw) : null;
      const now = new Date();
      const daysLeft = graceEnd
        ? Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)))
        : null;

      return {
        type: 'warning',
        message: daysLeft !== null && daysLeft > 0
          ? <><Icon name="alertTriangle" size="1em" style={{ marginRight: '6px' }} /> Tu pago fue rechazado. Tenés {daysLeft} día{daysLeft !== 1 ? 's' : ''} para actualizar tu método de pago antes de perder acceso.</>
          : <><Icon name="alertTriangle" size="1em" style={{ marginRight: '6px' }} /> Tu pago fue rechazado. Actualizá tu método de pago para mantener el acceso.</>,
        action: 'Actualizar pago',
        route: CONFIG.ROUTES.SETTINGS,
      };
    }

    return null;
  }, [subscription]);

  // La paleta del gimnasio, derivada de UN color elegido por el dueño.
  //
  // Va acá y no en :root a propósito: AppLayout envuelve exactamente lo que el gimnasio
  // considera "el sistema" (dashboard, socios, pagos, accesos). El lobby, el login y el
  // portal de cobro quedan afuera con la identidad de Veltronik, porque ahí el dueño no
  // está usando su gimnasio: está tratando con su proveedor.
  //
  // Sin color elegido devuelve {}, que no pisa ninguna variable. Eso es lo que hace que
  // esto no toque a ningún gimnasio que no lo use.
  const paleta = useMemo(() => derivarPaleta(gym?.brandColor), [gym?.brandColor]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="app-layout" style={paleta}>
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="main-content">
        {/* Mobile header — el drawer abierto lo mantiene a la vista */}
        <header className={`mobile-header ${headerHidden && !sidebarOpen ? 'mobile-header-hidden' : ''}`}>
          <button
            ref={toggleRef}
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú de navegación"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
          >
            <Icon name="menu" />
            <span className="sidebar-toggle-label">Menú</span>
          </button>
          {/* La marca del cliente, igual que en el sidebar: adentro del sistema el
              gimnasio es la marca. */}
          <span className="mobile-header-brand">
            <GymLogo
              logoUrl={gym?.logoUrl}
              logoEmoji={gym?.logoEmoji}
              name={gym?.name || orgName || ''}
              size={28}
            />
            <span className="mobile-header-brand-text">{gym?.name || orgName || 'Veltronik'}</span>
          </span>
          <span className="mobile-header-spacer" aria-hidden="true" />
        </header>

        {/* Payment warning banner */}
        {paymentWarning && (
          <div className={`payment-warning-banner payment-warning-${paymentWarning.type}`}>
            <span className="payment-warning-text">{paymentWarning.message}</span>
            <button
              className="payment-warning-btn"
              onClick={() => navigate(paymentWarning.route)}
            >
              {paymentWarning.action} →
            </button>
          </div>
        )}

        <div className="page-content">
          <ErrorBoundary inline={true}>
            {/* key por ruta: re-dispara el fade-in suave al cambiar de sección */}
            <div className="route-transition" key={location.pathname}>
              <Outlet />
            </div>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

/**
 * Auth layout (login, register, etc.)
 * Aurora mouse-tracking: un orbe sigue al cursor con interpolación suave.
 */
export function AuthLayout() {
  const orbRef = useRef(null);
  const mouse  = useRef({ x: 0.5, y: 0.5 });   // posición target (0-1)
  const smooth = useRef({ x: 0.5, y: 0.5 });   // posición interpolada

  useEffect(() => {
    let rafId;

    const handleMove = (e) => {
      mouse.current.x = e.clientX / window.innerWidth;
      mouse.current.y = e.clientY / window.innerHeight;
    };

    const tick = () => {
      // Lerp factor: cuanto más bajo, más suave y lento sigue
      const ease = 0.04;
      smooth.current.x += (mouse.current.x - smooth.current.x) * ease;
      smooth.current.y += (mouse.current.y - smooth.current.y) * ease;

      if (orbRef.current) {
        const ox = smooth.current.x * 100;
        const oy = smooth.current.y * 100;
        orbRef.current.style.left = `${ox}%`;
        orbRef.current.style.top  = `${oy}%`;
      }

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMove);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="auth-wrapper">
      {/* Orbe que sigue al mouse */}
      <div ref={orbRef} className="aurora-mouse-orb" />
      <div className="auth-container">
        <Outlet />
      </div>
    </div>
  );
}

/**
 * Full-screen loading
 */
function LoadingScreen({ message = 'Cargando...' }) {
  return (
    <div className="loading-overlay loading-show">
      <div className="loading-content">
        <div className="loading-spinner" />
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
}

/**
 * Page header component
 */
export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <div className="page-header">
      <div className="page-header-info">
        {icon && <Icon name={icon} className="page-header-icon" size="1.5rem" />}
        <div>
          <h1 className="page-header-title">{title}</h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

/**
 * Empty state component
 */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state">
      {icon && <Icon name={icon} className="empty-state-icon" size="3rem" />}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

/**
 * Confirm dialog component.
 *
 * Se mudó a components/ui/ConfirmDialog.jsx: Layout importa Sidebar, y Sidebar necesita
 * confirmar el cierre de sesión — tenerlo acá habría creado un ciclo entre los dos
 * módulos. Se re-exporta para que todo lo que ya lo importaba desde Layout siga andando.
 */
export { default as ConfirmDialog } from './ui/ConfirmDialog';
