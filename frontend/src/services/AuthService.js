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

  /**
   * Cierra la sesión de ESTE dispositivo. Los demás siguen adentro.
   *
   * <p>⭐ <b>El `scope: 'local'` es el arreglo más importante de la sesión.</b>
   * `supabase.auth.signOut()` sin parámetros es GLOBAL: revoca la sesión en todos los
   * dispositivos del usuario. Así que el dueño tocaba "Salir" en el celular —o la app
   * expulsaba sola en una máquina— y el mostrador caía al login una hora después, cuando le
   * vencía el token, sin ninguna relación visible con lo que lo había causado. Instagram
   * hace lo contrario: salir en un dispositivo no toca a los demás.</p>
   *
   * <p>OJO: acá NO se dispara 'auth-unauthorized'. Ese evento significa "el backend rechazó
   * el token" y su handler en AuthContext es logout() → dispararlo desde el propio signOut
   * creaba un bucle logout → signOut → evento → logout... que encadenaba recargas.</p>
   */
  async signOut() {
    this.clearPlatformState();
    await supabase.auth.signOut({ scope: 'local' });
  }

  /**
   * Cierra la sesión en TODOS los dispositivos del usuario.
   *
   * <p>Es una acción que alguien ELIGE —un celular perdido, una contraseña que se filtró—,
   * nunca un efecto colateral de salir. Los demás dispositivos no se enteran en el acto: su
   * token de acceso sigue valiendo hasta que vence (como mucho una hora) y ahí la renovación
   * falla y van al login.</p>
   */
  async signOutEverywhere() {
    this.clearPlatformState();
    await supabase.auth.signOut({ scope: 'global' });
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

  /**
   * Los eventos de la sesión, tal como los emite Supabase. Nada más.
   *
   * <p>⚠️ Acá antes se reenviaba el aviso 'auth-unauthorized' (un 401 del backend) como un
   * `SIGNED_OUT` falso. Tenía dos costos: el 401 se atendía dos veces —este SIGNED_OUT y el
   * logout() de AuthContext—, y el único registro de diagnóstico ("[auth] SIGNED_OUT: Supabase
   * dio la sesión por terminada") quedaba MINTIENDO: decía que la cerró Supabase cuando la
   * cerramos nosotros. Cuando alguien reporta "me sacó solo", esa línea tiene que decir la
   * verdad. El 401 ya tiene quien lo atienda.</p>
   */
  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return { unsubscribe: () => subscription.unsubscribe() };
  }

  clearPlatformState() {
    localStorage.removeItem('current_org_id');
    localStorage.removeItem('current_org_role');
    localStorage.removeItem('current_org_name');
  }
}

export const authService = new AuthService();
