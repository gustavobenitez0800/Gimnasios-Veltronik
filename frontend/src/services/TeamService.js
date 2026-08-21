import apiClient from '../lib/apiClient';

/**
 * Servicio de Equipo.
 * Migrado de TeamFacade (Supabase RPC) a API Java REST.
 */
class TeamService {
  async getTeamMembers() {
    const response = await apiClient.get('/gym/team');
    return response.data;
  }

  async getActivityLog(limit = 50) {
    const response = await apiClient.get('/gym/team/activity', { params: { limit } });
    return response.data;
  }

  /**
   * Suma a alguien al equipo. Si no tiene cuenta en Veltronik, el backend se la crea.
   *
   * @returns el miembro agregado. Cuando la cuenta se acaba de crear, trae además
   *   `accountCreated: true` y `temporaryPassword` — que viaja UNA sola vez: no queda
   *   guardada en ningún lado legible, así que si no se copia hay que resetearla.
   */
  async inviteMember(email, role, fullName) {
    const response = await apiClient.post('/gym/team/invite', { email, role, fullName });
    return response.data;
  }

  async updateRole(targetUserId, newRole) {
    const response = await apiClient.put(`/gym/team/${targetUserId}/role`, { role: newRole });
    return response.data;
  }

  async removeMember(targetUserId) {
    await apiClient.delete(`/gym/team/${targetUserId}`);
    return true;
  }
}

export const teamService = new TeamService();
