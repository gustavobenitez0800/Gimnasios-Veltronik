// ============================================
// VELTRONIK V2 - AUTH SERVICE (Supabase IdP)
// ============================================

import { supabase } from '../lib/supabase';
import CONFIG from '../lib/config';
import { readAuthCode } from '../lib/authCode';
import { startGoogleSignIn, canUseBrowserSignIn } from '../lib/desktopAuth';

/** ¿La app corre dentro de Electron? (mismo criterio que lib/connection.js) */
function inElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * Base pública para armar links de retorno (reset password, OAuth).
 * En la web es el propio origin. En Electron la app se sirve por file:// —
 * un redirect ahí no existe para el navegador — así que SIEMPRE usamos la
 * URL web canónica (Vercel): el usuario termina el flujo en el navegador.
 */
function publicWebBase() {
  if (inElectron() || window.location.protocol === 'file:') {
    return CONFIG.PUBLIC_WEB_URL.replace(/\/+$/, '');
  }
  return `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, '');
}

class AuthService {
  
  async signUp(email, password, fullName = '') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: fullName.split(' ')[0] || '',
          last_name: fullName.split(' ').slice(1).join(' ') || ''
        }
      }
    });

    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }

  /**
   * Login con Google (OAuth vía Supabase).
   *
   * Dos caminos, según el envase:
   *
   * · WEB — redirect normal de toda la vida. `redirectTo` explícito: sin él, Supabase usa
   *   su Site URL por defecto y el usuario terminaba en cualquier lado.
   *
   * · ESCRITORIO (Fase 2) — la app se sirve por file:// y ahí Google no puede redirigir
   *   de vuelta; ese era el motivo de que el botón estuviera escondido en Electron. Ahora
   *   el login sale al navegador del sistema y vuelve por `veltronik://` (ver
   *   lib/desktopAuth.js). Esta llamada solo ABRE el navegador: la sesión aparece después,
   *   cuando llega el deep link — por eso no devuelve nada útil y quien la llama no debe
   *   asumir que ya hay usuario.
   */
  async signInWithGoogle() {
    if (CONFIG.IS_DESKTOP) {
      if (!canUseBrowserSignIn()) {
        throw new Error('Esta ventana no puede abrir el navegador para completar el login.');
      }
      await startGoogleSignIn();
      return { pendingBrowserSignIn: true };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${publicWebBase()}/#${CONFIG.ROUTES.LOBBY}` },
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    // OJO: acá NO se dispara 'auth-unauthorized'. Ese evento significa "el backend
    // rechazó el token" y su handler en AuthContext es logout() → dispararlo desde
    // el propio signOut creaba un bucle logout → signOut → evento → logout... que
    // encadenaba recargas y crasheaba al cerrar sesión para cambiar de cuenta.
    this.clearPlatformState();
    await supabase.auth.signOut();
  }

  /**
   * Envía el email de recuperación de contraseña (Supabase Auth).
   * El link del email lleva SIEMPRE a la página web de /reset-password (con PKCE,
   * llega con "?code=..." y la página lo canjea por la sesión de recuperación).
   * Desde Electron también: el usuario cambia la clave en el navegador y vuelve
   * a la app a iniciar sesión — un redirect a file:// no existe.
   */
  async resetPassword(email) {
    const redirectTo = `${publicWebBase()}/#${CONFIG.ROUTES.RESET_PASSWORD}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return true;
  }

  /**
   * Canjea el "?code=..." del link de recuperación (PKCE) por una sesión activa.
   * Devuelve true si había código y el canje funcionó. El parseo (el código puede venir
   * en el search real o adentro del hash) vive en lib/authCode.js: lo comparte con el
   * login de escritorio, que tiene exactamente el mismo problema.
   */
  async exchangeRecoveryCode() {
    const code = readAuthCode(window.location.href);
    if (!code) return false;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  /** Define la nueva contraseña (usuario ya autenticado por el link de recuperación). */
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
  }

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');
    return user;
  }

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session found');
    return session;
  }

  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    const handleUnauthorized = () => callback('SIGNED_OUT', null);
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    
    return {
      unsubscribe: () => {
        subscription.unsubscribe();
        window.removeEventListener('auth-unauthorized', handleUnauthorized);
      }
    };
  }

  clearPlatformState() {
    localStorage.removeItem('current_org_id');
    localStorage.removeItem('current_org_role');
    localStorage.removeItem('current_org_name');
  }
}

export const authService = new AuthService();
