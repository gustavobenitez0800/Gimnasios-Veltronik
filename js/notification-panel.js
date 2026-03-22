// ============================================
// GIMNASIO VELTRONIK - NOTIFICATION PANEL
// Componente de UI para notificaciones
// ============================================

/**
 * Inicializar el panel de notificaciones
 * Agrega el botón de campana y el panel desplegable
 */
function initNotificationPanel() {
    // Crear el HTML del panel
    const panelHTML = `
        <!-- Notification Bell -->
        <div class="notification-bell" id="notificationBell">
            <span class="bell-icon">🔔</span>
            <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
        </div>
        
        <!-- Notification Panel -->
        <div class="notification-panel" id="notificationPanel">
            <div class="notification-panel-header">
                <h4>Notificaciones</h4>
                <button type="button" class="mark-all-read" id="markAllReadBtn">Marcar todas como leídas</button>
            </div>
            <div class="notification-list" id="notificationList">
                <div class="notification-empty">
                    <span>🔔</span>
                    <p>No hay notificaciones</p>
                </div>
            </div>
        </div>
    `;

    // Crear estilos
    const styles = `
        <style id="notification-panel-styles">
            .notification-bell {
                position: relative;
                cursor: pointer;
                padding: 0.5rem;
                border-radius: var(--border-radius-md);
                transition: all 0.2s;
            }
            
            .notification-bell:hover {
                background: rgba(14, 165, 233, 0.1);
            }
            
            .bell-icon {
                font-size: 1.25rem;
            }
            
            .notification-badge {
                position: absolute;
                top: 0;
                right: 0;
                background: var(--error-500);
                color: white;
                font-size: 0.65rem;
                font-weight: 700;
                padding: 0.15rem 0.4rem;
                border-radius: 10px;
                min-width: 16px;
                text-align: center;
            }
            
            /* Bell animation when has notifications */
            .notification-bell.has-notifications .bell-icon {
                animation: bellSwing 1s ease-in-out infinite;
            }
            
            @keyframes bellSwing {
                0%, 100% { transform: rotate(0deg); }
                10% { transform: rotate(15deg); }
                20% { transform: rotate(-10deg); }
                30% { transform: rotate(10deg); }
                40% { transform: rotate(-5deg); }
                50%, 100% { transform: rotate(0deg); }
            }
            
            .notification-panel {
                position: fixed;
                top: 60px;
                right: 1rem;
                width: 360px;
                max-width: calc(100vw - 2rem);
                max-height: 500px;
                background: var(--bg-primary);
                border: 1px solid var(--border-color);
                border-radius: var(--border-radius-lg);
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                z-index: 1000;
                display: none;
                flex-direction: column;
                overflow: hidden;
            }
            
            .notification-panel.open {
                display: flex;
                animation: slideDown 0.2s ease-out;
            }
            
            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .notification-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem;
                border-bottom: 1px solid var(--border-color);
            }
            
            .notification-panel-header h4 {
                margin: 0;
                font-size: var(--font-size-md);
                color: var(--text-primary);
            }
            
            .mark-all-read {
                background: none;
                border: none;
                color: var(--primary-400);
                font-size: var(--font-size-xs);
                cursor: pointer;
                padding: 0.25rem 0.5rem;
                border-radius: var(--border-radius-sm);
                transition: all 0.2s;
            }
            
            .mark-all-read:hover {
                background: rgba(14, 165, 233, 0.1);
            }
            
            .notification-list {
                flex: 1;
                overflow-y: auto;
                max-height: 400px;
            }
            
            .notification-item {
                display: flex;
                gap: 0.75rem;
                padding: 1rem;
                border-bottom: 1px solid var(--border-color);
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .notification-item:hover {
                background: rgba(14, 165, 233, 0.05);
            }
            
            .notification-item.unread {
                background: rgba(14, 165, 233, 0.1);
            }
            
            .notification-item:last-child {
                border-bottom: none;
            }
            
            .notification-icon {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1rem;
                flex-shrink: 0;
            }
            
            .notification-icon.info { background: rgba(14, 165, 233, 0.2); }
            .notification-icon.success { background: rgba(34, 197, 94, 0.2); }
            .notification-icon.warning { background: rgba(245, 158, 11, 0.2); }
            .notification-icon.error { background: rgba(239, 68, 68, 0.2); }
            
            .notification-content {
                flex: 1;
                min-width: 0;
            }
            
            .notification-title {
                font-weight: 600;
                font-size: var(--font-size-sm);
                color: var(--text-primary);
                margin-bottom: 0.25rem;
            }
            
            .notification-message {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .notification-time {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                white-space: nowrap;
            }
            
            .notification-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 3rem 1rem;
                color: var(--text-muted);
            }
            
            .notification-empty span {
                font-size: 2.5rem;
                margin-bottom: 0.5rem;
                opacity: 0.5;
            }
            
            .notification-empty p {
                margin: 0;
                font-size: var(--font-size-sm);
            }
            
            /* Overlay para cerrar */
            .notification-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 999;
                display: none;
            }
            
            .notification-overlay.active {
                display: block;
            }
        </style>
    `;

    // Agregar estilos si no existen
    if (!document.getElementById('notification-panel-styles')) {
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    // Buscar el header-right para insertar la campana
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        // Crear contenedor
        const bellContainer = document.createElement('div');
        bellContainer.innerHTML = panelHTML;

        // Insertar al principio del header-right
        headerRight.insertBefore(bellContainer.firstElementChild, headerRight.firstChild);
        headerRight.insertBefore(bellContainer.firstElementChild, headerRight.firstChild.nextSibling);

        // Agregar overlay
        const overlay = document.createElement('div');
        overlay.className = 'notification-overlay';
        overlay.id = 'notificationOverlay';
        // Remove direct onclick to use delegation below
        document.body.appendChild(overlay);
    }

    // Attach ONE global event listener for all notification interactions (Event Delegation)
    if (!window._veltronikNotificationListenerBound) {
        document.addEventListener('click', (e) => {
            // Click in Mark all Read
            if (e.target.closest('#markAllReadBtn') || e.target.closest('.mark-all-read')) {
                e.preventDefault();
                e.stopPropagation();
                handleMarkAllRead();
                return;
            }
            
            // Click in Notification Bell
            if (e.target.closest('#notificationBell')) {
                e.preventDefault();
                toggleNotificationPanel();
                return;
            }

            // Click in Overlay
            if (e.target.closest('#notificationOverlay')) {
                e.preventDefault();
                closeNotificationPanel();
                return;
            }

            // Click in single notification item
            const item = e.target.closest('.notification-item');
            if (item) {
                const id = item.getAttribute('data-id');
                if (id) {
                    handleNotificationClick(id);
                }
            }
        });
        window._veltronikNotificationListenerBound = true;
    }

    // Escuchar eventos de notificaciones
    document.addEventListener('veltronik:notification', updateNotificationUI);

    // Actualizar UI inicial
    updateNotificationUI();
}

