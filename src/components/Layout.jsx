// ============================================
// VELTRONIK - LAYOUT COMPONENTS
// ============================================

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Icon from './Icon';
import { useAuth } from '../contexts/AuthContext';

/**
 * Main app layout with sidebar (for dashboard pages)
 */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading } = useAuth();

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
