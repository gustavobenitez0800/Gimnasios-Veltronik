// ============================================
// VELTRONIK PLATFORM - CONFIGURACIÓN v2
// ============================================

const DEFAULT_SUPABASE_URL = 'https://tztupzgxvaopehcgfmag.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dHVwemd4dmFvcGVoY2dmbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDE1NDcsImV4cCI6MjA4NDE3NzU0N30.Za6ob-V--drgZ8Ggzbn3CKQW9sl3qN8ASbDQDKtOcDM';

const CONFIG = {
  // Supabase (VITE_* en Vercel / .env local; valores por defecto = despliegue actual sin cambios)
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,

  // Backend API URL
  API_URL: import.meta.env.VITE_API_URL || 'https://gimnasio-veltronik.vercel.app',

  // Debug mode
  DEBUG: import.meta.env.DEV,

  // Subscription Price (for display only)
  SUBSCRIPTION_PRICE: 35000,
  SUBSCRIPTION_CURRENCY: 'ARS',

  // App Configuration
  APP_NAME: 'Veltronik',
  APP_VERSION: '1.0.23',

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

  // Offline Mode
  OFFLINE: Object.freeze({
    ENABLED: true,
    SYNC_INTERVAL: 30000,
    MAX_RETRY_ATTEMPTS: 5,
    CONFLICT_STRATEGY: 'last-write-wins',
    CACHE_DURATION: 86400000,
  }),
};

export default CONFIG;
