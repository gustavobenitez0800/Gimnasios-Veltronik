import apiClient from '../lib/apiClient';

class DashboardStatsService {
  async getDashboardStats() {
    const response = await apiClient.get('/gym/dashboard/stats');
    return response.data;
  }
}

export const dashboardStatsService = new DashboardStatsService();
