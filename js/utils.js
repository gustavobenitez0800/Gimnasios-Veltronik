// ============================================
// GIMNASIO VELTRONIK - UTILITY FUNCTIONS
// ============================================
// Common functions shared across multiple pages

/**
 * Toggle sidebar visibility (mobile)
 */
function toggleSidebar() {
    // Try by ID first (used in most pages), then by class
    const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');

    if (sidebar) {
        sidebar.classList.toggle('open');
        sidebar.classList.toggle('show');
    }
    if (overlay) {
        overlay.classList.toggle('show');
    }
}

/**
 * Close sidebar when clicking overlay
 */
function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (sidebar) {
        sidebar.classList.remove('show');
    }
    if (overlay) {
        overlay.classList.remove('show');
    }
}

/**
 * Show the main app content after loading
 */
function showAppContent() {
    const loadingScreen = document.getElementById('loadingScreen');
    const appContent = document.getElementById('appContent');

    if (loadingScreen) {
        loadingScreen.classList.add('hide');
    }
    if (appContent) {
        appContent.style.display = '';
    }
}

/**
 * Hide the main app content and show loading
 */
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const appContent = document.getElementById('appContent');

    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }
    if (appContent) {
        appContent.style.display = 'none';
    }
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} - The escaped text
 */
function escapeHtml(text) {
    if (text === null || text === undefined) {
        return '';
    }

    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Get initials from a full name
 * @param {string} name - The full name
 * @returns {string} - The initials (max 2 characters)
 */
function getInitials(name) {
    if (!name) return '??';

    const parts = name.trim().split(' ').filter(p => p);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format currency for display
 * @param {number} amount - The amount to format
 * @param {string} currency - Currency code (default: ARS)
 * @returns {string} - Formatted currency string
 */
function formatCurrency(amount, currency = 'ARS') {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Format date for display
 * @param {string|Date} date - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
function formatDate(date, options = {}) {
    if (!date) return '-';

    const defaultOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };

    // Fix timezone shift for YYYY-MM-DD strings
    let dateObj;
    if (typeof date === 'string' && date.includes('-') && !date.includes('T')) {
        // Parse as local date to avoid UTC conversion issues
        const [year, month, day] = date.split('-').map(Number);
        dateObj = new Date(year, month - 1, day);
    } else {
        dateObj = new Date(date);
    }

    return new Intl.DateTimeFormat('es-AR', { ...defaultOptions, ...options })
        .format(dateObj);
}

/**
 * Format time for display
 * @param {string} time - The time string (HH:MM or HH:MM:SS)
 * @returns {string} - Formatted time string
 */
function formatTime(time) {
    if (!time) return '-';

    const parts = time.split(':');
    if (parts.length < 2) return time;

    return `${parts[0]}:${parts[1]}`;
}

/**
 * Get relative time (e.g., "hace 5 minutos")
 * @param {string|Date} date - The date to compare
 * @returns {string} - Relative time string
 */
function getRelativeTime(date) {
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
 * Debounce function to limit execution frequency
 * @param {Function} func - The function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
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
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} - Success state
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
}

/**
 * Safely parse JSON with fallback
 * @param {string} jsonString - The JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} - Parsed object or fallback
 */
function safeJsonParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return fallback;
    }
}

/**
 * Check if a date is today
 * @param {string|Date} date - The date to check
 * @returns {boolean}
 */
function isToday(date) {
    const today = new Date();
    const checkDate = new Date(date);
    return today.toDateString() === checkDate.toDateString();
}

/**
 * Get day name in Spanish
 * @param {number} dayIndex - Day index (0-6, 0 = Sunday)
 * @returns {string}
 */
function getDayName(dayIndex) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayIndex] || '';
}

/**
 * Generate a random color for UI elements
 * @returns {string} - HSL color string
 */
function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 65%, 50%)`;
}

/**
 * Get status badge HTML for members
 * @param {string} status - Member status (active, inactive, expired, suspended)
 * @returns {string} - HTML badge
 */
function getStatusBadge(status) {
    const badges = {
        active: '<span class="badge badge-success">Activo</span>',
        inactive: '<span class="badge badge-neutral">Inactivo</span>',
        expired: '<span class="badge badge-error">Vencido</span>',
        suspended: '<span class="badge badge-warning">Suspendido</span>'
    };
    return badges[status] || badges.inactive;
}

/**
 * Get payment method label
 * @param {string} method - Payment method code
 * @returns {string} - Localized label
 */
function getMethodLabel(method) {
    const methods = {
        cash: 'Efectivo',
        card: 'Tarjeta',
        transfer: 'Transferencia',
        mercadopago: 'Mercado Pago',
        other: 'Otro'
    };
    return methods[method] || method;
}

// Initialize sidebar overlay listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }
});

/**
 * Conditional logging - only logs in DEBUG mode (localhost)
 * @param {...any} args - Arguments to log
 */
function log(...args) {
    if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG) {
        console.log(...args);
    }
}

/**
 * Conditional warning - only logs in DEBUG mode
 * @param {...any} args - Arguments to log
 */
function logWarn(...args) {
    if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG) {
        console.warn(...args);
    }
}
