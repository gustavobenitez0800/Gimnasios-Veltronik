// ============================================
// VELTRONIK - LAYOUT COMPONENTS
// ============================================

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Icon from './Icon';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';

import ErrorBoundary from './ErrorBoundary';

/**
 * Main app layout with sidebar (for dashboard pages)
 * Includes payment warning banner for past_due subscriptions.
 */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading, subscription, gym } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toggleRef = useRef(null);

  // Cierre del drawer reutilizable: además de ocultarlo, devuelve el foco al botón
  // hamburguesa (en desktop el botón está display:none → focus() es no-op inocuo).
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Apply vertical theme
  useEffect(() => {
    const orgType = gym?.type || localStorage.getItem('current_org_type') || 'GYM';
    document.documentElement.setAttribute('data-vertical', orgType.toLowerCase());
    return () => {
      document.documentElement.removeAttribute('data-vertical');
    };
  }, [gym]);

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

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="main-content">
        {/* Mobile header */}
        <header className="mobile-header">
          <button
            ref={toggleRef}
            className="btn-icon sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú de navegación"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
          >
            <Icon name="menu" />
          </button>
          <span className="mobile-header-title">Veltronik</span>
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
export function LoadingScreen({ message = 'Cargando...' }) {
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
 * Confirm dialog component
 */
export function ConfirmDialog({ open, title, message, icon = 'alertTriangle', confirmText = 'Confirmar', cancelText = 'Cancelar', confirmClass = 'btn-danger', onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="modal-overlay modal-show" onClick={onCancel}>
      <div className="modal-container confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">{typeof icon === 'string' && icon.length > 2 ? <Icon name={icon} size="2rem" /> : icon}</div>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
