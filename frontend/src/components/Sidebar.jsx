// ============================================
// VELTRONIK - SIDEBAR COMPONENT (Multi-vertical)
// ============================================

import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getInitials } from '../lib/utils';
import { getVertical, roleLabel, getVerticalNav } from '../lib/verticals';
import Icon from './Icon';
import CONFIG from '../lib/config';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';

// Las secciones de navegación por vertical viven en el registry (lib/verticals.js).

function getNavSections(orgType, role) {
  // Sale del registry (fuente única); acá solo se filtra por ROL.
  let sections = getVerticalNav(orgType);

  // Role-based filtering — espejo de la política del backend (@PreAuthorize):
  // Dashboard/Pagos/Retención/Reportes exponen datos financieros y el backend los
  // restringe a OWNER/ADMIN. Mostrarlos a staff/reception solo producía pantallas
  // rotas con 403 ("el frontend solo dibuja lo que el backend permite").
  if (role === 'reception') {
    // Recepción: check-in/acceso y ajustes (solo lectura para su rol).
    // En canchas, la grilla y los clientes SON el mostrador → permitidos.
    const allowedPaths = [
      CONFIG.ROUTES.ACCESS, CONFIG.ROUTES.SETTINGS, CONFIG.ROUTES.LOBBY,
      CONFIG.ROUTES.COURT_GRID, CONFIG.ROUTES.COURT_CUSTOMERS,
      // Kiosco: el mostrador (POS) y la caja SON la tarea de recepción/cajero.
      CONFIG.ROUTES.POS, CONFIG.ROUTES.KIOSK_CASH,
    ];
    return sections.map(section => ({
      ...section,
      items: section.items.filter(item => allowedPaths.includes(item.to)),
    })).filter(section => section.items.length > 0);
  }

  if (role === 'staff') {
    // Staff: operación diaria (socios, clases, acceso) sin equipo ni analítica financiera.
    const blockedPaths = [
      CONFIG.ROUTES.TEAM,
      CONFIG.ROUTES.DASHBOARD,
      CONFIG.ROUTES.PAYMENTS,
      CONFIG.ROUTES.RETENTION,
      CONFIG.ROUTES.REPORTS,
      // Kiosco: catálogo, inventario, facturación y la analítica (dashboard/reportes) son gestión
      // (dueño/admin). El backend los bloquea con @PreAuthorize → el front no dibuja lo que daría 403.
      CONFIG.ROUTES.KIOSK_DASHBOARD,
      CONFIG.ROUTES.KIOSK_REPORTS,
      CONFIG.ROUTES.KIOSK_PRODUCTS,
      CONFIG.ROUTES.KIOSK_INVENTORY,
      CONFIG.ROUTES.KIOSK_SUPPLIERS,
      CONFIG.ROUTES.KIOSK_FISCAL,
    ];
    return sections.map(section => ({
      ...section,
      items: section.items.filter(item => !blockedPaths.includes(item.to)),
    })).filter(section => section.items.length > 0);
  }

  return sections;
}

export default function Sidebar({ isOpen, onClose }) {
  const { profile, logout, gym, orgRole } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const userName = profile?.fullName || 'Usuario';
  const userRole = roleLabel(orgRole);
  const initials = getInitials(userName);

  const currentOrgType = gym?.type || localStorage.getItem('current_org_type') || 'GYM';
  const navSections = getNavSections(currentOrgType, orgRole);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? 'overlay-show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}
        id="sidebar"
        aria-label="Navegación principal"
      >
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img
              src={logoSrc}
              alt="Veltronik"
              className="sidebar-logo-icon"
              style={{ width: 32, height: 32, objectFit: 'contain' }}
              loading="lazy"
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="sidebar-logo-text">Veltronik</span>
              {currentOrgType !== 'GYM' && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {getVertical(currentOrgType).label}
                </span>
              )}
            </div>
          </div>
          <div className="sidebar-header-actions">
            <button
              className="sidebar-theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            {/* Cerrar el drawer: visible solo en mobile (CSS). En desktop el sidebar es fijo. */}
            <button
              className="sidebar-close"
              onClick={onClose}
              aria-label="Cerrar menú"
              title="Cerrar menú"
            >
              <Icon name="x" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                  onClick={onClose}
                  title={item.label}
                >
                  <Icon name={item.icon} className="nav-item-icon" />
                  {/* span con clase: permite ocultar el texto en el riel compacto de tablet */}
                  <span className="nav-item-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer - User */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">{userRole}</div>
            </div>
            <button
              className="sidebar-logout"
              onClick={handleLogout}
              title="Cerrar sesión"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
