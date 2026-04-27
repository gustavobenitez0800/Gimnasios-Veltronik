// ============================================
// VELTRONIK - AUTHENTICATED API HELPER
// ============================================
// Centralizes all calls to the backend API
// ensuring the JWT token is always sent.
// ============================================

import supabase from '../services/base/SupabaseClient';
import CONFIG from './config';

/**
 * Make an authenticated fetch call to the Veltronik API.
 * Automatically injects the current user's JWT token.
 *
 * @param {string} endpoint - API endpoint path, e.g. '/api/create-subscription'
 * @param {object} body - Request body (will be JSON.stringified)
 * @param {object} options - Additional fetch options
 * @returns {Promise<{ok: boolean, data: object}>}
 */
export async function apiCall(endpoint, body = {}, options = {}) {
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${CONFIG.API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...options,
    });

    const data = await response.json();

    return {
      ok: response.ok && data.success !== false,
      status: response.status,
      data,
    };
  } catch (error) {
    console.error(`[API Error] ${endpoint}:`, error);
    return {
      ok: false,
      status: 0,
      data: { error: 'Error de conexión. Verifica tu internet y probá de nuevo.', details: error.message },
    };
  }
}
