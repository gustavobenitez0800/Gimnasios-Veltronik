// ============================================
// VELTRONIK - REGISTRY DE VERTICALES (fuente única)
// ============================================
// Antes el concepto de "vertical" vivía repartido y DESINCRONIZADO en varios
// lugares (config.js ORG_TYPES, los arrays NAV del Sidebar, los tokens de
// variables.css, los overrides de layout.css, y los mapas TYPE_* del Lobby).
// De esa fragmentación salió el bug "kiosk" vs "kiosco" (el tema no aplicaba) y
// la obligación de tocar 7 archivos para cambiar un rubro.
//
// Este módulo es la ÚNICA fuente de verdad de los METADATOS del vertical en el
// frontend. El `id` matchea con BusinessType del backend (= `org.type`).
//
// Nota de capas:
//   - La PALETA COMPLETA (primary-50..900, radios, fuente) sigue en
//     variables.css → [data-vertical="<id en minúscula>"]. Eso es el SSOT del
//     ESTILO (cascada CSS).
//   - `accent` acá es el MISMO color para usos en JS donde no hay un
//     data-vertical activo (p. ej. el Lobby dibuja varios verticales a la vez).
//   - La Etapa 3 (manifiesto servido por el backend) colapsa ambos: el backend
//     manda los tokens y `themeManager` los inyecta. Hasta entonces, mantener el
//     `accent` en sync con el primary-500 del bloque CSS correspondiente.

import gymLogoSrc from '../assets/VeltronikGym.png';
import CONFIG from './config';

// Cada entrada: { id, label, icon, accent, membersLabel }
//   - label: nombre visible (badge del Lobby, subtítulo del Sidebar).
//   - icon: descriptor renderizable por el consumidor (sin JSX acá, dato puro).
//   - accent: primary-500 del vertical (debe coincidir con variables.css).
//   - membersLabel: cómo se llama al "socio" en ese rubro (Socios/Alumnos/Clientes).
export const VERTICALS = {
  GYM:      { id: 'GYM',      label: 'Gimnasio',         icon: { type: 'image', src: gymLogoSrc }, accent: '#3b82f6', membersLabel: 'Socios' },
  CLUB:     { id: 'CLUB',     label: 'Club Deportivo',   icon: { type: 'icon', name: 'dumbbell' },       accent: '#6366f1', membersLabel: 'Socios' },
  PILATES:  { id: 'PILATES',  label: 'Pilates & Yoga',   icon: { type: 'icon', name: 'dumbbell' },       accent: '#14b8a6', membersLabel: 'Alumnos' },
  ACADEMY:  { id: 'ACADEMY',  label: 'Academia',         icon: { type: 'icon', name: 'graduationCap' },  accent: '#8b5cf6', membersLabel: 'Alumnos' },
  FUTBOL_5: { id: 'FUTBOL_5', label: 'Fútbol 5',         icon: { type: 'icon', name: 'futbol' },         accent: '#22c55e', membersLabel: 'Clientes' },
  KIOSCO:   { id: 'KIOSCO',   label: 'Kiosco / Almacén', icon: { type: 'icon', name: 'store' },          accent: '#14b8a6', membersLabel: 'Clientes' },
  SALON:    { id: 'SALON',    label: 'Belleza',          icon: { type: 'icon', name: 'scissors' },       accent: '#f43f5e', membersLabel: 'Clientes' },
  RESTO:    { id: 'RESTO',    label: 'Restaurante',      icon: { type: 'icon', name: 'utensils' },       accent: '#f97316', membersLabel: 'Clientes' },
  OTHER:    { id: 'OTHER',    label: 'Negocio',          icon: { type: 'icon', name: 'building' },        accent: '#64748b', membersLabel: 'Clientes' },
};

export const DEFAULT_VERTICAL = VERTICALS.GYM;

// Etiquetas de rol — estaban duplicadas tal cual en Sidebar y en Lobby.
export const ROLE_LABELS = {
  owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción', member: 'Miembro',
};

/** Devuelve el vertical para un org.type del backend. Desconocido → OTHER (nunca rompe). */
export function getVertical(orgType) {
  if (!orgType) return DEFAULT_VERTICAL;
  return VERTICALS[String(orgType).toUpperCase()] || VERTICALS.OTHER;
}

/** Valor del atributo data-vertical (id en minúscula) que consume el theming CSS. */
export function verticalThemeKey(orgType) {
  return getVertical(orgType).id.toLowerCase();
}

