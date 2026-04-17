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

  // Subscription Prices by org type (ARS)
  SUBSCRIPTION_PRICE: 35000,
  SUBSCRIPTION_CURRENCY: 'ARS',
  PRICES_BY_TYPE: {
    GYM: 35000,
    RESTO: 45000,
    KIOSK: 25000,
    OTHER: 35000,
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
    // Restaurante
    TABLES: '/tables',
    MENU: '/menu',
    ORDERS: '/orders',
    KITCHEN: '/kitchen',
    CASH_REGISTER: '/cash',
    INVENTORY: '/inventory',
    RESERVATIONS: '/reservations',
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
    RESTO: 'RESTO',
    KIOSK: 'KIOSK',
    OTHER: 'OTHER',
  }),
};

export default CONFIG;
