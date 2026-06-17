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
if (!import.meta.env.VITE_MP_PUBLIC_KEY) {
  console.warn('[Veltronik] VITE_MP_PUBLIC_KEY no está definida — el cobro con tarjeta (Brick) no funcionará hasta configurarla en .env / GitHub Secrets. El link de MP sigue como respaldo.');
}

const CONFIG = {
  // Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar en .env)
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,

  // Backend Java API URL (VITE_API_BASE_URL debe estar en .env)
  API_URL: import.meta.env.VITE_API_BASE_URL,

  // Mercado Pago public key — para el Card Payment Brick. Es PÚBLICA (segura de embeber).
  MP_PUBLIC_KEY: import.meta.env.VITE_MP_PUBLIC_KEY,

  // Debug mode
  DEBUG: import.meta.env.DEV,

  // Subscription Prices by org type (ARS)
  SUBSCRIPTION_PRICE: 80000,
  SUBSCRIPTION_CURRENCY: 'ARS',
  PRICES_BY_TYPE: {
    GYM: 80000,
    CLUB: 80000,
    FUTBOL_5: 80000,
    KIOSCO: 80000,
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
    // ─── Vertical Canchas (FUTBOL_5) ───
    COURT_GRID: '/court-grid',
    COURTS: '/courts',
    COURT_CUSTOMERS: '/court-customers',
    COURT_FIXED: '/court-fixed',
    // ─── Vertical Kiosco (KIOSCO) ───
    POS: '/pos',
    KIOSK_PRODUCTS: '/kiosk-products',
    KIOSK_INVENTORY: '/kiosk-inventory',
    KIOSK_CASH: '/kiosk-cash',
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
    FUTBOL_5: 'FUTBOL_5',
    KIOSCO: 'KIOSCO',
    OTHER: 'OTHER',
  }),
};

export default CONFIG;
