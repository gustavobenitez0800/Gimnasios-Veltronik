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

const FUTBOL_NAV = [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard' },
      { to: CONFIG.ROUTES.COURT_GRID, icon: 'grid', label: 'Grilla' },
      { to: CONFIG.ROUTES.COURT_FIXED, icon: 'calendar', label: 'Turnos Fijos' },
      { to: CONFIG.ROUTES.COURT_CUSTOMERS, icon: 'users', label: 'Clientes' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: CONFIG.ROUTES.REPORTS, icon: 'chart', label: 'Reportes' },
      { to: CONFIG.ROUTES.COURTS, icon: 'futbol', label: 'Canchas' },
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

const KIOSCO_NAV = [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.POS, icon: 'wallet', label: 'Punto de Venta' },
      { to: CONFIG.ROUTES.KIOSK_PRODUCTS, icon: 'package', label: 'Productos' },
      { to: CONFIG.ROUTES.KIOSK_INVENTORY, icon: 'list', label: 'Inventario' },
      { to: CONFIG.ROUTES.KIOSK_CASH, icon: 'dollarSign', label: 'Caja' },
      { to: CONFIG.ROUTES.KIOSK_FISCAL, icon: 'fileText', label: 'Facturación' },
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

const SALON_NAV = [
  {
    title: 'Salón',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard' },
      { to: CONFIG.ROUTES.SALON_AGENDA, icon: 'calendar', label: 'Agenda' },
      { to: CONFIG.ROUTES.SALON_CLIENTS, icon: 'users', label: 'Clientes' },
      { to: CONFIG.ROUTES.SALON_SERVICES, icon: 'list', label: 'Servicios' },
      { to: CONFIG.ROUTES.SALON_STYLISTS, icon: 'userCog', label: 'Estilistas' },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { to: CONFIG.ROUTES.SALON_CASH, icon: 'wallet', label: 'Caja' },
      { to: CONFIG.ROUTES.SALON_PRODUCTS, icon: 'package', label: 'Productos' },
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

function getNavSections(orgType, role) {
  
  let sections;
  switch (orgType) {
    case 'RESTO': sections = RESTO_NAV; break;
    case 'SALON': sections = SALON_NAV; break;
    case 'FUTBOL_5': sections = FUTBOL_NAV; break;
    case 'KIOSCO': sections = KIOSCO_NAV; break;
    default: sections = getGymNav(orgType);
  }

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
      // Kiosco: catálogo, inventario y facturación son gestión (dueño/admin). El backend los
      // bloquea con @PreAuthorize → el front no dibuja lo que devolvería 403.
      CONFIG.ROUTES.KIOSK_PRODUCTS,
      CONFIG.ROUTES.KIOSK_INVENTORY,
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
  const ROLE_LABELS = { owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción', member: 'Miembro' };
  const userRole = ROLE_LABELS[orgRole] || orgRole;
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
              {currentOrgType !== 'GYM' && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {{ RESTO: 'Restaurante', KIOSCO: 'Kiosco / Almacén', PILATES: 'Pilates & Yoga', CLUB: 'Club Deportivo', ACADEMY: 'Academia', OTHER: 'Negocio', SALON: 'Belleza', FUTBOL_5: 'Fútbol 5' }[currentOrgType] || currentOrgType}
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
