// ============================================
// GIMNASIO VELTRONIK - AUTH CONTROLLER
// ============================================

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

        // Check if user has a gym
        if (!profile.gym_id) {
            // User needs to complete onboarding
            if (!isOnboardingPage()) {
                window.location.href = CONFIG.ROUTES.ONBOARDING;
            }
            return { session, profile, gym: null };
        }

        // Get gym data
        const gym = await getGym();

        if (!gym) {
            console.error('Gym not found');
            window.location.href = CONFIG.ROUTES.ONBOARDING;
            return null;
        }

        // Check gym status and trial
        const isTrialActive = checkTrialStatus(gym);

        switch (gym.status) {
            case CONFIG.GYM_STATUS.PENDING:
                // Check if trial is active
                if (isTrialActive) {
                    // Trial active - allow access to dashboard
                    if (isPublicPage()) {
                        window.location.href = CONFIG.ROUTES.DASHBOARD;
                    }
                } else {
                    // No trial or expired - needs to pay
                    if (!isPaymentPage()) {
                        window.location.href = CONFIG.ROUTES.PLANS;
                    }
                }
                break;

            case CONFIG.GYM_STATUS.ACTIVE:
                // Check if trial expired and no subscription
                if (!isTrialActive && !gym.subscription_id) {
                    // Trial expired - redirect to payment
                    if (!isPaymentPage()) {
                        window.location.href = CONFIG.ROUTES.PLANS;
                    }
                } else {
                    // All good - allow access to protected pages
                    if (isPublicPage() || isPaymentPage()) {
                        window.location.href = CONFIG.ROUTES.DASHBOARD;
                    }
                }
                break;

            case CONFIG.GYM_STATUS.BLOCKED:
                // Blocked - allow access to payment page to reactivate subscription
                // Otherwise redirect to blocked page
                if (!isBlockedPage() && !isPaymentPage()) {
                    window.location.href = CONFIG.ROUTES.BLOCKED;
                }
                break;
        }

        return { session, profile, gym, isTrialActive };

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
        path.endsWith('settings.html');
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

        // Use proper auth redirect logic to check gym status, trial, etc.
        await checkAuthAndRedirect();

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

        // Redirect to onboarding
        setTimeout(() => {
            window.location.href = CONFIG.ROUTES.ONBOARDING;
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
