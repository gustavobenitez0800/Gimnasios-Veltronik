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

  async inviteMember(email, role) {
    const response = await apiClient.post('/gym/team/invite', { email, role });
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
