// ============================================
// VELTRONIK - LAYOUT COMPONENTS
// ============================================

import { useState, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Icon from './Icon';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';

/**
 * Main app layout with sidebar (for dashboard pages)
 * Includes payment warning banner for past_due subscriptions.
 */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading, subscription, gym } = useAuth();
  const navigate = useNavigate();

  // Payment warning banner logic
  const paymentWarning = useMemo(() => {
    if (!subscription) return null;

    if (subscription.status === 'past_due') {
      const graceEnd = subscription.grace_period_ends_at
        ? new Date(subscription.grace_period_ends_at)
        : null;
      const now = new Date();
      const daysLeft = graceEnd
        ? Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)))
        : null;

      return {
        type: 'warning',
        message: daysLeft !== null && daysLeft > 0
          ? `⚠️ Tu pago fue rechazado. Tenés ${daysLeft} día${daysLeft !== 1 ? 's' : ''} para actualizar tu método de pago antes de perder acceso.`
          : '⚠️ Tu pago fue rechazado. Actualizá tu método de pago para mantener el acceso.',
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
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="main-content">
        {/* Mobile header */}
        <header className="mobile-header">
          <button
            className="btn-icon sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
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
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/**
 * Auth layout (login, register, etc.)
 */
export function AuthLayout() {
  return (
    <div className="auth-wrapper">
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
export function ConfirmDialog({ open, title, message, icon = '⚠️', confirmText = 'Confirmar', cancelText = 'Cancelar', confirmClass = 'btn-danger', onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="modal-overlay modal-show" onClick={onCancel}>
      <div className="modal-container confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">{icon}</div>
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
