// ============================================
// VELTRONIK PLATFORM - CONFIGURACIÓN v2
// ============================================

// Verificar que las variables de entorno críticas estén configuradas
if (!import.meta.env.VITE_SUPABASE_URL) {
  console.error('[Veltronik] FATAL: VITE_SUPABASE_URL no está definida. Configurar en .env');
}
if (!import.meta.env.VITE_API_BASE_URL) {
  console.error('[Veltronik] FATAL: VITE_API_BASE_URL no está definida. Configurar en .env');
}

const CONFIG = {
  // Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar en .env)
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,

  // Backend Java API URL (VITE_API_BASE_URL debe estar en .env)
  API_URL: import.meta.env.VITE_API_BASE_URL,

  // Debug mode
  DEBUG: import.meta.env.DEV,

  // Subscription Prices by org type (ARS)
  SUBSCRIPTION_PRICE: 80000,
  SUBSCRIPTION_CURRENCY: 'ARS',
  PRICES_BY_TYPE: {
    GYM: 80000,
    CLUB: 80000,
    OTHER: 80000,
  },

  // App Configuration
  APP_NAME: 'Veltronik',
  APP_VERSION: __APP_VERSION__ || '1.0.0',

  // Routes (React Router paths)
  ROUTES: Object.freeze({
    LOGIN: '/',
    REGISTER: '/register',
    ONBOARDING: '/onboarding',
    PLANS: '/plans',
    PAYMENT_CALLBACK: '/payment-callback',
    BLOCKED: '/blocked',
    DASHBOARD: '/dashboard',
    MEMBERS: '/members',
    PAYMENTS: '/payments',
    SETTINGS: '/settings',
    CLASSES: '/classes',
    REPORTS: '/reports',
    ACCESS: '/access',
    RETENTION: '/retention',
    RESET_PASSWORD: '/reset-password',
    LOBBY: '/lobby',
    MEMBER_PORTAL: '/member-portal',
    TEAM: '/team',
  }),

  // Gym Status
  GYM_STATUS: Object.freeze({
    PENDING: 'pending',
    ACTIVE: 'active',
    BLOCKED: 'blocked',
  }),

  // Subscription Status
  SUBSCRIPTION_STATUS: Object.freeze({
    ACTIVE: 'active',
    PAST_DUE: 'past_due',
    CANCELED: 'canceled',
    PENDING: 'pending',
  }),

  // User Roles
  ROLES: Object.freeze({
    OWNER: 'owner',
    ADMIN: 'admin',
    STAFF: 'staff',
    RECEPTION: 'reception',
    MEMBER: 'member',
  }),

  // Organization Types
  ORG_TYPES: Object.freeze({
    GYM: 'GYM',
    CLUB: 'CLUB',
    OTHER: 'OTHER',
  }),
};

export default CONFIG;
