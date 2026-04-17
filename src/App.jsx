// ============================================
// VELTRONIK V2 - MAIN APP (React Router)
// ============================================

import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout, AuthLayout } from './components/Layout';
import ForceUpdateOverlay from './components/ForceUpdateOverlay';
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

// Restaurant Pages (lazy loaded — no impacta bundle del gym)
const RestaurantDashboardPage = lazy(() => import('./pages/restaurant/RestaurantDashboardPage'));
const TablesPage = lazy(() => import('./pages/restaurant/TablesPage'));
const MenuPage = lazy(() => import('./pages/restaurant/MenuPage'));
const OrdersPage = lazy(() => import('./pages/restaurant/OrdersPage'));
const KitchenPage = lazy(() => import('./pages/restaurant/KitchenPage'));
const CashRegisterPage = lazy(() => import('./pages/restaurant/CashRegisterPage'));
const InventoryPage = lazy(() => import('./pages/restaurant/InventoryPage'));
const ReservationsPage = lazy(() => import('./pages/restaurant/ReservationsPage'));
const RestaurantReportsPage = lazy(() => import('./pages/restaurant/RestaurantReportsPage'));

import './index.css';

export default function App() {
  return (
    <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {/* Force Update: bloquea TODA la app si la versión es vieja */}
            <ForceUpdateOverlay />

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
                {/* Gym pages */}
                <Route path={CONFIG.ROUTES.DASHBOARD} element={<DashboardPage />} />
                <Route path={CONFIG.ROUTES.MEMBERS} element={<MembersPage />} />
                <Route path={CONFIG.ROUTES.PAYMENTS} element={<PaymentsPage />} />
                <Route path={CONFIG.ROUTES.CLASSES} element={<ClassesPage />} />
                <Route path={CONFIG.ROUTES.ACCESS} element={<AccessPage />} />
                <Route path={CONFIG.ROUTES.RETENTION} element={<RetentionPage />} />
                <Route path={CONFIG.ROUTES.REPORTS} element={<ReportsPage />} />
                <Route path={CONFIG.ROUTES.TEAM} element={<TeamPage />} />
                <Route path={CONFIG.ROUTES.SETTINGS} element={<SettingsPage />} />

                {/* Restaurant pages (lazy) */}
                <Route path={CONFIG.ROUTES.TABLES} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><TablesPage /></Suspense>} />
                <Route path={CONFIG.ROUTES.MENU} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><MenuPage /></Suspense>} />
                <Route path={CONFIG.ROUTES.ORDERS} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><OrdersPage /></Suspense>} />
                <Route path={CONFIG.ROUTES.KITCHEN} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><KitchenPage /></Suspense>} />
                <Route path={CONFIG.ROUTES.CASH_REGISTER} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><CashRegisterPage /></Suspense>} />
                <Route path={CONFIG.ROUTES.INVENTORY} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><InventoryPage /></Suspense>} />
                <Route path={CONFIG.ROUTES.RESERVATIONS} element={<Suspense fallback={<div className="dashboard-loading"><span className="spinner" /> Cargando...</div>}><ReservationsPage /></Suspense>} />
              </Route>

              {/* Fallback: redirige rutas desconocidas al login */}
              <Route path="*" element={<LoginPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
