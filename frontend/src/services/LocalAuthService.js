// ============================================
// VELTRONIK - LOCAL AUTH SERVICE (V3, ladrillo 6)
// ============================================
// Login del cajero por PIN contra el CEREBRO LOCAL. apiClient ya está en modo
// local (baseURL = 127.0.0.1) cuando esto corre.

import apiClient from '../lib/apiClient';

export const localAuthService = {
  /** Estado del cerebro local (mode, ready, tenantId). */
  async status() {
    const res = await apiClient.get('/local/status');
    return res.data;
  },

  /**
   * Canjea el PIN por un token de sesión local.
   * @returns {{token: string, expiresInSeconds: number, cashier: {id,name,role}}}
   */
  async login(pin) {
    const res = await apiClient.post('/local/login', { pin });
    return res.data;
  },
};
