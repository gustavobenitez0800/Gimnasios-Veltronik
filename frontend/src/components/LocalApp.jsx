// ============================================
// VELTRONIK - SHELL DEL MODO LOCAL (V3, ladrillo 6)
// ============================================
// Cuando la app corre en un equipo enrolado con cerebro local (isLocalMode),
// App.jsx bifurca acá EN VEZ del app normal. Un shell propio, sin Supabase:
// el cajero entra por PIN y opera el POS contra el cerebro embebido.
//
// Reusa las páginas existentes (PosPage no toca auth; KioskCashPage solo lee el
// rol) satisfaciendo el contrato de useAuth con un AuthContext mínimo derivado
// del cajero. El dueño administra desde la nube; el cajero solo VENDE desde acá.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ToastProvider } from '../contexts/ToastContext';
import { AuthContext } from '../contexts/AuthContext';
import { getLocalCashier, clearLocalSession, hasLocalSession } from '../lib/localSession';
import CONFIG from '../lib/config';
import Icon from './Icon';
import LocalLoginPage from '../pages/LocalLoginPage';
import PosPage from '../pages/PosPage';
import KioskCashPage from '../pages/KioskCashPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** Rol del cajero → contrato de useAuth de las páginas (orgRole en minúscula). */
function orgRoleFor(cashier) {
  return cashier?.role === 'ENCARGADO' ? 'admin' : 'staff';
}

function LocalHeader({ cashier, onLogout }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <Icon name="wifiOff" size="1em" /> Caja local
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {cashier?.name || 'Cajero'}</span>
      </span>
      <button className="btn-outline-secondary" onClick={onLogout}>Cerrar turno</button>
    </header>
  );
}

/** El área operativa: header + el POS y la caja, ruteados. */
function LocalOperator({ cashier, onLogout }) {
  return (
    <>
      <LocalHeader cashier={cashier} onLogout={onLogout} />
      <Routes>
        <Route path={CONFIG.ROUTES.POS} element={<PosPage />} />
        <Route path={CONFIG.ROUTES.KIOSK_CASH} element={<KioskCashPage />} />
        <Route path="*" element={<Navigate to={CONFIG.ROUTES.POS} replace />} />
      </Routes>
    </>
  );
}

/** Redirige al POS tras loguear (el LoginPage no está dentro del Router). */
function PostLoginRedirect() {
  const navigate = useNavigate();
  useEffect(() => { navigate(CONFIG.ROUTES.POS, { replace: true }); }, [navigate]);
  return null;
}

function LocalShell() {
  const [authed, setAuthed] = useState(hasLocalSession());
  const [cashier, setCashier] = useState(getLocalCashier());

  const logout = useCallback(() => {
    clearLocalSession();
    setCashier(null);
    setAuthed(false);
  }, []);

  // Un 401 del cerebro local (token vencido/revocado) vuelve a pedir PIN.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('local-auth-unauthorized', onUnauthorized);
    return () => window.removeEventListener('local-auth-unauthorized', onUnauthorized);
  }, [logout]);

  const onLoggedIn = useCallback(() => {
    setCashier(getLocalCashier());
    setAuthed(true);
  }, []);

  // El valor mínimo de useAuth que consumen las páginas del POS (solo el rol).
  const authValue = useMemo(() => ({
    orgRole: orgRoleFor(cashier),
    user: null, profile: null, gym: null, subscription: null,
    loading: false, isTrialActive: true, trialDaysRemaining: 0,
    orgName: '', logout, refreshAuth: async () => {},
  }), [cashier, logout]);

  if (!authed) return <LocalLoginPage onLoggedIn={onLoggedIn} />;

  return (
    <AuthContext.Provider value={authValue}>
      <HashRouter>
        <PostLoginRedirect />
        <LocalOperator cashier={cashier} onLogout={logout} />
      </HashRouter>
    </AuthContext.Provider>
  );
}

export default function LocalApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <LocalShell />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
