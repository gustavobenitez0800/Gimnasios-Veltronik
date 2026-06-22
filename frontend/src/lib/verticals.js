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
