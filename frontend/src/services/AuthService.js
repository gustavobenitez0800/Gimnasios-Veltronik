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
    this.clearPlatformState();
    await supabase.auth.signOut();
    window.dispatchEvent(new Event('auth-unauthorized'));
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
