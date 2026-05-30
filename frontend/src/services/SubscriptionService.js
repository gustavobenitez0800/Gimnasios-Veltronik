import apiClient from '../lib/apiClient';

/**
 * Servicio para gestionar Suscripciones usando la API Java.
 */
class SubscriptionService {
  async getAllSubscriptions() {
    const response = await apiClient.get('/gym/subscriptions');
    return response.data;
  }

  async getSubscriptionById(id) {
    const response = await apiClient.get(`/gym/subscriptions/${id}`);
    return response.data;
  }

  async createSubscription(subscriptionData) {
    const response = await apiClient.post('/gym/subscriptions', subscriptionData);
    return response.data;
  }

  async updateSubscription(id, subscriptionData) {
    const response = await apiClient.put(`/gym/subscriptions/${id}`, subscriptionData);
    return response.data;
  }

  async deleteSubscription(id) {
    await apiClient.delete(`/gym/subscriptions/${id}`);
    return true;
  }
}

export const subscriptionService = new SubscriptionService();
