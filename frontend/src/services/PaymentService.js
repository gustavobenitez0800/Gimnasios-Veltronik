import apiClient from '../lib/apiClient';

class PaymentService {
  async getAll() {
    const response = await apiClient.get('/gym/payments');
    return response.data;
  }

  async getByMemberId(memberId) {
    const response = await apiClient.get(`/gym/payments/member/${memberId}`);
    return response.data;
  }

  async getAllPayments(dateFrom, dateTo) {
    // El filtrado por fecha lo hace el BACKEND (params opcionales from/to).
    // Sin fechas, el endpoint devuelve todos (compatibilidad).
    const params = {};
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    const response = await apiClient.get('/gym/payments', { params });
    return response.data;
  }

  async createPayment(data) {
    const response = await apiClient.post('/gym/payments', data);
    return response.data;
  }

  async update(id, updates) {
    const response = await apiClient.put(`/gym/payments/${id}`, updates);
    return response.data;
  }

  async deletePayment(id) {
    await apiClient.delete(`/gym/payments/${id}`);
    return true;
  }

  /**
   * Socios que pagaron más allá de la fecha hasta la que figuran cubiertos.
   *
   * Son los que dejó el bug de los dos pasos: el pago entraba y la request que le corría
   * el vencimiento al socio fallaba en silencio. Lista vacía = no hay nada que revisar.
   */
  async getCoverageGaps() {
    const response = await apiClient.get('/gym/payments/coverage-gaps');
    return response.data || [];
  }

  /** Corrige a UN socio: le pone la fecha hasta la que realmente pagó. */
  async fixCoverageGap(memberId) {
    const response = await apiClient.post(`/gym/payments/coverage-gaps/${memberId}/fix`);
    return response.data?.membershipEnd || null;
  }
}

export const paymentService = new PaymentService();
