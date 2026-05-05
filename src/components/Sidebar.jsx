// ============================================
// VELTRONIK - SIDEBAR COMPONENT (Multi-vertical)
// ============================================

import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getInitials } from '../lib/utils';
import Icon from './Icon';
import CONFIG from '../lib/config';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';

// ─── Navigation sections by organization type ───

const getGymNav = (orgType) => {
  const membersLabel = (orgType === 'PILATES' || orgType === 'ACADEMY') ? 'Alumnos' : 'Socios';
  
  return [
    {
      title: 'Principal',
      items: [
        { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard' },
        { to: CONFIG.ROUTES.MEMBERS, icon: 'users', label: membersLabel },
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
};

const RESTO_NAV = [
  {
    title: 'Restaurante',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard' },
      { to: CONFIG.ROUTES.TABLES, icon: 'grid', label: 'Mesas' },
      { to: CONFIG.ROUTES.MENU, icon: 'list', label: 'Menú' },
      { to: CONFIG.ROUTES.ORDERS, icon: 'clipboard', label: 'Pedidos' },
      { to: CONFIG.ROUTES.KITCHEN, icon: 'fire', label: 'Cocina' },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { to: CONFIG.ROUTES.CASH_REGISTER, icon: 'wallet', label: 'Caja' },
      { to: CONFIG.ROUTES.INVENTORY, icon: 'package', label: 'Inventario' },
      { to: CONFIG.ROUTES.RESERVATIONS, icon: 'calendar', label: 'Reservas' },
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

function getNavSections() {
  const orgType = localStorage.getItem('current_org_type') || 'GYM';
  const role = localStorage.getItem('current_org_role') || 'owner';
  
  let sections;
  switch (orgType) {
    case 'RESTO': sections = RESTO_NAV; break;
    default: sections = getGymNav(orgType);
  }

  // Role-based filtering
  if (role === 'reception') {
    // Reception: only Dashboard, Access, and platform nav
    const allowedPaths = [CONFIG.ROUTES.DASHBOARD, CONFIG.ROUTES.ACCESS, CONFIG.ROUTES.LOBBY, CONFIG.ROUTES.SETTINGS];
    return sections.map(section => ({
      ...section,
      items: section.items.filter(item => allowedPaths.includes(item.to)),
    })).filter(section => section.items.length > 0);
  }

  if (role === 'staff') {
    // Staff: everything except Team management
    const blockedPaths = [CONFIG.ROUTES.TEAM];
    return sections.map(section => ({
      ...section,
      items: section.items.filter(item => !blockedPaths.includes(item.to)),
    })).filter(section => section.items.length > 0);
  }

  return sections;
}

export default function Sidebar({ isOpen, onClose }) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const userName = profile?.full_name || 'Usuario';
  const rawRole = localStorage.getItem('current_org_role') || '--';
  const ROLE_LABELS = { owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción', member: 'Miembro' };
  const userRole = ROLE_LABELS[rawRole] || rawRole;
  const initials = getInitials(userName);

  const orgType = localStorage.getItem('current_org_type') || 'GYM';
  const orgName = localStorage.getItem('current_org_name') || 'Veltronik';
  const navSections = getNavSections();

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
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="sidebar-logo-text">Veltronik</span>
              {orgType !== 'GYM' && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {{ RESTO: 'Restaurante', KIOSK: 'Kiosco', PILATES: 'Pilates & Yoga', CLUB: 'Club Deportivo', ACADEMY: 'Academia', OTHER: 'Negocio' }[orgType] || orgType}
                </span>
              )}
            </div>
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
