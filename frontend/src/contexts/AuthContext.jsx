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
  const hasValidAccess = useCallback((gymData, sub) => {
    // Active subscription always grants access
    if (sub?.status === 'active') return true;
    // Active trial grants access
    if (gymData?.trialEndsAt && new Date() < new Date(gymData.trialEndsAt)) return true;
    // Past_due with grace period still grants access
    if (sub?.status === 'past_due' && sub?.grace_period_ends_at) {
      if (new Date() < new Date(sub.grace_period_ends_at)) return true;
    }
    // Canceled but current period hasn't ended
    if (sub?.status === 'canceled' && sub?.current_period_end) {
      if (new Date() < new Date(sub.current_period_end)) return true;
    }
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
        // Map Supabase user to our expected format
        setUser({
          id: currentUser.id,
          email: currentUser.email,
          firstName: currentUser.user_metadata?.first_name || '',
          lastName: currentUser.user_metadata?.last_name || '',
          fullName: `${currentUser.user_metadata?.first_name || ''} ${currentUser.user_metadata?.last_name || ''}`.trim()
        });
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

    window.addEventListener('auth-unauthorized', handleUnauthorized);
    window.addEventListener('auth-payment-required', handlePaymentRequired);

    return () => {
      authListener?.unsubscribe();
      window.removeEventListener('auth-unauthorized', handleUnauthorized);
      window.removeEventListener('auth-payment-required', handlePaymentRequired);
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
        ? '⚠️ Tu período de prueba termina hoy. Suscribite para seguir usando Veltronik.'
        : `⚠️ Tu período de prueba vence en ${trialDaysRemaining} días. Suscribite para no perder acceso.`;
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
    
    // HARD REDIRECT para limpiar memoria RAM del navegador (Evita el "sistema loco" por caché retenido)
    window.location.href = CONFIG.ROUTES.LOGIN || '/login';
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
