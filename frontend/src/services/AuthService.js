// ============================================
// VELTRONIK V2 - AUTH SERVICE (Supabase IdP)
// ============================================

import { supabase } from '../lib/supabase';

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

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
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
   * El link del email lleva a /reset-password, donde el usuario define la nueva clave.
   * redirectTo apunta al hash router de la app (sirve en web y en el dominio configurado).
   */
  async resetPassword(email) {
    const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
    localStorage.removeItem('current_org_type');
  }
}

export const authService = new AuthService();
