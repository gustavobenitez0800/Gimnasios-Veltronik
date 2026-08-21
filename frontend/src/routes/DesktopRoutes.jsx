// ============================================
// VELTRONIK - RUTAS DE LA APP DE ESCRITORIO (Fase 4)
// ============================================
// Solo la operación diaria del gimnasio. Lo que NO está acá tampoco está en el
// instalador: no se importa, no se empaqueta. Quedaron afuera, a propósito:
//
//   RegisterPage · OnboardingPage · PlansPage · BlockedPage · PaymentCallbackPage
//   MissionControlPage  (y con ellas CardCheckout y el SDK de Mercado Pago)
//
// POR QUÉ SE CONSERVAN LOS NOMBRES DE RUTA `/plans` y `/blocked`
// El backend contesta 402 cuando la sucursal está impaga; el interceptor de apiClient
// emite 'auth-payment-required' y AuthContext hace navigate('/blocked'). LobbyPage, por
// su lado, manda a '/plans' al tocar "Reactivar". Si acá renombráramos esas rutas
// habría que tocar AuthContext, apiClient y NO_ORG_ROUTES — o sea, meter mano en la
// lógica de sesión para un cambio de empaquetado.
//
// Manteniendo los mismos nombres y cambiando SOLO el componente, toda esa maquinaria
// sigue funcionando igual y aterriza en el muro en vez del checkout. Diff chico,
// riesgo chico.
// ============================================

import { Routes, Route } from 'react-router-dom';
import CONFIG from '../lib/config';
import { AppLayout, AuthLayout } from '../components/Layout';

import LoginPage from '../pages/LoginPage';
import DeviceGate from '../pages/DeviceGate';
import DashboardPage from '../pages/DashboardPage';
import MembersPage from '../pages/MembersPage';
import PaymentsPage from '../pages/PaymentsPage';
import ClassesPage from '../pages/ClassesPage';
import AccessPage from '../pages/AccessPage';
import RetentionPage from '../pages/RetentionPage';
import ReportsPage from '../pages/ReportsPage';
import TeamPage from '../pages/TeamPage';
import SettingsPage from '../pages/SettingsPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import BillingWall from '../pages/BillingWall';
import SubscriptionActionsDesktop from '../components/billing/SubscriptionActionsDesktop';
import DeepLinkAuthBridge from '../components/DeepLinkAuthBridge';
import ShiftGate from '../components/ShiftGate';

export default function DesktopRoutes() {
  return (
    <>
    {/* Escucha los veltronik:// que cierran el login con Google (Fase 2). Fuera de
        <Routes> a propósito: tiene que estar montado en cualquier pantalla, porque el
        deep link puede llegar en cualquier momento. */}
    <DeepLinkAuthBridge />

    {/* ¿Quién está atendiendo? Bloquea la operación hasta que alguien marque su PIN, para
        que cada cobro y cada acceso queden firmados. Solo aparece si el gimnasio ya cargó
        gente en el mostrador — ver el porqué en el componente. */}
    <ShiftGate />

    <Routes>
      {/* Auth pages (no sidebar) */}
      <Route element={<AuthLayout />}>
        <Route path={CONFIG.ROUTES.LOGIN} element={<LoginPage />} />
        {/* Recuperar contraseña SÍ queda: el mail de Supabase abre el portal, pero si
            el usuario vuelve con una sesión de recuperación, la pantalla tiene que existir. */}
        <Route path={CONFIG.ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
        {/* Fase 3: en el escritorio /lobby NO es un selector de sucursal — es la puerta
            del terminal. Averigua a qué sucursal está atado el equipo y entra sin
            preguntar. Conserva el nombre de ruta para no tocar el guard de AuthContext ni
            los caminos que ya mandan al Lobby (el "Ya pagué" del muro, la expulsión por
            FORBIDDEN_TENANT). Va bajo AuthLayout porque es una pantalla de acceso, no de
            operación: todavía no hay sucursal ni barra lateral. */}
        <Route path={CONFIG.ROUTES.LOBBY} element={<DeviceGate />} />
      </Route>

      {/* El cobro no se hace acá: las dos rutas caen en el muro, que abre el portal. */}
      <Route path={CONFIG.ROUTES.PLANS} element={<BillingWall />} />
      <Route path={CONFIG.ROUTES.BLOCKED} element={<BillingWall />} />

      {/* App pages (with sidebar) */}
      <Route element={<AppLayout />}>
        <Route path={CONFIG.ROUTES.DASHBOARD} element={<DashboardPage />} />
        <Route path={CONFIG.ROUTES.MEMBERS} element={<MembersPage />} />
        <Route path={CONFIG.ROUTES.PAYMENTS} element={<PaymentsPage />} />
        <Route path={CONFIG.ROUTES.CLASSES} element={<ClassesPage />} />
        <Route path={CONFIG.ROUTES.ACCESS} element={<AccessPage />} />
        <Route path={CONFIG.ROUTES.RETENTION} element={<RetentionPage />} />
        <Route path={CONFIG.ROUTES.REPORTS} element={<ReportsPage />} />
        <Route path={CONFIG.ROUTES.TEAM} element={<TeamPage />} />
        {/* La variante de ESCRITORIO no toca tarjetas: manda al portal. Es lo que
            impide que `import CardCheckout` arrastre el SDK de MP al instalador. */}
        <Route path={CONFIG.ROUTES.SETTINGS} element={<SettingsPage SubscriptionActions={SubscriptionActionsDesktop} />} />
      </Route>

      {/* Fallback. Cubre además las rutas que acá no existen (/register, /onboarding,
          /mission-control, /payment-callback): escribirlas a mano no lleva a ningún lado. */}
      <Route path="*" element={<LoginPage />} />
    </Routes>
    </>
  );
}
