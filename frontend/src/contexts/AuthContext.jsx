// ============================================
// VELTRONIK V2 - AUTH CONTEXT (React)
// ============================================
// Refactorizado para usar la API REST de Java
// en lugar de Supabase directamente.
// ============================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services';
import apiClient from '../lib/apiClient';
import { clearQueryCache } from '../hooks/useQueryCache';
import CONFIG from '../lib/config';
import { useToast } from './ToastContext';
import logoSrc from '../assets/LogoPrincipalVeltronik.png';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Public routes that don't require auth
const PUBLIC_ROUTES = [CONFIG.ROUTES.LOGIN, CONFIG.ROUTES.REGISTER, CONFIG.ROUTES.RESET_PASSWORD];

// Routes that don't need org context or active subscription
const NO_ORG_ROUTES = [
  ...PUBLIC_ROUTES,
  CONFIG.ROUTES.LOBBY,
  CONFIG.ROUTES.ONBOARDING,
  CONFIG.ROUTES.PLANS,
  CONFIG.ROUTES.PAYMENT_CALLBACK,
  CONFIG.ROUTES.BLOCKED,
  CONFIG.ROUTES.MEMBER_PORTAL,
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [gym, setGym] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [orgRole, setOrgRole] = useState(localStorage.getItem('current_org_role') || 'owner');
  const [orgName, setOrgName] = useState(localStorage.getItem('current_org_name') || '');
  // Track if initial auth has completed to prevent premature redirects
  const initCompleteRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  // Prevent trial warning toast from firing on every navigation
  const trialWarningShownRef = useRef(false);

  // Check trial status
  const checkTrialStatus = useCallback((gymData) => {
    if (!gymData?.trialEndsAt) return false;
    return new Date() < new Date(gymData.trialEndsAt);
  }, []);

  const getTrialDays = useCallback((gymData) => {
    if (!gymData?.trialEndsAt) return 0;
    const diff = new Date(gymData.trialEndsAt) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, []);

  // Helper: is subscription active
  const isActiveSubscription = useCallback((sub) => {
    return sub?.status === 'active';
  }, []);

  // Helper: does user have valid access (active trial OR active subscription)
  // Nota: el DTO del backend manda camelCase (currentPeriodEnd, gracePeriodEndsAt);
  // toleramos snake_case por compatibilidad. Y una sub 'active' solo da acceso si su
  // período no venció (igual criterio que el KillSwitch del backend).
  const hasValidAccess = useCallback((gymData, sub) => {
    const now = new Date();
    const periodEndRaw = sub?.currentPeriodEnd ?? sub?.current_period_end;
    const graceEndRaw = sub?.gracePeriodEndsAt ?? sub?.grace_period_ends_at;
    const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null;
    const graceEnd = graceEndRaw ? new Date(graceEndRaw) : null;

    // Active subscription grants access only if the period hasn't expired
    if (sub?.status === 'active' && (!periodEnd || periodEnd > now)) return true;
    // Active trial grants access
    if (gymData?.trialEndsAt && now < new Date(gymData.trialEndsAt)) return true;
    // Past_due with grace period still grants access
    if (sub?.status === 'past_due' && graceEnd && now < graceEnd) return true;
    // Canceled but current period hasn't ended
    if (sub?.status === 'canceled' && periodEnd && now < periodEnd) return true;
    return false;
  }, []);

  /**
   * Load the gym (org) data for a specific org ID via Java API.
   */
  const loadOrgById = useCallback(async (orgId) => {
    if (!orgId) return null;
    try {
      const response = await apiClient.get(`/tenants/${orgId}`);
      return response.data;
    } catch (err) {
      console.error('loadOrgById error:', err);
      return null;
    }
  }, []);

  /**
   * Load subscription for a specific org ID via Java API.
   */
  const loadSubscriptionForOrg = useCallback(async (orgId) => {
    if (!orgId) return null;
    try {
      const response = await apiClient.get(`/tenants/${orgId}/subscription`);
      return response.data;
    } catch {
      // Los endpoints de suscripción aún no existen — no crashear
      return null;
    }
  }, []);

  /**
   * Load the role of the current user for a specific org.
   */
  const loadRoleForOrg = useCallback(async (orgId, userId) => {
    if (!orgId || !userId) return 'owner';
    try {
      const response = await apiClient.get(`/tenants/${orgId}/members/${userId}/role`);
      return response.data?.role || 'owner';
    } catch {
      return localStorage.getItem('current_org_role') || 'owner';
    }
  }, []);

  /**
   * Refresh the org context for a specific org.
   * Called when switching orgs in the Lobby to ensure state is fresh.
   */
  const refreshOrgContext = useCallback(async (orgId) => {
    if (!orgId) return;

    // Clear all cached data when switching orgs to prevent cross-org data leaks
    clearQueryCache();

    // Load gym data, subscription, and role in parallel
    const currentUserId = user?.id;
    const [gymData, sub, role] = await Promise.all([
      loadOrgById(orgId),
      loadSubscriptionForOrg(orgId),
      loadRoleForOrg(orgId, currentUserId),
    ]);

    setGym(gymData);
    setSubscription(sub);
    setOrgRole(role);
    setOrgName(gymData?.name || '');

    // Sync localStorage with fresh data
    if (gymData) {
      localStorage.setItem('current_org_name', gymData.name || '');
      localStorage.setItem('current_org_type', gymData.businessType || gymData.type || 'GYM');
    }
    localStorage.setItem('current_org_role', role);

    if (gymData) {
      const trialActive = checkTrialStatus(gymData) && !['active', 'past_due', 'canceled'].includes(sub?.status);
      const trialDays = getTrialDays(gymData);
      setIsTrialActive(trialActive);
      setTrialDaysRemaining(trialDays);
    } else {
      setIsTrialActive(false);
      setTrialDaysRemaining(0);
    }
  }, [user, loadOrgById, checkTrialStatus, getTrialDays, loadSubscriptionForOrg, loadRoleForOrg]);

  // Initialize auth state from Supabase
  const initAuth = useCallback(async () => {
    try {
      const session = await authService.getSession().catch(() => null);
      if (!session) {
        setLoading(false);
        initCompleteRef.current = true;
        return;
      }

      const currentUser = await authService.getCurrentUser().catch(() => null);
      if (currentUser) {
        // Map Supabase user to our expected format.
        // El nombre real vive en user_metadata.full_name (el signup manda un único
        // "fullName"); first_name/last_name casi siempre vienen vacíos. Por eso
        // priorizamos full_name y recién después el split o el prefijo del email.
        const meta = currentUser.user_metadata || {};
        const emailPrefix = currentUser.email ? currentUser.email.split('@')[0] : '';
        const fullName = (
          meta.full_name ||
          meta.name ||
          `${meta.first_name || ''} ${meta.last_name || ''}`.trim() ||
          emailPrefix
        ).trim();
        setUser({
          id: currentUser.id,
          email: currentUser.email,
          firstName: meta.first_name || '',
          lastName: meta.last_name || '',
          fullName,
        });
        // Sidebar / Settings / Lobby leen `profile?.fullName`; sin poblar `profile`
        // queda siempre en "Usuario" aunque el nombre exista en la sesión.
        setProfile({ fullName, email: currentUser.email });
      }

      // Intentar cargar el contexto de la org seleccionada
      const orgId = localStorage.getItem('current_org_id');

      if (orgId) {
        const [gymData, sub] = await Promise.all([
          loadOrgById(orgId),
          loadSubscriptionForOrg(orgId),
        ]);

        setGym(gymData);
        setSubscription(sub);

        if (gymData) {
          const trialActive = checkTrialStatus(gymData) && !['active', 'past_due', 'canceled'].includes(sub?.status);
          const trialDays = getTrialDays(gymData);
          setIsTrialActive(trialActive);
          setTrialDaysRemaining(trialDays);
        }
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      setLoading(false);
      initCompleteRef.current = true;
    }
  }, [checkTrialStatus, getTrialDays, loadOrgById, loadSubscriptionForOrg]);

  useEffect(() => {
    initAuth();

    // Listen for auth changes from Supabase
    const authListener = authService.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          clearQueryCache();
          setUser(null);
          setProfile(null);
          setGym(null);
          setSubscription(null);
          setIsTrialActive(false);
          setTrialDaysRemaining(0);
          trialWarningShownRef.current = false;
          initCompleteRef.current = false;
          authService.clearPlatformState();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Si iniciamos sesión, recargamos initAuth
          await initAuth();
        }
      }
    );

    const handleUnauthorized = () => logout();
    const handlePaymentRequired = () => navigate(CONFIG.ROUTES.BLOCKED, { replace: true });
    const handleForbiddenTenant = () => {
      // El negocio seleccionado dejó de ser accesible: limpiar contexto y volver al Lobby.
      setGym(null);
      setSubscription(null);
      setOrgName('');
      navigate(CONFIG.ROUTES.LOBBY, { replace: true });
    };

    window.addEventListener('auth-unauthorized', handleUnauthorized);
    window.addEventListener('auth-payment-required', handlePaymentRequired);
    window.addEventListener('auth-forbidden-tenant', handleForbiddenTenant);

    return () => {
      authListener?.unsubscribe();
      window.removeEventListener('auth-unauthorized', handleUnauthorized);
      window.removeEventListener('auth-payment-required', handlePaymentRequired);
      window.removeEventListener('auth-forbidden-tenant', handleForbiddenTenant);
    };
  }, [initAuth, navigate]);

  // Route protection
  useEffect(() => {
    // Don't run until initial auth is complete to prevent premature redirects
    if (loading || !initCompleteRef.current) return;

    const currentPath = location.pathname;
    const isPublic = PUBLIC_ROUTES.includes(currentPath);
    const needsOrg = !NO_ORG_ROUTES.includes(currentPath);

    // Not logged in → redirect to login (except public pages)
    if (!user && !isPublic) {
      navigate(CONFIG.ROUTES.LOGIN, { replace: true });
      return;
    }

    // Logged in on public page → redirect to lobby
    if (user && isPublic) {
      navigate(CONFIG.ROUTES.LOBBY, { replace: true });
      return;
    }

    // Logged in, needs org context but none selected
    if (user && needsOrg) {
      const orgId = localStorage.getItem('current_org_id');
      if (!orgId) {
        navigate(CONFIG.ROUTES.LOBBY, { replace: true });
        return;
      }
    }

    // CRITICAL: Billing is now centralized in the Java Backend (KillSwitchFilter)
    // If a tenant is blocked or trial expired, the API will return 402 Payment Required
    // The apiClient interceptor will catch it and dispatch 'auth-payment-required', redirecting to BLOCKED.
    // We no longer evaluate dates in the frontend.

    // Trial warning (only show once per session, not on every navigation)
    if (user && gym && isTrialActive && trialDaysRemaining <= 7 && needsOrg && !trialWarningShownRef.current) {
      trialWarningShownRef.current = true;
      const msg = trialDaysRemaining <= 1
        ? 'Tu período de prueba termina hoy. Suscribite para seguir usando Veltronik.'
        : `Tu período de prueba vence en ${trialDaysRemaining} días. Suscribite para no perder acceso.`;
      showToast(msg, 'warning', 10000);
    }
  }, [user, loading, location.pathname, gym, subscription, isTrialActive, trialDaysRemaining, hasValidAccess, navigate, showToast]);

  // Auth actions
  const login = async (email, password) => {
    trialWarningShownRef.current = false;
    await authService.signIn(email, password);
    await initAuth();
    navigate(CONFIG.ROUTES.LOBBY);
  };

  const register = async (email, password, fullName) => {
    trialWarningShownRef.current = false;
    await authService.signUp(email, password, fullName);
    await initAuth();
    navigate(CONFIG.ROUTES.LOBBY);
  };

  const loginWithGoogle = async () => {
    trialWarningShownRef.current = false;
    await authService.signInWithGoogle();
  };

  const logout = async () => {
    try {
      await authService.signOut();
    } catch {
      // Force redirect anyway
    }
    clearQueryCache();
    setUser(null);
    setProfile(null);
    setGym(null);
    setSubscription(null);
    setIsTrialActive(false);
    setTrialDaysRemaining(0);
    trialWarningShownRef.current = false;
    initCompleteRef.current = false;
    localStorage.removeItem('current_org_id');
    localStorage.removeItem('current_org_name');

    // HARD REDIRECT para limpiar el estado en memoria (evita caché retenido tras logout).
    // OJO Electron: la app usa HashRouter y se sirve por file://. Un `location.href='/'`
    // apunta a la RAÍZ DEL DISCO (no al index.html) → pantalla en blanco. Hay que
    // recargar el index.html ACTUAL (location.pathname) y mandar el hash al login.
    const loginHash = `#${CONFIG.ROUTES.LOGIN || '/'}`;
    window.location.href = `${window.location.pathname}${window.location.search}${loginHash}`;
    window.location.reload();
  };

  const refreshAuth = async () => {
    setLoading(true);
    await initAuth();
  };

  const updateGym = async (updates) => {
    const orgId = gym?.id || localStorage.getItem('current_org_id');
    if (!orgId) throw new Error('No org selected');

    const response = await apiClient.put(`/tenants/${orgId}`, updates);
    const data = response.data;

    if (data) {
      setGym(data);
      setOrgName(data.name || '');
      // Keep localStorage in sync for page refreshes
      localStorage.setItem('current_org_name', data.name || '');
      if (data.businessType || data.type) localStorage.setItem('current_org_type', data.businessType || data.type);
    }
    return data;
  };

  const value = {
    user,
    profile,
    gym,
    subscription,
    loading,
    isTrialActive,
    trialDaysRemaining,
    isActiveSubscription,
    hasValidAccess,
    orgRole,
    orgName,
    login,
    register,
    loginWithGoogle,
    logout,
    refreshAuth,
    refreshOrgContext,
    updateGym,
  };

  // ─── Splash screen while checking session (Instagram-style) ───
  // Never show login page flash — show branded splash until auth resolves
  if (loading) {
    return (
      <AuthContext.Provider value={value}>
        <div className="auth-splash">
          <img src={logoSrc} alt="Veltronik" className="auth-splash-logo" />
          <div className="auth-splash-spinner"><span className="spinner" /></div>
        </div>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
