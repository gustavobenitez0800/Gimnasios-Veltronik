// ============================================
// VELTRONIK PLATFORM - SHARED SIDEBAR COMPONENT
// Eliminates duplicated sidebar HTML across 9+ pages
// ============================================

const Sidebar = (() => {
    'use strict';

    // Navigation items configuration
    // This is the SINGLE SOURCE OF TRUTH for all navigation
    const NAV_ITEMS = {
        principal: {
            title: 'Principal',
            items: [
                { href: 'dashboard.html', icon: 'dashboard', label: 'Dashboard' },
                { href: 'members.html', icon: 'users', label: 'Socios' },
                { href: 'payments.html', icon: 'wallet', label: 'Pagos' },
                { href: 'classes.html', icon: 'calendar', label: 'Clases' },
                { href: 'access.html', icon: 'door', label: 'Acceso' },
                { href: 'retention.html', icon: 'shield', label: 'Retención' },
                { href: 'reports.html', icon: 'chart', label: 'Reportes' }
            ]
        },
        admin: {
            title: 'Administración',
            items: [
                { href: 'team.html', icon: 'userCog', label: 'Equipo' },
                { href: 'settings.html', icon: 'settings', label: 'Ajustes' }
            ]
        },
        platform: {
            title: 'Plataforma',
            items: [
                { href: 'platform-lobby.html', icon: 'switchSystem', label: 'Cambiar Sistema', id: 'switchOrgBtn', title: 'Volver al lobby y elegir otro sistema' }
            ]
        }
    };

    /**
     * Get the current page filename
     */
    function getCurrentPage() {
        const path = window.location.pathname;
        return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    }

    /**
     * Generate a nav item HTML
     */
    function renderNavItem(item, currentPage) {
        const isActive = item.href === currentPage ? ' active' : '';
        const idAttr = item.id ? ` id="${item.id}"` : '';
        const titleAttr = item.title ? ` title="${item.title}"` : '';

        return `
            <a href="${item.href}" class="nav-item${isActive}"${idAttr}${titleAttr}>
                <span class="nav-item-icon" data-icon="${item.icon}"></span>
                ${item.label}
            </a>`;
    }

    /**
     * Generate the full sidebar HTML
     */
    function render() {
        const currentPage = getCurrentPage();

        // Build nav sections
        let navSections = '';
        for (const [key, section] of Object.entries(NAV_ITEMS)) {
            const items = section.items.map(item => renderNavItem(item, currentPage)).join('');
            navSections += `
                <div class="nav-section">
                    <div class="nav-section-title">${section.title}</div>
                    ${items}
                </div>`;
        }

        return `
        <div class="sidebar-header">
            <div class="sidebar-logo">
                <img src="assets/VeltronikGym.png" alt="Veltronik" class="sidebar-logo-icon"
                    style="width:32px;height:32px;object-fit:contain;">
                <span class="sidebar-logo-text">Veltronik</span>
            </div>
        </div>

        <nav class="sidebar-nav">
            ${navSections}
        </nav>

        <div class="sidebar-footer">
            <div class="sidebar-user">
                <div class="avatar" id="userAvatar">--</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name" id="userName">Cargando...</div>
                    <div class="sidebar-user-role" id="userRole">--</div>
                </div>
                <button class="sidebar-logout" onclick="handleLogout()" title="Cerrar sesión">
                    <span data-icon="logout"></span>
                </button>
            </div>
        </div>`;
    }

    /**
     * Initialize the sidebar - inject into the page
     */
    function init() {
        const sidebarEl = document.getElementById('sidebar');
        if (!sidebarEl) {
            console.warn('Sidebar: No #sidebar element found');
            return;
        }

        // Inject sidebar HTML
        sidebarEl.innerHTML = render();

        // Re-initialize icons for the sidebar
        sidebarEl.querySelectorAll('[data-icon]').forEach(el => {
            const iconName = el.getAttribute('data-icon');
            const className = el.getAttribute('data-icon-class') || 'icon';
            if (typeof getIcon === 'function') {
                el.innerHTML = getIcon(iconName, className);
            }
        });
    }

    /**
     * Update user info in the sidebar footer
     */
    function updateUserInfo(name, role, avatarInitials) {
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        const avatarEl = document.getElementById('userAvatar');

        if (nameEl) nameEl.textContent = name || 'Usuario';
        if (roleEl) roleEl.textContent = role || '--';
        if (avatarEl) avatarEl.textContent = avatarInitials || (name ? name.slice(0, 2).toUpperCase() : '--');
    }

    // Public API
    return {
        init,
        render,
        updateUserInfo,
        NAV_ITEMS,
        getCurrentPage
    };
})();

// ============================================
// SIDEBAR TOGGLE (shared across all pages)
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('sidebar-open');
    if (overlay) overlay.classList.toggle('overlay-show');
}
