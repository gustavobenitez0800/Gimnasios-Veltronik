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

  // El PORTAL: la web donde viven la cuenta y el cobro (login, registro, alta de
  // gimnasio, planes, checkout, cambio de tarjeta). Desde la Fase 4 la app de escritorio
  // NO trae esas pantallas: manda al navegador del sistema acá. También lo usa
  // AuthService para los retornos de OAuth y de "recuperar contraseña", que bajo
  // file:// no tienen a dónde volver.
  // ⚠️ Si cambia el dominio, hay que tocarlo TAMBIÉN en electron/portal.cjs (la lista
  // blanca del proceso principal, que es la que autoriza abrir el navegador).
  PUBLIC_WEB_URL: import.meta.env.VITE_PUBLIC_WEB_URL || 'https://veltronik-v2.vercel.app',

  // ¿Este bundle es el de la app de escritorio? Lo inyecta el build (vite.desktop.config.js),
  // no el runtime. NO es lo mismo que "¿corre dentro de Electron?" (window.electronAPI):
  // el bundle web abierto en Electron sigue siendo el bundle web.
  IS_DESKTOP: typeof __IS_DESKTOP__ !== 'undefined' && __IS_DESKTOP__,

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
