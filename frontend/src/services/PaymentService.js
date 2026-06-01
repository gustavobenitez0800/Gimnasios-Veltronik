import apiClient from '../lib/apiClient';

class PaymentService {
  async getAll() {
    const response = await apiClient.get('/gym/payments');
    return response.data;
  }

  async getByFilters(filters) {
    // Si el backend no tiene endpoints de filtrado complejos, traemos todos y filtramos,
    // o mandamos params. Por ahora, get(..., {params: filters})
    const response = await apiClient.get('/gym/payments', { params: filters });
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
}

export const paymentService = new PaymentService();
