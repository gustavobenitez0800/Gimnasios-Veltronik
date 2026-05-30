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

  async getAllPayments() {
    const response = await apiClient.get('/gym/payments');
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
