import apiClient from '../lib/apiClient';

/**
 * Servicio de la suscripción del SaaS (cobro con tarjeta + estado de facturación).
 *
 * NOTA: el CRUD genérico que vivía acá (/gym/subscriptions) apuntaba a endpoints que
 * NO existen en el backend y no tenía consumidores — era código muerto y se eliminó.
 */
class SubscriptionService {
  /**
   * Cobro "poné la tarjeta y listo": manda el token de la tarjeta (ya tokenizada por el
   * Card Payment Brick de MP) + el email, y el backend crea la suscripción autorizada.
   * @param {{card_token: string, payer_email: string}} payload
   */
  async subscribeWithCard(payload) {
    const response = await apiClient.post('/billing/subscribe-card', payload);
    return response.data;
  }

  /**
   * Estado de facturación del tenant en curso (para el polling de la UX de pago).
   * @returns {{state:'processing'|'active'|'rejected'|'none', detail:string|null, periodEnd:string|null, payerEmail:string|null}}
   */
  async getBillingStatus() {
    const response = await apiClient.get('/billing/status');
    return response.data;
  }
}

export const subscriptionService = new SubscriptionService();
