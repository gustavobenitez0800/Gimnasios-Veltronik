// ============================================
// VELTRONIK PLATFORM - AUTH CONTROLLER
// ============================================

/**
 * Helper: Check if subscription is in an active/valid state.
 * Accepts 'active' and 'authorized' (MP's confirmed state).
 * Use this EVERYWHERE instead of comparing status === 'active' directly.
 */
function isActiveSubscription(subscription) {
    if (!subscription) return false;
    return subscription.status === 'active' || subscription.status === 'authorized';
}

/**
 * Check authentication and redirect based on user state
 * This should be called on every protected page
 */
async function checkAuthAndRedirect() {
    try {
        const session = await getSession();

        // No session - redirect to login
        if (!session) {
            if (!isPublicPage()) {
                window.location.href = CONFIG.ROUTES.LOGIN;
            }
            return null;
        }

        // Get profile
        const profile = await getProfile();

        if (!profile) {
            console.error('Profile not found for authenticated user');
            await signOut();
            return null;
        }

        // Platform Logic: Allow Lobby, Member Portal, and Onboarding access
        if (isLobbyPage() || isMemberPortalPage() || isOnboardingPage()) {
            return { session, profile };
        }

        // On public pages (login/register), always redirect to lobby
        // Let the lobby handle org selection and further routing
        if (isPublicPage()) {
            window.location.href = CONFIG.ROUTES.LOBBY;
            return { session, profile };
        }

        // Below here: Only applies to protected system pages

        // Check if user has a gym
        if (!profile.gym_id) {
            // No gym — send to lobby (lobby shows empty state + 'Crear Negocio' card)
            window.location.href = CONFIG.ROUTES.LOBBY;
            return { session, profile, gym: null };
        }

        // Get gym data
        const gym = await getGym();

        if (!gym) {
            console.error('Gym not found');
            window.location.href = CONFIG.ROUTES.LOBBY;
            return null;
        }

        // Get subscription data
        let subscription = null;
        try {
            subscription = await getSubscription();
        } catch (e) {
            console.warn('Could not load subscription:', e);
        }

        // Check trial status
        const isTrialActive = checkTrialStatus(gym);
        const trialDaysRemaining = getTrialDaysRemaining(gym);

        // ============================================
        // ROUTING LOGIC
        // ============================================

        switch (gym.status) {
            case CONFIG.GYM_STATUS.ACTIVE:
                // Check if they have an active subscription OR active trial
                if (isActiveSubscription(subscription)) {
                    // Subscription active - full access
                    if (isPublicPage()) {
                        window.location.href = CONFIG.ROUTES.LOBBY;
                    }
                } else if (isTrialActive) {
                    // Trial still active - allow access
                    if (isPublicPage()) {
                        window.location.href = CONFIG.ROUTES.LOBBY;
                    }
                    // Show trial warning when less than 7 days remaining
                    if (trialDaysRemaining <= 7 && !isPaymentPage()) {
                        setTimeout(() => showTrialWarning(trialDaysRemaining), 1000);
                    }
                } else if (subscription && subscription.status === 'past_due') {
                    // Grace period - check if still valid
                    const graceEnd = subscription.grace_period_ends_at
                        ? new Date(subscription.grace_period_ends_at)
                        : null;
                    const now = new Date();

                    if (graceEnd && graceEnd > now) {
                        // Grace period still active - allow access but warn
                        if (isPublicPage()) {
                            window.location.href = CONFIG.ROUTES.LOBBY;
                        }
                        if (!isPaymentPage()) {
                            const graceDaysLeft = Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24));
                            setTimeout(() => showGracePeriodWarning(graceDaysLeft), 1000);
                        }
                    } else {
                        // Grace period expired - block
                        if (!isBlockedPage() && !isPaymentPage()) {
                            window.location.href = CONFIG.ROUTES.BLOCKED;
                        }
                    }
                } else if (subscription && subscription.status === 'pending') {
                    // Subscription pending (payment in process) — don't block, allow access
                    // The webhook will update the status when the payment is confirmed
                    if (isPublicPage()) {
                        window.location.href = CONFIG.ROUTES.LOBBY;
                    }
                } else {
                    // No subscription, no trial - needs payment
                    if (!isPaymentPage()) {
                        window.location.href = CONFIG.ROUTES.PLANS;
                    }
                }
                break;

            case CONFIG.GYM_STATUS.PENDING:
                if (isTrialActive) {
                    if (isPublicPage()) {
                        window.location.href = CONFIG.ROUTES.LOBBY;
                    }
                } else {
                    if (!isPaymentPage()) {
                        window.location.href = CONFIG.ROUTES.PLANS;
                    }
                }
                break;

            case CONFIG.GYM_STATUS.BLOCKED:
                // Blocked - only allow blocked page and payment page
                if (!isBlockedPage() && !isPaymentPage()) {
                    window.location.href = CONFIG.ROUTES.BLOCKED;
                }
                break;
        }

        return { session, profile, gym, subscription, isTrialActive, trialDaysRemaining };

    } catch (error) {
        console.error('Auth check error:', error);

        // On error, redirect to login for safety
        if (!isPublicPage()) {
            window.location.href = CONFIG.ROUTES.LOGIN;
        }
        return null;
    }
}

