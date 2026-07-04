// ============================================
// VELTRONIK - CASHIER SERVICE (Fase 1: cajeros con PIN)
// ============================================
// Cajeros del mostrador: operan con PIN, sin cuenta de Google. El dueño los
// gestiona acá (nube) y el sync los baja al local — el login diario del
// ladrillo 6 funcionará sin internet. El PIN jamás vuelve del backend.

import apiClient from '../lib/apiClient';

export const cashierService = {
  async list() {
    const res = await apiClient.get('/core/cashiers');
    return res.data?.data || [];
  },

  /** @param {{name: string, pin: string, role?: 'CAJERO'|'ENCARGADO'}} payload */
  async create({ name, pin, role = 'CAJERO' }) {
    const res = await apiClient.post('/core/cashiers', { name, pin, role });
    return res.data?.data;
  },

  async resetPin(cashierId, pin) {
    await apiClient.post(`/core/cashiers/${cashierId}/reset-pin`, { pin });
  },

  async setActive(cashierId, active) {
    await apiClient.post(`/core/cashiers/${cashierId}/${active ? 'activate' : 'deactivate'}`);
  },
};
