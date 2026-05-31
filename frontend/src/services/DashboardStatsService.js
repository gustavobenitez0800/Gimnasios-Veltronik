import apiClient from '../lib/apiClient';

class DashboardStatsService {
  async getDashboardStats() {
    const response = await apiClient.get('/gym/dashboard/stats');
    return response.data;
  }

  async getRetentionAnalytics() {
    const response = await apiClient.get('/gym/dashboard/retention');
    return response.data;
  }
}

export const dashboardStatsService = new DashboardStatsService();
