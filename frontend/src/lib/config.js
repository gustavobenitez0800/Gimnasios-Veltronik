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

  // Precio del plan básico (ARS), por sucursal.
  //
  // ⚠️ Esto es solo el RESPALDO de build-time. La fuente de verdad es el backend
  // (veltronik.billing.monthly-price → /public/payment-config), porque es el monto que
  // Mercado Pago cobra de verdad. Para mostrar el precio en pantalla usá el hook
  // `useMonthlyPrice()`, no esta constante: un instalador viejo tiene acá el precio viejo.
  SUBSCRIPTION_PRICE: 45000,
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
    // Relevo del login de escritorio (Fase 1). Solo existe en el portal web: es la URL a
    // la que Supabase devuelve tras el login con Google, y desde ahí el código salta a la
    // app por veltronik://. Ver pages/DesktopAuthPage.jsx.
    DESKTOP_AUTH: '/desktop-auth',
    // Resumen del dueño sobre TODAS sus sucursales. Solo portal web, y no necesita una
    // sucursal seleccionada — justamente habla de todas.
    OWNER_INSIGHTS: '/resumen',
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