/**
 * Toggle del panel de notificaciones
 */
function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');

    if (panel) {
        panel.classList.toggle('open');
        if (overlay) {
            overlay.classList.toggle('active', panel.classList.contains('open'));
        }
    }
}

/**
 * Cerrar el panel
 */
function closeNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');

    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

/**
 * Actualizar la UI de notificaciones
 */
function updateNotificationUI() {
    if (typeof VeltronikNotifications === 'undefined') return;

    const notifications = VeltronikNotifications.getAll();
    const unreadCount = VeltronikNotifications.getUnread().length;

    // Actualizar badge y animación de campanita
    const badge = document.getElementById('notificationBadge');
    const bell = document.getElementById('notificationBell');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    // Activar/desactivar animación de campanita
    if (bell) {
        if (unreadCount > 0) {
            bell.classList.add('has-notifications');
        } else {
            bell.classList.remove('has-notifications');
        }
    }

    // Actualizar lista
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = `
            <div class="notification-empty">
                <span>🔔</span>
                <p>No hay notificaciones</p>
            </div>
        `;
        return;
    }

    list.innerHTML = notifications.slice(0, 20).map(n => {
        const icon = getNotificationIcon(n.type);
        const time = formatRelativeTime(n.createdAt);

        return `
            <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notification-icon ${n.type}">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${escapeHtml(n.title)}</div>
                    <div class="notification-message">${escapeHtml(n.message)}</div>
                </div>
                <div class="notification-time">${time}</div>
            </div>
        `;
    }).join('');
}

/**
 * Obtener icono según tipo
 */
function getNotificationIcon(type) {
    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        payment: '💰',
        member: '👤',
        system: '⚙️'
    };
    return icons[type] || '🔔';
}

/**
 * Formatear tiempo relativo
 */
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/**
 * Escapar HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Manejar click en notificación
 */
function handleNotificationClick(notificationId) {
    if (typeof VeltronikNotifications !== 'undefined') {
        VeltronikNotifications.markAsRead(notificationId);
        updateNotificationUI();
    }
}

/**
 * Manejar marcar todas como leídas
 */
function handleMarkAllRead() {
    if (typeof VeltronikNotifications !== 'undefined') {
        VeltronikNotifications.markAllAsRead();
    }

    // Forzar limpieza inmediata del badge y animación de campana
    const badge = document.getElementById('notificationBadge');
    const bell = document.getElementById('notificationBell');
    if (badge) {
        badge.textContent = '0';
        badge.style.display = 'none';
    }
    if (bell) {
        bell.classList.remove('has-notifications');
    }

    // Quitar clase unread de todos los items visibles
    const items = document.querySelectorAll('.notification-item.unread');
    items.forEach(item => item.classList.remove('unread'));

    // Actualización completa de la UI
    updateNotificationUI();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Pequeño delay para asegurar que el header ya existe
    setTimeout(initNotificationPanel, 100);
});
