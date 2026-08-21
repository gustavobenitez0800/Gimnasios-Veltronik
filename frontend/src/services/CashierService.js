// ============================================
// VELTRONIK - PERSONAS DEL MOSTRADOR (cajeros)
// ============================================
// No son usuarios: no tienen cuenta ni inician sesión. La sesión la tiene el terminal;
// esto solo dice quién está en el turno, para que cada movimiento quede firmado.

import apiClient from '../lib/apiClient';

export const cashierService = {
  /** A quién se le puede marcar turno (solo activos, solo id y nombre). */
  async listActive() {
    const res = await apiClient.get('/core/cashiers/active');
    return res.data || [];
  },

  /**
   * Abre el turno si el PIN es correcto.
   * Tira error con el mensaje del backend si no coincide o si hay demasiados intentos.
   */
  async startShift(cashierId, pin) {
    const res = await apiClient.post(`/core/cashiers/${cashierId}/shift`, { pin });
    return res.data;
  },

  // ── Gestión (dueño / admin) ─────────────────────────────────────────────────

  /** Todas las personas, incluidas las dadas de baja. */
  async list() {
    const res = await apiClient.get('/core/cashiers');
    return res.data || [];
  },

  async create(name, pin) {
    const res = await apiClient.post('/core/cashiers', { name, pin });
    return res.data;
  },

  /** Cambia el PIN. El anterior no se puede ver: no existe en ningún lado legible. */
  async changePin(cashierId, pin) {
    await apiClient.put(`/core/cashiers/${cashierId}/pin`, { pin });
  },

  async rename(cashierId, name) {
    await apiClient.put(`/core/cashiers/${cashierId}/name`, { name });
  },

  /** Baja lógica: nunca borra, para que los movimientos viejos sigan teniendo autor. */
  async setActive(cashierId, active) {
    await apiClient.put(`/core/cashiers/${cashierId}/active`, { active });
  },
};
