import apiClient from '../lib/apiClient';

/**
 * Servicio de Grupos de Sucursales. Organiza el lobby cuando el dueño tiene
 * varias sucursales/rubros. Todo el filtrado de propiedad lo hace el backend.
 */
class GroupService {
  async getMyGroups() {
    const response = await apiClient.get('/tenants/groups');
    return response.data;
  }

  async createGroup(data) {
    const response = await apiClient.post('/tenants/groups', data);
    return response.data;
  }

  async updateGroup(groupId, data) {
    const response = await apiClient.put(`/tenants/groups/${groupId}`, data);
    return response.data;
  }

  async deleteGroup(groupId) {
    await apiClient.delete(`/tenants/groups/${groupId}`);
    return true;
  }

  /** Asigna una sucursal a un grupo (groupId=null la desagrupa). */
  async assignToGroup(tenantId, groupId) {
    await apiClient.put(`/tenants/groups/assign/${tenantId}`, { groupId: groupId || null });
    return true;
  }
}

export const groupService = new GroupService();
