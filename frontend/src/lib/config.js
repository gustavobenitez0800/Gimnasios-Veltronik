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

  // URL web pública del frontend (para armar el link de reservas online que el dueño comparte).
  // En el build web se usa el propio origin; este fallback sirve cuando se mira desde Electron.
  PUBLIC_WEB_URL: import.meta.env.VITE_PUBLIC_WEB_URL || 'https://veltronik-v2.vercel.app',

  // Debug mode
  DEBUG: import.meta.env.DEV,

  // Precio de la suscripción (ARS). Tarifa plana por sucursal: un solo producto,
  // un solo precio. (Antes había además un PRICES_BY_TYPE con un precio por rubro;
  // los tres valores eran 80000 y el rubro ya no existe.)
  SUBSCRIPTION_PRICE: 80000,
  SUBSCRIPTION_CURRENCY: 'ARS',

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
    MISSION_CONTROL: '/mission-control',
    CLASSES: '/classes',
    REPORTS: '/reports',
    ACCESS: '/access',
    RETENTION: '/retention',
    RESET_PASSWORD: '/reset-password',
    LOBBY: '/lobby',
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
};

export default CONFIG;
