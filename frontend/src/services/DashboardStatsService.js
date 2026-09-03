import apiClient from '../lib/apiClient';

class DashboardStatsService {
  async getDashboardStats() {
    const response = await apiClient.get('/gym/dashboard/stats');
    return response.data;
  }

  /**
   * Todo el Dashboard en un pedido, ya resumido por el servidor.
   *
   * ⭐ Reemplaza al trío que se hacía en cada apertura (stats + TODOS los socios + TODOS los
   * pagos). Con 385 socios y un año de cobros eran miles de filas para pintar cuatro números.
   */
  async getResumen() {
    const response = await apiClient.get('/gym/dashboard/resumen');
    return response.data;
  }

  async getRetentionAnalytics() {
    const response = await apiClient.get('/gym/dashboard/retention');
    return response.data;
  }
}

export const dashboardStatsService = new DashboardStatsService();
