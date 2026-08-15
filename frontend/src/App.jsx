// ============================================
// VELTRONIK V2 - MAIN APP (React Router)
// ============================================
// Todas las rutas de adentro son rutas de gimnasio. Antes colgaban de un OrgTypeGuard
// que comparaba el "tipo de negocio" contra una lista de rubros permitidos; con un solo
// rubro esa comparación siempre daba true y lo único que hacía era mantener vivo el
// concepto de tipo. Se dio de baja junto con el resto del andamiaje multi-rubro.
// ============================================

import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout, AuthLayout } from './components/Layout';
import CONFIG from './lib/config';

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
import BlockedPage from './pages/BlockedPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PaymentCallbackPage from './pages/PaymentCallbackPage';

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
              </Route>

              {/* Full screen pages without layout wrappers */}
              <Route path={CONFIG.ROUTES.PLANS} element={<PlansPage />} />
              <Route path={CONFIG.ROUTES.BLOCKED} element={<BlockedPage />} />
              <Route path={CONFIG.ROUTES.LOBBY} element={<LobbyPage />} />

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
                <Route path={CONFIG.ROUTES.SETTINGS} element={<SettingsPage />} />
                {/* Mission Control (ladrillo 7): la propia página se gatea por fundador. */}
                <Route path={CONFIG.ROUTES.MISSION_CONTROL} element={<MissionControlPage />} />
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
