// ============================================
// GIMNASIO VELTRONIK - CONFIGURACIÓN
// ============================================

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://tztupzgxvaopehcgfmag.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dHVwemd4dmFvcGVoY2dmbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDE1NDcsImV4cCI6MjA4NDE3NzU0N30.Za6ob-V--drgZ8Ggzbn3CKQW9sl3qN8ASbDQDKtOcDM',

    // Backend API URL - Production (Vercel)
    // Set to null to auto-detect based on current host (recommended for dev)
    API_URL: null, // Was: 'https://gimnasio-veltronik.vercel.app',

    // Debug mode (auto-enabled on localhost)
    DEBUG: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',

    // Subscription Price (for display only - real price is in backend)
    SUBSCRIPTION_PRICE: 35000,
    SUBSCRIPTION_CURRENCY: 'ARS',

    // App Configuration
    APP_NAME: 'Gimnasio Veltronik',
    APP_VERSION: '1.0.0',

    // Routes
    ROUTES: {
        LOGIN: 'index.html',
        REGISTER: 'register.html',
        ONBOARDING: 'onboarding.html',
        PLANS: 'plans.html',
        PAYMENT_CALLBACK: 'payment-callback.html',
        BLOCKED: 'blocked.html',
        DASHBOARD: 'dashboard.html',
        MEMBERS: 'members.html',
        PAYMENTS: 'payments.html',
        SETTINGS: 'settings.html'
    },

    // Gym Status (MUST match backend values)
    GYM_STATUS: {
        PENDING: 'pending',
        ACTIVE: 'active',
        BLOCKED: 'blocked'
    },

    // Subscription Status
    SUBSCRIPTION_STATUS: {
        ACTIVE: 'active',
        PAST_DUE: 'past_due',
        CANCELED: 'canceled',
        PENDING: 'pending'
    },

    // User Roles
    ROLES: {
        OWNER: 'owner',
        ADMIN: 'admin',
        STAFF: 'staff',
        RECEPTION: 'reception'
    }
};

// Auto-detect API URL based on current host
(function () {
    if (!CONFIG.API_URL) {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            CONFIG.API_URL = 'http://localhost:3000';
        } else {
            // Production: assume API is at /api on same domain
            CONFIG.API_URL = window.location.origin;
        }
    }
})();

// Freeze the config to prevent modifications
Object.freeze(CONFIG.ROUTES);
Object.freeze(CONFIG.GYM_STATUS);
Object.freeze(CONFIG.SUBSCRIPTION_STATUS);
Object.freeze(CONFIG.ROLES);
