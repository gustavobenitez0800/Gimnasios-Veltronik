// ============================================
// VELTRONIK - SIDEBAR COMPONENT
// ============================================

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getInitials } from '../lib/utils';
import Icon from './Icon';
import CONFIG from '../lib/config';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';

const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard' },
      { to: CONFIG.ROUTES.MEMBERS, icon: 'users', label: 'Socios' },
      { to: CONFIG.ROUTES.PAYMENTS, icon: 'wallet', label: 'Pagos' },
      { to: CONFIG.ROUTES.CLASSES, icon: 'calendar', label: 'Clases' },
      { to: CONFIG.ROUTES.ACCESS, icon: 'door', label: 'Acceso' },
      { to: CONFIG.ROUTES.RETENTION, icon: 'shield', label: 'Retención' },
      { to: CONFIG.ROUTES.REPORTS, icon: 'chart', label: 'Reportes' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: CONFIG.ROUTES.TEAM, icon: 'userCog', label: 'Equipo' },
      { to: CONFIG.ROUTES.SETTINGS, icon: 'settings', label: 'Ajustes' },
    ],
  },
  {
    title: 'Plataforma',
    items: [
      { to: CONFIG.ROUTES.LOBBY, icon: 'switchSystem', label: 'Cambiar Sistema' },
    ],
  },
];

export default function Sidebar({ isOpen, onClose }) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const userName = profile?.full_name || 'Usuario';
  const userRole = localStorage.getItem('current_org_role') || '--';
  const initials = getInitials(userName);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? 'overlay-show' : ''}`}
        onClick={onClose}
      />

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`} id="sidebar">
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
            <span className="sidebar-logo-text">Veltronik</span>
          </div>
          <button
            className="sidebar-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
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
                >
                  <Icon name={item.icon} className="nav-item-icon" />
                  {item.label}
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
