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

  /**
   * Socios que entraron por QR y necesitan que alguien les hable.
   *
   * La pantalla del mostrador la consulta cada 20 segundos, así que va con timeout corto: si
   * no llegó, no pasa nada — vuelve a intentar en el próximo ciclo, y mientras tanto no puede
   * colgar la pantalla donde hay gente esperando.
   */
  async getAvisos() {
    const response = await apiClient.get('/gym/access/avisos', { timeout: 8000 });
    return response.data;
  }

  /** "Ya lo hablé con él": saca el aviso en TODAS las terminales, no solo en esta. */
  async marcarAvisoVisto(accesoId) {
    await apiClient.post(`/gym/access/avisos/${accesoId}/visto`);
  }
}

export const accessService = new AccessService();
