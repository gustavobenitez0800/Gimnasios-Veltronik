// ============================================
// VELTRONIK - AUTH SERVICE
// ============================================

import supabase from './base/SupabaseClient';

class AuthService {
  constructor() {
    this.client = supabase;
  }

  async signUp(email, password, fullName = '') {
    const baseUrl = window.location.origin;
    const redirectUrl = `${baseUrl}/#/`;

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async signInWithGoogle() {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/#/lobby`,
      },
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    this.clearPlatformState();
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async getCurrentUser() {
    const { data: { user }, error } = await this.client.auth.getUser();
    if (error) throw error;
    return user;
  }

  async getSession() {
    const { data: { session }, error } = await this.client.auth.getSession();
    if (error) throw error;
    return session;
  }

  onAuthStateChange(callback) {
    return this.client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }

  clearPlatformState() {
    localStorage.removeItem('current_org_id');
    localStorage.removeItem('current_org_role');
    localStorage.removeItem('current_org_name');
    localStorage.removeItem('current_org_type');
  }
}

export const authService = new AuthService();
