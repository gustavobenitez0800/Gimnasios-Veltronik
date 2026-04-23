// ============================================
// VELTRONIK - AUTH CONTEXT (React) v2
// ============================================
// Improved with:
// - refreshOrgContext() for switching orgs in Lobby
// - Per-org subscription validation
// - Race condition fix for route protection
// - Scalable for any number of org types
// ============================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  supabase,
  authService,
  profileService,
  gymService,
  subscriptionService,
} from '../services';

// Aliases for backward compat within this file
const getSession = () => authService.getSession();
const getCurrentUser = () => authService.getCurrentUser();
const getProfile = () => profileService.getCurrent();
const supabaseSignIn = (e, p) => authService.signIn(e, p);
const supabaseSignUp = (e, p, n) => authService.signUp(e, p, n);
const supabaseSignInWithGoogle = () => authService.signInWithGoogle();
const supabaseSignOut = () => authService.signOut();
const clearPlatformState = () => authService.clearPlatformState();
import CONFIG from '../lib/config';
import { useToast } from './ToastContext';

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
  // Track if initial auth has completed to prevent premature redirects
  const initCompleteRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  // Prevent trial warning toast from firing on every navigation
  const trialWarningShownRef = useRef(false);

  // Check trial status
  const checkTrialStatus = useCallback((gymData) => {
    if (!gymData?.trial_ends_at) return false;
    return new Date() < new Date(gymData.trial_ends_at);
  }, []);

  const getTrialDays = useCallback((gymData) => {
    if (!gymData?.trial_ends_at) return 0;
    const diff = new Date(gymData.trial_ends_at) - new Date();
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
    if (gymData?.trial_ends_at && new Date() < new Date(gymData.trial_ends_at)) return true;
    // Past_due with grace period still grants access
    if (sub?.status === 'past_due' && sub?.grace_period_ends_at) {
      if (new Date() < new Date(sub.grace_period_ends_at)) return true;
    }
    return false;
  }, []);

  /**
   * Load the gym (org) data for a specific org ID.
   */
  const loadOrgById = useCallback(async (orgId) => {
    if (!orgId) return null;
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('loadOrgById error:', err);
      return null;
    }
  }, []);

  /**
   * Load the gym (org) data for the currently selected organization.
   * Uses current_org_id from localStorage if available, otherwise falls back to profile.gym_id.
   */
  const loadCurrentOrg = useCallback(async (userProfile) => {
    const orgId = localStorage.getItem('current_org_id') || userProfile?.gym_id;
    return loadOrgById(orgId);
  }, [loadOrgById]);

  /**
   * Load subscription for a specific org ID.
   * Priority: active > latest.
   */
  const loadSubscriptionForOrg = useCallback(async (orgId) => {
    if (!orgId) return null;
    try {
      const { data: activeSub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('gym_id', orgId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (activeSub) return activeSub;

      const { data: latestSub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('gym_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return latestSub || null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Refresh the org context for a specific org.
   * Called when switching orgs in the Lobby to ensure state is fresh.
   */
  const refreshOrgContext = useCallback(async (orgId) => {
    if (!orgId) return;

    const gymData = await loadOrgById(orgId);
    setGym(gymData);

    if (gymData) {
      const trialActive = checkTrialStatus(gymData);
      const trialDays = getTrialDays(gymData);
      setIsTrialActive(trialActive);
      setTrialDaysRemaining(trialDays);

      const sub = await loadSubscriptionForOrg(gymData.id);
      setSubscription(sub);
    } else {
      setIsTrialActive(false);
      setTrialDaysRemaining(0);
      setSubscription(null);
    }
  }, [loadOrgById, checkTrialStatus, getTrialDays, loadSubscriptionForOrg]);

  // Initialize auth state
  const initAuth = useCallback(async () => {
    try {
      const session = await getSession();

      if (!session) {
        setLoading(false);
        initCompleteRef.current = true;
        return;
      }

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      const userProfile = await getProfile();
      setProfile(userProfile);

      // Load the currently selected org (multi-org support)
      const gymData = await loadCurrentOrg(userProfile);
      setGym(gymData);

      if (gymData) {
        const trialActive = checkTrialStatus(gymData);
        const trialDays = getTrialDays(gymData);
        setIsTrialActive(trialActive);
        setTrialDaysRemaining(trialDays);

        const sub = await loadSubscriptionForOrg(gymData.id);
        setSubscription(sub);
      } else {
        setIsTrialActive(false);
        setTrialDaysRemaining(0);
        setSubscription(null);
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      setLoading(false);
      initCompleteRef.current = true;
    }
  }, [checkTrialStatus, getTrialDays, loadCurrentOrg, loadSubscriptionForOrg]);

  useEffect(() => {
    initAuth();

    // Listen for auth changes
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setGym(null);
          setSubscription(null);
          setIsTrialActive(false);
          setTrialDaysRemaining(0);
          trialWarningShownRef.current = false;
          initCompleteRef.current = false;
          clearPlatformState();
        }
        if (event === 'TOKEN_REFRESHED') {
          // Token refreshed silently
        }
      }
    );

    return () => authListener?.unsubscribe();
  }, [initAuth]);

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

    // CRITICAL: Block access if trial expired AND no active subscription
    // Only check for pages that need org (dashboard, members, etc.)
    if (user && gym && needsOrg) {
      if (!hasValidAccess(gym, subscription)) {
        navigate(CONFIG.ROUTES.BLOCKED, { replace: true });
        return;
      }
    }

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
    await supabaseSignIn(email, password);
    await initAuth();
    navigate(CONFIG.ROUTES.LOBBY);
  };

  const register = async (email, password, fullName) => {
    trialWarningShownRef.current = false;
    await supabaseSignUp(email, password, fullName);
    await initAuth();
    navigate(CONFIG.ROUTES.LOBBY);
  };

  const loginWithGoogle = async () => {
    trialWarningShownRef.current = false;
    await supabaseSignInWithGoogle();
  };

  const logout = async () => {
    try {
      await supabaseSignOut();
    } catch {
      // Force redirect anyway
    }
    setUser(null);
    setProfile(null);
    setGym(null);
    setSubscription(null);
    setIsTrialActive(false);
    setTrialDaysRemaining(0);
    trialWarningShownRef.current = false;
    initCompleteRef.current = false;
    navigate(CONFIG.ROUTES.LOGIN);
  };

  const refreshAuth = async () => {
    setLoading(true);
    await initAuth();
  };

  const updateGym = async (updates) => {
    const orgId = localStorage.getItem('current_org_id') || profile?.gym_id;
    if (!orgId) throw new Error('No org selected');

    const { data, error } = await supabase
      .from('gyms')
      .update(updates)
      .eq('id', orgId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (data) setGym(data);
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
          <img src="/assets/LogoPrincipalVeltronik.png" alt="Veltronik" className="auth-splash-logo" />
          <div className="auth-splash-spinner"><span className="spinner" /></div>
        </div>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