/** Etiqueta legible del rol; cae al propio valor si llega uno inesperado. */
export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

// ─── Navegación por vertical ───
// Antes vivía como arrays sueltos + un switch en Sidebar.jsx. Acá es parte del
// registry (fuente única). El filtrado por ROL se mantiene en el Sidebar: es
// política y la etapa 3 la mueve al backend. Los items referencian CONFIG.ROUTES.

const gymNav = (membersLabel) => [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard', module: 'dashboard' },
      { to: CONFIG.ROUTES.MEMBERS, icon: 'users', label: membersLabel, module: 'members' },
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
      { to: CONFIG.ROUTES.LOBBY, icon: 'switchSystem', label: 'Cambiar Sistema', module: 'lobby' },
    ],
  },
];

const FUTBOL_NAV = [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.DASHBOARD, icon: 'dashboard', label: 'Dashboard', module: 'dashboard' },
      { to: CONFIG.ROUTES.COURT_GRID, icon: 'grid', label: 'Grilla', module: 'courtGrid' },
      { to: CONFIG.ROUTES.COURT_FIXED, icon: 'calendar', label: 'Turnos Fijos', module: 'courtFixed' },
      { to: CONFIG.ROUTES.COURT_CUSTOMERS, icon: 'users', label: 'Clientes', module: 'courtCustomers' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: CONFIG.ROUTES.REPORTS, icon: 'chart', label: 'Reportes', module: 'reports' },
      { to: CONFIG.ROUTES.COURTS, icon: 'futbol', label: 'Canchas', module: 'courts' },
      { to: CONFIG.ROUTES.TEAM, icon: 'userCog', label: 'Equipo', module: 'team' },
      { to: CONFIG.ROUTES.SETTINGS, icon: 'settings', label: 'Ajustes', module: 'settings' },
    ],
  },
  {
    title: 'Plataforma',
    items: [
      { to: CONFIG.ROUTES.LOBBY, icon: 'switchSystem', label: 'Cambiar Sistema', module: 'lobby' },
    ],
  },
];

const KIOSCO_NAV = [
  {
    title: 'Principal',
    items: [
      { to: CONFIG.ROUTES.KIOSK_DASHBOARD, icon: 'dashboard', label: 'Dashboard', module: 'dashboard' },
      { to: CONFIG.ROUTES.POS, icon: 'wallet', label: 'Punto de Venta', module: 'pos' },
      { to: CONFIG.ROUTES.KIOSK_PRODUCTS, icon: 'package', label: 'Productos', module: 'products' },
      { to: CONFIG.ROUTES.KIOSK_INVENTORY, icon: 'list', label: 'Inventario', module: 'inventory' },
      { to: CONFIG.ROUTES.KIOSK_CUSTOMERS, icon: 'users', label: 'Clientes / Fiado', module: 'customers' },
      { to: CONFIG.ROUTES.KIOSK_SUPPLIERS, icon: 'store', label: 'Proveedores', module: 'suppliers' },
      { to: CONFIG.ROUTES.KIOSK_CASH, icon: 'dollarSign', label: 'Caja', module: 'cash' },
      { to: CONFIG.ROUTES.KIOSK_REPORTS, icon: 'chart', label: 'Reportes', module: 'reports' },
      { to: CONFIG.ROUTES.KIOSK_FISCAL, icon: 'fileText', label: 'Facturación', module: 'fiscal' },
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
      { to: CONFIG.ROUTES.LOBBY, icon: 'switchSystem', label: 'Cambiar Sistema', module: 'lobby' },
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

const NAV_BY_ID = {
  FUTBOL_5: FUTBOL_NAV,
  KIOSCO: KIOSCO_NAV,
  RESTO: RESTO_NAV,
  SALON: SALON_NAV,
};

// Verticales de la familia "fitness": comparten el módulo gym, su navegación y sus
// rutas exclusivas (socios, pagos, clases, acceso, retención). Lo consume el
// OrgTypeGuard en App.jsx (antes era un array a mano que podía driftear).
export const FITNESS_VERTICALS = ['GYM', 'PILATES', 'CLUB', 'ACADEMY'];

/** Secciones de navegación del vertical, SIN filtrar por rol (eso lo hace el Sidebar). */
export function getVerticalNav(orgType) {
  const v = getVertical(orgType);
  return NAV_BY_ID[v.id] || gymNav(v.membersLabel);
}
