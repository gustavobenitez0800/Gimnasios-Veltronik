import apiClient from '../lib/apiClient';

/**
 * Servicio de Control de Acceso.
 * Migrado de BaseService (Supabase) a API Java REST.
 */
class AccessService {

  async getTodayLogs(opts = {}) {
    const response = await apiClient.get('/gym/access/today', opts);
    return response.data;
  }

  async getLogsByDateRange(startDate, endDate) {
    const response = await apiClient.get('/gym/access', {
      params: { start: startDate, end: endDate }
    });
    return response.data;
  }

  async checkIn(memberId, accessMethod = 'manual') {
    const response = await apiClient.post('/gym/access/register', {
      memberId: memberId,
      method: accessMethod
    });
    return response.data;
  }

  async checkOut(accessLogId) {
    const response = await apiClient.put(`/gym/access/${accessLogId}/checkout`);
    return response.data;
  }

  async getCurrentlyCheckedIn(opts = {}) {
    const response = await apiClient.get('/gym/access/active', opts);
    return response.data;
  }
}

export const accessService = new AccessService();
