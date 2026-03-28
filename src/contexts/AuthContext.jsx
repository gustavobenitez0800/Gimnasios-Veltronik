// ============================================
// VELTRONIK - AUTH CONTEXT (React)
// ============================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import supabase, {
  getSession,
  getCurrentUser,
  getProfile,
  getGym,
  getSubscription,
  updateGym as supabaseUpdateGym,
  signIn as supabaseSignIn,
  signUp as supabaseSignUp,
  signInWithGoogle as supabaseSignInWithGoogle,
  signOut as supabaseSignOut,
  clearPlatformState,
} from '../lib/supabase';
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

  // Initialize auth state
  const initAuth = useCallback(async () => {
    try {
      const session = await getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      const userProfile = await getProfile();
      setProfile(userProfile);

      if (userProfile?.gym_id) {
        const gymData = await getGym();
        setGym(gymData);

        const trialActive = checkTrialStatus(gymData);
        const trialDays = getTrialDays(gymData);
        setIsTrialActive(trialActive);
        setTrialDaysRemaining(trialDays);

        try {
          const sub = await getSubscription();
          setSubscription(sub);
        } catch {
          // Subscription loading error is not critical
        }
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      setLoading(false);
    }
  }, [checkTrialStatus, getTrialDays]);

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
    if (loading) return;

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
    navigate(CONFIG.ROUTES.LOGIN);
  };

  const refreshAuth = async () => {
    setLoading(true);
    await initAuth();
  };

  const updateGym = async (updates) => {
    const result = await supabaseUpdateGym(updates);
    // Refresh gym state after update
    if (result) setGym(result);
    return result;
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
    updateGym,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