/**
 * Check if trial period is still active
 */
function checkTrialStatus(gym) {
    if (!gym.trial_ends_at) return false;

    const trialEnd = new Date(gym.trial_ends_at);
    const today = new Date();

    return today < trialEnd;
}

/**
 * Get days remaining in trial
 */
function getTrialDaysRemaining(gym) {
    if (!gym.trial_ends_at) return 0;

    const trialEnd = new Date(gym.trial_ends_at);
    const today = new Date();
    const diffTime = trialEnd - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
}

/**
 * Check if current page is public (login/register)
 */
function isPublicPage() {
    const path = window.location.pathname;
    return path.endsWith('index.html') ||
        path.endsWith('register.html') ||
        path === '/' ||
        path === '';
}

/**
 * Check if current page is onboarding
 */
function isOnboardingPage() {
    return window.location.pathname.endsWith('onboarding.html');
}

/**
 * Check if current page is lobby
 */
function isLobbyPage() {
    return window.location.pathname.endsWith('platform-lobby.html');
}

/**
 * Check if current page is payment related
 */
function isPaymentPage() {
    const path = window.location.pathname;
    return path.endsWith('plans.html') ||
        path.endsWith('payment-pending.html') ||
        path.endsWith('payment-callback.html');
}

/**
 * Check if current page is blocked page
 */
function isBlockedPage() {
    return window.location.pathname.endsWith('blocked.html');
}

/**
 * Check if current page is dashboard
 */
function isDashboardPage() {
    const path = window.location.pathname;
    return path.endsWith('dashboard.html') ||
        path.endsWith('members.html') ||
        path.endsWith('payments.html') ||
        path.endsWith('settings.html') ||
        path.endsWith('classes.html') ||
        path.endsWith('reports.html') ||
        path.endsWith('access.html') ||
        path.endsWith('retention.html');
}

/**
 * Check if current page is member portal
 */
function isMemberPortalPage() {
    return window.location.pathname.endsWith('member-portal.html');
}

/**
 * LOBBY GUARD: Require org context before accessing system pages.
 * Must be called at the start of every system page's DOMContentLoaded.
 * If no org has been selected from the lobby, redirect there.
 * Returns true if org context exists, false if redirecting.
 */
function requireOrgContext() {
    // Pages that don't need org context
    if (isPublicPage() || isLobbyPage() || isOnboardingPage() || isPaymentPage() || isBlockedPage()) {
        return true;
    }

    const orgId = localStorage.getItem('current_org_id');
    if (!orgId) {
        // No org selected — force user through the lobby
        console.log('[Auth] No org context found, redirecting to lobby');
        window.location.href = CONFIG.ROUTES.LOBBY;
        return false;
    }
    return true;
}

/**
 * Show trial expiry warning banner
 */
function showTrialWarning(daysLeft) {
    const msg = daysLeft <= 1
        ? '⚠️ Tu período de prueba termina hoy. Suscribite para seguir usando Veltronik.'
        : `⚠️ Tu período de prueba vence en ${daysLeft} días. Suscribite para no perder acceso.`;

    if (typeof showToast === 'function') {
        showToast(msg, 'warning', 10000);
    }
}

/**
 * Show grace period warning banner
 */
