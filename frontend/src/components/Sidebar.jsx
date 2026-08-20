// ============================================
// VELTRONIK - SIDEBAR COMPONENT
// ============================================

import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getInitials } from '../lib/utils';
import { GYM, roleLabel } from '../lib/gym';
import { useWorkspace } from '../hooks/useWorkspace';
import Icon from './Icon';
import CONFIG from '../lib/config';
import logoSrc from '../assets/LogotipoSecundario.png';

// Navegación del sistema. Antes vivía en el registry de verticales, que la generaba
// por rubro; con un solo rubro esa indirección solo escondía la lista. Es estática y
// vive donde se dibuja.
const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard', module: 'dashboard' },
      { to: CONFIG.ROUTES.MEMBERS, icon: 'users', label: GYM.membersLabel, module: 'members' },
      { to: CONFIG.ROUTES.PAYMENTS, icon: 'wallet', label: 'Pagos', module: 'payments' },
      { to: CONFIG.ROUTES.CLASSES, icon: 'calendar', label: 'Clases', module: 'classes' },
      { to: CONFIG.ROUTES.ACCESS, icon: 'door', label: 'Acceso', module: 'access' },
      { to: CONFIG.ROUTES.RETENTION, icon: 'shield', label: 'Retención', module: 'retention' },
      { to: CONFIG.ROUTES.REPORTS, icon: 'chart', label: 'Reportes', module: 'reports' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: CONFIG.ROUTES.TEAM, icon: 'userCog', label: 'Equipo', module: 'team' },
      { to: CONFIG.ROUTES.SETTINGS, icon: 'settings', label: 'Ajustes', module: 'settings' },
    ],
  },
  {
    title: 'Plataforma',
    items: [
      { to: CONFIG.ROUTES.LOBBY, icon: 'switchSystem', label: 'Cambiar Sucursal', module: 'lobby' },
    ],
  },
];

/**
 * Módulos que este ENVASE no puede mostrar, más allá de lo que permita el rol.
 *
 * En el escritorio (Fase 3) el equipo está atado a UNA sucursal: "Cambiar Sucursal" no
 * llevaría a ningún lado — /lobby es la puerta del terminal, no un selector. El backend
 * no puede decidir esto porque no sabe en qué envase corre la sesión; es lo único que el
 * front filtra por su cuenta, y por eso se aplica DESPUÉS de la política del backend en
 * vez de duplicarla.
 */
const MODULOS_FUERA_DE_ESTE_ENVASE = CONFIG.IS_DESKTOP ? ['lobby'] : [];

function porEnvase(secciones) {
  if (MODULOS_FUERA_DE_ESTE_ENVASE.length === 0) return secciones;
  return secciones
    .map(section => ({
      ...section,
      items: section.items.filter(item => !MODULOS_FUERA_DE_ESTE_ENVASE.includes(item.module)),
    }))
    .filter(section => section.items.length > 0);
}

function getNavSections(role, allowedModules) {
  // Preferencia: el backend dicta qué módulos se ven (fuente única de la política).
  // El front SOLO dibuja lo permitido. (Items sin `module` pasan, por las dudas.)
  if (allowedModules) {
    return porEnvase(NAV_SECTIONS
      .map(section => ({
        ...section,
        items: section.items.filter(item => !item.module || allowedModules.includes(item.module)),
      }))
      .filter(section => section.items.length > 0));
  }

  // Fallback (backend sin /workspace todavía): filtrado por rol heredado —
  // espejo de la política del backend (@PreAuthorize):
  // Dashboard/Pagos/Retención/Reportes exponen datos financieros y el backend los
  // restringe a OWNER/ADMIN. Mostrarlos a staff/reception solo producía pantallas
  // rotas con 403 ("el frontend solo dibuja lo que el backend permite").
  if (role === 'reception') {
    // Recepción: el mostrador del gimnasio — check-in/acceso, ajustes y cambiar de sucursal.
    // Espejo exacto de RECEPTION_ALLOWED en WorkspacePolicy (backend).
    const allowedPaths = [
      CONFIG.ROUTES.ACCESS, CONFIG.ROUTES.SETTINGS, CONFIG.ROUTES.LOBBY,
    ];
    return porEnvase(NAV_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => allowedPaths.includes(item.to)),
    })).filter(section => section.items.length > 0));
  }

  if (role === 'staff') {
    // Staff: operación diaria (socios, clases, acceso) sin equipo ni analítica financiera.
    // Espejo exacto de STAFF_BLOCKED en WorkspacePolicy (backend).
    const blockedPaths = [
      CONFIG.ROUTES.TEAM,
      CONFIG.ROUTES.DASHBOARD,
      CONFIG.ROUTES.PAYMENTS,
      CONFIG.ROUTES.RETENTION,
      CONFIG.ROUTES.REPORTS,
    ];
    return porEnvase(NAV_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => !blockedPaths.includes(item.to)),
    })).filter(section => section.items.length > 0));
  }

  return porEnvase(NAV_SECTIONS);
}

export default function Sidebar({ isOpen, onClose }) {
  const { profile, logout, gym, orgRole, orgName } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const userName = profile?.fullName || 'Usuario';
  const userRole = roleLabel(orgRole);
  const initials = getInitials(userName);

  // El backend dicta los módulos visibles (fuente única); si no responde, cae al rol.
  const workspace = useWorkspace(gym?.id);
  const navSections = getNavSections(orgRole, workspace?.modules);

  // Nombre del gimnasio en el que está parado el usuario. El subtítulo de acá antes
  // decía el RUBRO ("Kiosco", "Pilates"), un dato que ya no existe y que además nunca
  // le sirvió a nadie: lo que el dueño de tres sucursales necesita saber de un vistazo
  // es EN CUÁL está.
  const currentGymName = gym?.name || orgName || '';

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
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="sidebar-logo-text">Veltronik</span>
              {currentGymName && (
                <span className="sidebar-logo-sub" title={currentGymName}>{currentGymName}</span>
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
