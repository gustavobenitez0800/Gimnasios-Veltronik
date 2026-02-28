// ============================================
// VELTRONIK PLATFORM - PERMISSIONS MODULE
// ============================================
// Global role-based access control for all system pages.
// Roles hierarchy: owner > admin > staff > reception > member
//
// Usage:
//   if (Permissions.isOwnerOrAdmin()) { /* show sensitive data */ }
//   Permissions.hideForEmployees('.financial-data');
//   Permissions.restrictPage(['owner', 'admin']); // blocks staff/etc
// ============================================

const Permissions = (function () {

    // ============================================
    // ROLE HIERARCHY & DETECTION
    // ============================================

    /**
     * Get the current user's role from localStorage (set by lobby on org selection)
     */
    function getCurrentRole() {
        return localStorage.getItem('current_org_role') || 'member';
    }

    /**
     * Check if user is owner
     */
    function isOwner() {
        return getCurrentRole() === CONFIG.ROLES.OWNER;
    }

    /**
     * Check if user is admin
     */
    function isAdmin() {
        return getCurrentRole() === CONFIG.ROLES.ADMIN;
    }

    /**
     * Check if user is owner or admin (full access)
     */
    function isOwnerOrAdmin() {
        const role = getCurrentRole();
        return role === CONFIG.ROLES.OWNER || role === CONFIG.ROLES.ADMIN;
    }

    /**
     * Check if user is staff (employee)
     */
    function isStaff() {
        return getCurrentRole() === CONFIG.ROLES.STAFF;
    }

    /**
     * Check if user is reception
     */
    function isReception() {
        return getCurrentRole() === CONFIG.ROLES.RECEPTION;
    }

    /**
     * Check if user is an employee (staff or reception — NOT owner/admin)
     */
    function isEmployee() {
        return !isOwnerOrAdmin();
    }

    /**
     * Check if user has one of the allowed roles
     */
    function hasRole(allowedRoles) {
        const role = getCurrentRole();
        return allowedRoles.includes(role);
    }


    // ============================================
    // PAGE ACCESS CONTROL
    // ============================================

    /**
     * Restrict entire page to specific roles.
     * If user doesn't have the role, redirect to dashboard.
     * Call this at the TOP of DOMContentLoaded on restricted pages.
     * @returns {boolean} true if access granted, false if redirecting
     */
    function restrictPage(allowedRoles) {
        const role = getCurrentRole();
        if (!allowedRoles.includes(role)) {
            console.warn(`[Permissions] Access denied: role "${role}" not in [${allowedRoles}]`);
            if (typeof showToast === 'function') {
                showToast('No tenés permisos para acceder a esta sección', 'error');
            }
            setTimeout(() => {
                window.location.href = CONFIG.ROUTES.DASHBOARD;
            }, 500);
            return false;
        }
        return true;
    }


    // ============================================
    // UI ELEMENT CONTROL
    // ============================================

    /**
     * Hide elements matching a CSS selector for employees.
     * Owner/Admin see everything; employees see nothing.
     */
    function hideForEmployees(selector) {
        if (isOwnerOrAdmin()) return; // Full access

        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.style.display = 'none';
        });
    }

    /**
     * Show elements only for owner/admin.
     * Identical to hideForEmployees but reads more clearly in some contexts.
     */
    function showOnlyForAdmins(selector) {
        hideForEmployees(selector);
    }

    /**
     * Remove sidebar nav items that employees shouldn't see.
     * Must be called after DOM is loaded, before showAppContent().
     */
    function filterSidebar() {
        if (isOwnerOrAdmin()) return; // Full access

        // Pages employees cannot access
        const restrictedPages = [
            'reports.html',     // Financial reports
            'retention.html',   // AI retention analytics  
            'settings.html'     // System configuration
        ];

        document.querySelectorAll('.sidebar-nav a.nav-item').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (restrictedPages.some(page => href.includes(page))) {
                link.style.display = 'none';
            }
        });
    }

    /**
     * Apply all standard permission restrictions for a system page.
     * Call this ONCE in DOMContentLoaded after auth checks pass.
     * It will:
     *   1. Filter sidebar nav
     *   2. Hide elements marked with data-permission="admin"
     *   3. Hide elements with class "admin-only"
     */
    function applyPageRestrictions() {
        // Filter sidebar navigation
        filterSidebar();

        // Auto-hide elements with permission markers
        if (isEmployee()) {
            // data-permission="admin" attribute
            document.querySelectorAll('[data-permission="admin"]').forEach(el => {
                el.style.display = 'none';
            });

            // .admin-only class
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'none';
            });

            // .financial-data class
            document.querySelectorAll('.financial-data').forEach(el => {
                el.style.display = 'none';
            });
        }
    }

    /**
     * Replace sensitive text content with a placeholder for employees.
     * Useful for inline values that can't be hidden entirely.
     */
    function maskForEmployees(elementId, placeholder = '***') {
        if (isOwnerOrAdmin()) return;

        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = placeholder;
            el.title = 'Información restringida';
        }
    }

    /**
     * Conditionally execute code based on role.
     * Cleaner than if/else blocks scattered everywhere.
     * 
     * Usage:
     *   Permissions.ifAdmin(() => { loadFinancialData(); });
     *   Permissions.ifAdmin(
     *     () => { loadAllData(); },        // admin callback
     *     () => { loadBasicData(); }        // employee callback  
     *   );
     */
    function ifAdmin(adminCallback, employeeCallback) {
        if (isOwnerOrAdmin()) {
            if (typeof adminCallback === 'function') adminCallback();
        } else {
            if (typeof employeeCallback === 'function') employeeCallback();
        }
    }


    // ============================================
    // PUBLIC API
    // ============================================

    return {
        // Role checks
        getCurrentRole,
        isOwner,
        isAdmin,
        isOwnerOrAdmin,
        isStaff,
        isReception,
        isEmployee,
        hasRole,

        // Page access
        restrictPage,

        // UI control
        hideForEmployees,
        showOnlyForAdmins,
        filterSidebar,
        applyPageRestrictions,
        maskForEmployees,
        ifAdmin
    };

})();
