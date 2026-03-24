// ============================================
// VELTRONIK V2 - MAIN APP (React Router)
// ============================================

import { HashRouter, Routes, Route } from 'react-router-dom';
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
import OnboardingPage from './pages/OnboardingPage';
import PlansPage from './pages/PlansPage';
import BlockedPage from './pages/BlockedPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import {
  PaymentCallbackPage,
  MemberPortalPage,
} from './pages/PlaceholderPages';

import './index.css';

export default function App() {
  return (
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
                <Route path={CONFIG.ROUTES.PLANS} element={<PlansPage />} />
                <Route path={CONFIG.ROUTES.BLOCKED} element={<BlockedPage />} />
                <Route path={CONFIG.ROUTES.PAYMENT_CALLBACK} element={<PaymentCallbackPage />} />
                <Route path={CONFIG.ROUTES.MEMBER_PORTAL} element={<MemberPortalPage />} />
              </Route>

              {/* Lobby (special full-screen page) */}
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
              </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
