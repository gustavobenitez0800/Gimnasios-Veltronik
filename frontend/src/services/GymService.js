// ============================================
// VELTRONIK V2 - GYM SERVICE (Tenant API)
// ============================================

import apiClient from '../lib/apiClient';

class GymService {
  /**
   * Obtiene la configuración del gimnasio actual (Tenant).
   * Java API: GET /tenants/{orgId}
   */
  async getCurrent() {
    const orgId = localStorage.getItem('current_org_id');
    if (!orgId) return null;

    const response = await apiClient.get(`/tenants/${orgId}`);
    return response.data;
  }

  /**
   * Actualiza el gimnasio actual.
   * Java API: PUT /tenants/{orgId}
   *
   * Acá vivía un truco: el backend exigía `businessType` (@NotNull) en CADA guardado,
   * así que este método lo reconstruía del localStorage para que Ajustes —que solo
   * edita nombre, dirección, teléfono y email— no muriera con un 400. Ese campo salió
   * del contrato: el rubro lo fija el servidor al crear el gimnasio y no se toca más.
   *
   * `logoUrl` / `logoEmoji` solo se mandan si el caller los incluye: así una pantalla
   * que edita el teléfono no puede borrarle el logo al gimnasio sin querer.
   */
  async updateCurrent(updates) {
    const orgId = localStorage.getItem('current_org_id');
    if (!orgId) throw new Error('No org selected');

    const payload = {
      name: updates.name,
      address: updates.address,
      phone: updates.phone,
      email: updates.email,
    };
    if ('logoUrl' in updates) payload.logoUrl = updates.logoUrl;
    if ('logoEmoji' in updates) payload.logoEmoji = updates.logoEmoji;

    const response = await apiClient.put(`/tenants/${orgId}`, payload);
    return response.data;
  }

  /**
   * Obtiene todos los gimnasios asociados al usuario logueado.
   * Java API: GET /tenants/my
   */
  async getUserGyms() {
    try {
      const response = await apiClient.get('/tenants/my');
      return response.data;
    } catch (error) {
      console.error('getUserGyms error:', error);
      return [];
    }
  }

  /**
   * Elimina un gimnasio (Tenant) y todo su contenido en cascada.
   * Java API: DELETE /tenants/{orgId}
   */
  async deleteOrg(orgId) {
    if (!orgId) throw new Error('No org ID provided');

    await apiClient.delete(`/tenants/${orgId}`);

    // Limpieza local
    if (localStorage.getItem('current_org_id') === orgId) {
      localStorage.removeItem('current_org_id');
      localStorage.removeItem('current_org_role');
      localStorage.removeItem('current_org_name');
    }

    return true;
  }
}

export const gymService = new GymService();
