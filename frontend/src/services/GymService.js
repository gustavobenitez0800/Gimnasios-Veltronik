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
   * businessType es OBLIGATORIO para el backend (@NotNull en TenantDTO): si el caller
   * no lo manda (Ajustes solo edita nombre/dirección/teléfono/email), lo completamos
   * con el tipo actual del negocio. Sin este fallback, guardar Ajustes devolvía 400
   * "El tipo de negocio es obligatorio".
   */
  async updateCurrent(updates) {
    const orgId = localStorage.getItem('current_org_id');
    if (!orgId) throw new Error('No org selected');

    const businessType = updates.businessType
      || updates.type
      || localStorage.getItem('current_org_type')
      || 'GYM';

    const payload = {
      name: updates.name,
      address: updates.address,
      phone: updates.phone,
      email: updates.email,
      businessType,
    };

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
      localStorage.removeItem('current_org_type');
    }

    return true;
  }
}

export const gymService = new GymService();
