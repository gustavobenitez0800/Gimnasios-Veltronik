import apiClient from '../lib/apiClient';
import { encolar, vaciar, cuantosPendientes } from '../lib/colaAccesos';

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

  /**
   * Registra el paso de un socio. Anda con internet y sin internet.
   *
   * <p>Con conexión manda y devuelve lo que el servidor decidió. Sin conexión guarda el
   * acceso en la cola y devuelve {@code {encolado: true}}: la pantalla tiene que decir
   * "guardado", no inventar si fue entrada o salida. Esa la decide el servidor mirando el
   * estado del socio, y adivinarla acá es exactamente el bug que ya apareció dos veces.</p>
   *
   * <p>Va SIEMPRE con sello y con la hora del hecho, incluso online: si la respuesta se
   * pierde en el camino —el pedido llegó pero la contestación no— el reintento desde la
   * cola se reconoce como repetido en vez de invertir la visita.</p>
   */
  async checkIn(memberId, accessMethod = 'manual', memberName = '') {
    const clientRef = crypto.randomUUID();
    const ocurridoEn = new Date().toISOString();

    try {
      const response = await apiClient.post('/gym/access/register', {
        memberId, method: accessMethod, clientRef, ocurridoEn,
      });
      return response.data;
    } catch (error) {
      // Si el servidor CONTESTÓ rechazando, encolar no arregla nada: el reintento va a
      // fallar igual. Solo se encola cuando no hubo respuesta (sin red, timeout) o cuando
      // el servidor está caído, que sí se arregla solo.
      const status = error?.response?.status;
      const vaAServirDeNuevo = !status || status >= 500 || status === 408 || status === 429;
      if (!vaAServirDeNuevo) throw error;

      await encolar({ memberId, method: accessMethod, memberName, ocurridoEn });
      return { encolado: true, clientRef, ocurridoEn };
    }
  }

  /** Manda lo que haya esperando. Devuelve cuántos salieron y cuántos quedan. */
  async sincronizarPendientes() {
    return vaciar((item) => apiClient.post('/gym/access/register', {
      memberId: item.memberId,
      method: item.method,
      clientRef: item.clientRef,
      ocurridoEn: item.ocurridoEn,
    }));
  }

  /** Cuántos accesos esperan a que vuelva internet. */
  async pendientesDeEnviar() {
    return cuantosPendientes();
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
