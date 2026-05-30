// ============================================
// VELTRONIK - AUTHENTICATED API HELPER
// ============================================
// Centralizes all calls to the backend API
// Migrated to Java API (apiClient)
// ============================================

import apiClient from './apiClient';

/**
 * Make an authenticated fetch call to the Veltronik API.
 * 
 * @param {string} endpoint - API endpoint path, e.g. '/api/create-subscription'
 * @param {object} body - Request body
 */
export async function apiCall(endpoint, body = {}) {
  try {
    const response = await apiClient.post(endpoint, body);
    return {
      ok: true,
      status: 200,
      data: response.data,
    };
  } catch (error) {
    console.error(`[API Error] ${endpoint}:`, error);
    return {
      ok: false,
      status: error.response?.status || 500,
      data: { error: 'Error de conexión', details: error.message },
    };
  }
}
