// ============================================
// VELTRONIK - UTILITY FUNCTIONS v2
// ============================================

import CONFIG from './config';

/**
 * Conditional logging
 */
export function log(...args) {
  if (CONFIG.DEBUG) console.log(...args);
}

export function logWarn(...args) {
  if (CONFIG.DEBUG) console.warn(...args);
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Get initials from a full name
 */
export function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(' ').filter((p) => p);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format currency for display
 */
export function formatCurrency(amount, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date, options = {}) {
  if (!date) return '-';

  const defaultOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };

  let dateObj;
  if (typeof date === 'string' && date.includes('-') && !date.includes('T')) {
    const [year, month, day] = date.split('-').map(Number);
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = new Date(date);
  }

  return new Intl.DateTimeFormat('es-AR', { ...defaultOptions, ...options }).format(dateObj);
}

/**
 * Format time for display
 */
export function formatTime(time) {
  if (!time) return '-';
  const parts = time.split(':');
  if (parts.length < 2) return time;
  return `${parts[0]}:${parts[1]}`;
}

/**
 * Get relative time (e.g., "hace 5 minutos")
 */
export function getRelativeTime(date) {
  if (!date) return '';

  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays} días`;

  return formatDate(date);
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely parse JSON
 */
export function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Check if a date is today
 */
export function isToday(date) {
  const today = new Date();
  const checkDate = new Date(date);
  return today.toDateString() === checkDate.toDateString();
}

/**
 * Get day name in Spanish
 */
export function getDayName(dayIndex) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex] || '';
}

/**
 * Get status badge class
 */
export function getStatusBadgeClass(status) {
  const map = {
    active: 'badge-success',
    inactive: 'badge-neutral',
    expired: 'badge-error',
    suspended: 'badge-warning',
  };
  return map[status] || 'badge-neutral';
}

/**
 * Get status label in Spanish
 */
export function getStatusLabel(status) {
  const map = {
    active: 'Activo',
    inactive: 'Inactivo',
    expired: 'Vencido',
    suspended: 'Suspendido',
  };
  return map[status] || 'Inactivo';
}

/**
 * Get payment method label
 */
export function getMethodLabel(method) {
  const methods = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    mercadopago: 'Mercado Pago',
    other: 'Otro',
  };
  return methods[method] || method;
}