function showGracePeriodWarning(daysLeft) {
    const msg = daysLeft <= 1
        ? '🚨 Último día para regularizar tu pago. Tu cuenta será bloqueada mañana.'
        : `🚨 Pago rechazado. Tenés ${daysLeft} días para actualizar tu método de pago antes de que se bloquee tu cuenta.`;

    if (typeof showToast === 'function') {
        showToast(msg, 'error', 15000);
    }
}

/**
 * Show payment warning toast
 */
function showPaymentWarning() {
    if (typeof showToast === 'function') {
        showToast('⚠️ Tu suscripción está vencida. Por favor, actualiza tu método de pago.', 'warning', 10000);
    }
}

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();

    const form = event.target;
    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Validación básica
    if (!email || !password) {
        showToast('Por favor completa todos los campos', 'error');
        return;
    }

    try {
        // Disable button and show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Ingresando...';

        await signIn(email, password);

        // Siempre ir al lobby después del login
        window.location.href = CONFIG.ROUTES.LOBBY;
        return;

    } catch (error) {
        console.error('Login error:', error);
        showToast(getAuthErrorMessage(error), 'error');

        // Reset button
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Iniciar Sesión';
    }
}

/**
 * Handle register form submission
 */
async function handleRegister(event) {
    event.preventDefault();

    const form = event.target;
    const fullName = form.querySelector('#fullName').value.trim();
    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;
    const confirmPassword = form.querySelector('#confirmPassword').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Validar campos requeridos
    if (!fullName) {
        showToast('Por favor ingresa tu nombre completo', 'error');
        return;
    }

    if (!email) {
        showToast('Por favor ingresa tu email', 'error');
        return;
    }

    // Validar formato de email básico
    if (!email.includes('@') || !email.includes('.')) {
        showToast('Por favor ingresa un email válido', 'error');
        return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }

    // Validate password strength
    if (password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    try {
        // Disable button and show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Registrando...';

        await signUp(email, password, fullName);

        showToast('¡Cuenta creada! Redirigiendo...', 'success');

        // Redirect to lobby
        setTimeout(() => {
            window.location.href = CONFIG.ROUTES.LOBBY;
        }, 1500);

    } catch (error) {
        console.error('Register error:', error);
        showToast(getAuthErrorMessage(error), 'error');

        // Reset button
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Crear Cuenta';
    }
}

/**
 * Handle Google login
 */
async function handleGoogleLogin() {
    try {
        await signInWithGoogle();
    } catch (error) {
        console.error('Google login error:', error);
        showToast('Error al iniciar sesión con Google', 'error');
    }
}

/**
 * Get user-friendly error message
 */
function getAuthErrorMessage(error) {
    const message = error.message || error.toString();

    if (message.includes('Invalid login credentials')) {
        return 'Email o contraseña incorrectos';
    }
    if (message.includes('User already registered')) {
        return 'Este email ya está registrado';
    }
    if (message.includes('Email not confirmed')) {
        return 'Por favor confirma tu email antes de iniciar sesión';
    }
    if (message.includes('Password should be')) {
        return 'La contraseña debe tener al menos 6 caracteres';
    }
    if (message.includes('Unable to validate email')) {
        return 'Email inválido';
    }

    return 'Error de autenticación. Intenta de nuevo.';
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        // Clear platform state first
        if (typeof clearPlatformState === 'function') {
            clearPlatformState();
        }
        await signOut();
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect anyway
        window.location.href = CONFIG.ROUTES.LOGIN;
    }
}

/**
 * Handle forgot password - sends password reset email
 */
async function handleForgotPassword() {
    const email = document.getElementById('email')?.value?.trim();

    if (!email) {
        showToast('Por favor ingresa tu email primero', 'warning');
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showToast('Por favor ingresa un email válido', 'error');
        return;
    }

    try {
        const client = getSupabase();
        const redirectUrl = window.location.origin + '/reset-password.html';

        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });

        if (error) throw error;

        showToast('Si el email existe, recibirás instrucciones para recuperar tu contraseña', 'success', 5000);

    } catch (error) {
        console.error('Forgot password error:', error);
        // Don't reveal if email exists or not for security
        showToast('Si el email existe, recibirás instrucciones para recuperar tu contraseña', 'success', 5000);
    }
}
