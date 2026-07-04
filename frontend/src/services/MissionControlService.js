// ============================================
// VELTRONIK - MISSION CONTROL SERVICE (V3, ladrillo 7)
// ============================================
// La consola del FUNDADOR: flota cross-tenant + publicación del rollout por anillos.
// Todos los endpoints son founder-gated en el backend (403 si no sos fundador).

import apiClient from '../lib/apiClient';

export const missionControlService = {
  /** ¿El usuario actual es fundador? (para mostrar o no la consola). */
  async access() {
    const res = await apiClient.get('/hq/access');
    return !!res.data?.founder;
  },

  /** Toda la flota (todos los negocios). */
  async fleet() {
    const res = await apiClient.get('/hq/fleet');
    return res.data?.data || [];
  },

  /** Versiones objetivo publicadas por anillo: { '0': '2.7.0', ... }. */
  async rollout() {
    const res = await apiClient.get('/hq/rollout');
    return res.data?.data || {};
  },

  /** Publica la versión objetivo de un anillo (promover). */
  async setRollout(ring, targetVersion) {
    await apiClient.post('/hq/rollout', { ring, targetVersion });
  },
};
