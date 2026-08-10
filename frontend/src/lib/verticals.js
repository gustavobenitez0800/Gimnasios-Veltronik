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
//   - FUTURO (manifiesto servido por el backend): el backend mandaría los tokens
//     y el frontend los inyectaría en runtime. Hasta entonces, mantener el
//     `accent` en sync con el primary-500 del bloque CSS correspondiente.

import gymLogoSrc from '../assets/VeltronikGym.png';
import CONFIG from './config';

// Cada entrada: { id, label, icon, accent, membersLabel, memberLabel, placeLabel }
//   - label: nombre visible (badge del Lobby, subtítulo del Sidebar).
//   - icon: descriptor renderizable por el consumidor (sin JSX acá, dato puro).
//   - accent: primary-500 del vertical (debe coincidir con variables.css).
//   - membersLabel / memberLabel: cómo se llama al "socio" en ese rubro, en plural y en
//     singular (Socios/Socio, Alumnos/Alumno, Clientes/Cliente). El singular es un campo
//     propio y no un recorte del plural: no todo rubro futuro va a pluralizar con "-s".
//   - placeLabel: cómo se llama al LOCAL, en minúscula, para meterlo en una frase
//     ("En el gimnasio", "Nadie en el estudio"). Antes vivía copiado a mano en tres
//     páginas —y con la clave equivocada 'KIOSK' en vez de 'KIOSCO', así que un kiosco
//     leía "negocio"—, que es justo el drift que este registry existe para evitar.
// Sin `export`: afuera nadie elige un vertical a mano, se pide con getVertical(orgType)
// —que nunca devuelve undefined—. Exportar el mapa invitaba a `VERTICALS[type]` suelto,
// que es justo la línea que rompía cuando llegaba un tipo inesperado.
const VERTICALS = {
  GYM:      { id: 'GYM',      label: 'Gimnasio',         icon: { type: 'image', src: gymLogoSrc }, accent: '#3b82f6', membersLabel: 'Socios',   memberLabel: 'Socio',   placeLabel: 'gimnasio' },
  CLUB:     { id: 'CLUB',     label: 'Club Deportivo',   icon: { type: 'icon', name: 'dumbbell' },       accent: '#6366f1', membersLabel: 'Socios',   memberLabel: 'Socio',   placeLabel: 'club' },
  PILATES:  { id: 'PILATES',  label: 'Pilates & Yoga',   icon: { type: 'icon', name: 'dumbbell' },       accent: '#14b8a6', membersLabel: 'Alumnos',  memberLabel: 'Alumno',  placeLabel: 'estudio' },
  ACADEMY:  { id: 'ACADEMY',  label: 'Academia',         icon: { type: 'icon', name: 'graduationCap' },  accent: '#8b5cf6', membersLabel: 'Alumnos',  memberLabel: 'Alumno',  placeLabel: 'academia' },
  OTHER:    { id: 'OTHER',    label: 'Negocio',          icon: { type: 'icon', name: 'building' },        accent: '#64748b', membersLabel: 'Clientes', memberLabel: 'Cliente', placeLabel: 'negocio' },
};

const DEFAULT_VERTICAL = VERTICALS.GYM;

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

// Verticales de la familia "fitness": comparten el módulo gym, su navegación y sus
// rutas exclusivas (socios, pagos, clases, acceso, retención). Lo consume el
// OrgTypeGuard en App.jsx (antes era un array a mano que podía driftear).
export const FITNESS_VERTICALS = ['GYM', 'PILATES', 'CLUB', 'ACADEMY'];

/** Secciones de navegación del vertical, SIN filtrar por rol (eso lo hace el Sidebar). */
export function getVerticalNav(orgType) {
  const v = getVertical(orgType);
  return gymNav(v.membersLabel);
}
