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
   * TODO lo del mostrador en UN pedido: quién está adentro, qué pasó hoy y los avisos.
   *
   * Antes eran tres viajes de ida y vuelta, repetidos cada quince segundos. Sobre la conexión
   * de un gimnasio eso se siente exactamente como "el sistema va lento". Y además llegaban con
   * segundos de diferencia entre sí, así que alguien podía aparecer en una lista y no en la otra.
   */
  async getMostrador(opts = {}) {
    const response = await apiClient.get('/gym/access/mostrador', { timeout: 8000, ...opts });
    return response.data;
  }

  /** "Ya lo hablé con él": saca el aviso en TODAS las terminales, no solo en esta. */
  async marcarAvisoVisto(accesoId) {
    await apiClient.post(`/gym/access/avisos/${accesoId}/visto`);
  }
}

export const accessService = new AccessService();
