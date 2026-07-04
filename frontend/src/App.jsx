// ============================================
// VELTRONIK V2 - MAIN APP (React Router)
// ============================================
// Routes are protected by OrgTypeGuard to prevent
// cross-system access (gym vs restaurant).
// ============================================

import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout, AuthLayout } from './components/Layout';
import OrgTypeGuard from './components/OrgTypeGuard';
import ForceUpdateOverlay from './components/ForceUpdateOverlay';
import CONFIG from './lib/config';
import { FITNESS_VERTICALS } from './lib/verticals';
import { isLocalMode } from './lib/connection';
import LocalApp from './components/LocalApp';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LobbyPage from './pages/LobbyPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import PaymentsPage from './pages/PaymentsPage';
import ClassesPage from './pages/ClassesPage';
import AccessPage from './pages/AccessPage';
import RetentionPage from './pages/RetentionPage';
import ReportsPage from './pages/ReportsPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import MissionControlPage from './pages/MissionControlPage';
import OnboardingPage from './pages/OnboardingPage';
import PlansPage from './pages/PlansPage';
import CourtGridPage from './pages/CourtGridPage';
import CourtsPage from './pages/CourtsPage';
import CourtCustomersPage from './pages/CourtCustomersPage';
import CourtFixedPage from './pages/CourtFixedPage';
import CourtPublicBookingPage from './pages/CourtPublicBookingPage';
import PosPage from './pages/PosPage';
import KioskDashboardPage from './pages/KioskDashboardPage';
import KioskReportsPage from './pages/KioskReportsPage';
import KioskProductsPage from './pages/KioskProductsPage';
import KioskInventoryPage from './pages/KioskInventoryPage';
import KioskCashPage from './pages/KioskCashPage';
import KioskCustomersPage from './pages/KioskCustomersPage';
import KioskSuppliersPage from './pages/KioskSuppliersPage';
import KioskFiscalPage from './pages/KioskFiscalPage';
import BlockedPage from './pages/BlockedPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import {
  PaymentCallbackPage,
  MemberPortalPage,
} from './pages/PlaceholderPages';

import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  // MODO LOCAL (V3, ladrillo 6): en un equipo enrolado con cerebro local, la app
  // es una CAJA — PIN + POS contra el backend embebido, sin Supabase. Bifurca acá
  // antes de armar el app de la nube. isLocalMode() ya está resuelto (main.jsx lo
  // esperó); para el 100% de los clientes de hoy es false → app normal.
  if (isLocalMode()) {
    return <LocalApp />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              {/* Auth pages (no sidebar) */}
              <Route element={<AuthLayout />}>
                <Route path={CONFIG.ROUTES.LOGIN} element={<LoginPage />} />
                <Route path={CONFIG.ROUTES.REGISTER} element={<RegisterPage />} />
                <Route path={CONFIG.ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
                <Route path={CONFIG.ROUTES.ONBOARDING} element={<OnboardingPage />} />
                <Route path={CONFIG.ROUTES.PAYMENT_CALLBACK} element={<PaymentCallbackPage />} />
                <Route path={CONFIG.ROUTES.MEMBER_PORTAL} element={<MemberPortalPage />} />
              </Route>

              {/* Full screen pages without layout wrappers */}
              <Route path={CONFIG.ROUTES.PLANS} element={<PlansPage />} />
              <Route path={CONFIG.ROUTES.BLOCKED} element={<BlockedPage />} />
              <Route path={CONFIG.ROUTES.LOBBY} element={<LobbyPage />} />
              {/* Reservas online: página pública del cliente final (sin login) */}
              <Route path="/reservar/:token" element={<CourtPublicBookingPage />} />

              {/* App pages (with sidebar) */}
              <Route element={<AppLayout />}>
                {/* Dashboard — shared route, renders correct dashboard by org type internally */}
                <Route path={CONFIG.ROUTES.DASHBOARD} element={<DashboardPage />} />

                {/* Shared routes (both gym & restaurant use these) */}
                <Route path={CONFIG.ROUTES.REPORTS} element={<ReportsPage />} />
                <Route path={CONFIG.ROUTES.TEAM} element={<TeamPage />} />
                <Route path={CONFIG.ROUTES.SETTINGS} element={<SettingsPage />} />
                {/* Mission Control (ladrillo 7): la propia página se gatea por fundador. */}
                <Route path={CONFIG.ROUTES.MISSION_CONTROL} element={<MissionControlPage />} />

                {/* ─── GYM-ONLY ROUTES (Fitness & Wellness Ecosystem) ─── */}
                <Route element={<OrgTypeGuard allowedTypes={FITNESS_VERTICALS} />}>
                  <Route path={CONFIG.ROUTES.MEMBERS} element={<MembersPage />} />
                  <Route path={CONFIG.ROUTES.PAYMENTS} element={<PaymentsPage />} />
                  <Route path={CONFIG.ROUTES.CLASSES} element={<ClassesPage />} />
                  <Route path={CONFIG.ROUTES.ACCESS} element={<AccessPage />} />
                  <Route path={CONFIG.ROUTES.RETENTION} element={<RetentionPage />} />
                </Route>

                {/* ─── FUTBOL_5-ONLY ROUTES (Vertical Canchas) ─── */}
                <Route element={<OrgTypeGuard allowedTypes={['FUTBOL_5']} />}>
                  <Route path={CONFIG.ROUTES.COURT_GRID} element={<CourtGridPage />} />
                  <Route path={CONFIG.ROUTES.COURTS} element={<CourtsPage />} />
                  <Route path={CONFIG.ROUTES.COURT_CUSTOMERS} element={<CourtCustomersPage />} />
                  <Route path={CONFIG.ROUTES.COURT_FIXED} element={<CourtFixedPage />} />
                </Route>

                {/* ─── KIOSCO-ONLY ROUTES (Vertical Kiosco / Almacén) ─── */}
                <Route element={<OrgTypeGuard allowedTypes={['KIOSCO']} />}>
                  <Route path={CONFIG.ROUTES.POS} element={<PosPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_DASHBOARD} element={<KioskDashboardPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_REPORTS} element={<KioskReportsPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_PRODUCTS} element={<KioskProductsPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_INVENTORY} element={<KioskInventoryPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_CASH} element={<KioskCashPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_CUSTOMERS} element={<KioskCustomersPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_SUPPLIERS} element={<KioskSuppliersPage />} />
                  <Route path={CONFIG.ROUTES.KIOSK_FISCAL} element={<KioskFiscalPage />} />
                </Route>
              </Route>

              {/* Fallback: redirige rutas desconocidas al login */}
              <Route path="*" element={<LoginPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
    </QueryClientProvider>
  );
}
