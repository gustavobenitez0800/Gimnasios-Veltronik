// ============================================
// VELTRONIK - RUTAS DEL PORTAL WEB
// ============================================
// La tabla COMPLETA: operación del gimnasio + todo lo de cuenta y cobro. Es lo que
// deploya Vercel y lo único que puede tocar una tarjeta.
//
// Su gemela es routes/DesktopRoutes.jsx, que monta solo la operación. Las dos comparten
// los MISMOS nombres de ruta a propósito (ver la nota ahí).
// ============================================

import { Routes, Route } from 'react-router-dom';
import CONFIG from '../lib/config';
import { AppLayout, AuthLayout } from '../components/Layout';

import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import LobbyPage from '../pages/LobbyPage';
import DashboardPage from '../pages/DashboardPage';
import MembersPage from '../pages/MembersPage';
import PaymentsPage from '../pages/PaymentsPage';
import ClassesPage from '../pages/ClassesPage';
import AccessPage from '../pages/AccessPage';
import RetentionPage from '../pages/RetentionPage';
import ReportsPage from '../pages/ReportsPage';
import TeamPage from '../pages/TeamPage';
import SettingsPage from '../pages/SettingsPage';
import MissionControlPage from '../pages/MissionControlPage';
import OnboardingPage from '../pages/OnboardingPage';
import PlansPage from '../pages/PlansPage';
import BlockedPage from '../pages/BlockedPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import PaymentCallbackPage from '../pages/PaymentCallbackPage';
import DesktopAuthPage from '../pages/DesktopAuthPage';
import OwnerInsightsPage from '../pages/OwnerInsightsPage';
import SubscriptionActionsWeb from '../components/billing/SubscriptionActionsWeb';

export default function WebRoutes() {
  return (
    <Routes>
      {/* Auth pages (no sidebar) */}
      <Route element={<AuthLayout />}>
        <Route path={CONFIG.ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={CONFIG.ROUTES.REGISTER} element={<RegisterPage />} />
        <Route path={CONFIG.ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
        <Route path={CONFIG.ROUTES.ONBOARDING} element={<OnboardingPage />} />
        <Route path={CONFIG.ROUTES.PAYMENT_CALLBACK} element={<PaymentCallbackPage />} />
        {/* Relevo del login de escritorio (Fase 1). Vive SOLO acá: la app de escritorio
            nunca la abre — la abre el navegador del usuario. */}
        <Route path={CONFIG.ROUTES.DESKTOP_AUTH} element={<DesktopAuthPage />} />
      </Route>

      {/* Full screen pages without layout wrappers */}
      <Route path={CONFIG.ROUTES.PLANS} element={<PlansPage />} />
      <Route path={CONFIG.ROUTES.BLOCKED} element={<BlockedPage />} />
      <Route path={CONFIG.ROUTES.LOBBY} element={<LobbyPage />} />
      {/* Resumen del dueño sobre todas sus sucursales. Solo acá: en el escritorio, el
          terminal está atado a UNA sucursal y no tiene por qué mostrar las otras. */}
      <Route path={CONFIG.ROUTES.OWNER_INSIGHTS} element={<OwnerInsightsPage />} />

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
        {/* La variante WEB de las acciones de suscripción trae el Card Brick de MP. */}
        <Route path={CONFIG.ROUTES.SETTINGS} element={<SettingsPage SubscriptionActions={SubscriptionActionsWeb} />} />
        {/* Mission Control (ladrillo 7): la propia página se gatea por fundador. */}
        <Route path={CONFIG.ROUTES.MISSION_CONTROL} element={<MissionControlPage />} />
      </Route>

      {/* Fallback: redirige rutas desconocidas al login */}
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}
