import apiClient from '../lib/apiClient';
import { refrescarSocios } from '../lib/localMembers';
import { avisarCambioDeCobertura } from '../lib/molinete';
import {
  encolarPendiente, disponible, nuevoSello, momentoLocal, cuantosPendientes,
} from '../lib/colaAccesos';

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

  /**
   * ⭐ COBRAR. Con internet va derecho; sin internet, a la cola.
   *
   * <p>Misma forma que `AccessService.checkIn`, pero acá lo que está en juego es plata, así que
   * conviene decir en qué se diferencia.</p>
   *
   * <p><b>⚠️ EL SELLO SE GENERA ANTES DE INTENTAR, Y VIAJA TAMBIÉN EN EL PEDIDO ONLINE.</b>
   * Cierra el agujero del momento ambiguo: el pedido salió, el servidor lo guardó, y la
   * respuesta se perdió en el camino de vuelta. Sin el sello encolaríamos un cobro NUEVO — y un
   * cobro repetido no es una fila de más: el período arranca donde termina la cobertura vigente
   * del socio, así que la segunda copia arrancaría donde terminó la primera. <b>El socio se
   * lleva 30 días gratis y el ingreso queda contado dos veces en el arqueo.</b></p>
   *
   * <p><b>Y el momento viaja como `paymentDate`.</b> No es decorativo: decide en qué día cae el
   * cobro, y por lo tanto si el cierre de caja lo cuenta o no. Un cobro hecho a las 22:00 que
   * sube al otro día tiene que seguir siendo del día que fue. Si quien llama trajo su propia
   * fecha —el portal web deja elegirla— se respeta.</p>
   *
   * @returns lo que devolvió el servidor, o `{encolado: true}` si quedó guardado para después.
   */
  async createPayment(data) {
    const clientRef = nuevoSello();
    const ocurridoEn = momentoLocal();
    const cuerpo = { ...data, clientRef, paymentDate: data?.paymentDate || ocurridoEn };
    const paraLaCola = { ...cuerpo, tipo: 'COBRO', ocurridoEn };

    // ⚠️ SI HAY ALGO ESPERANDO, ESTE TAMBIÉN ESPERA. La cola es una sola y el orden vale
    // entre tipos: adelantarse por la puerta lateral de la escritura directa rompería el orden
    // global igual que lo rompía con los accesos.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (disponible() && (sinRed || (await cuantosPendientes()) > 0)) {
      const ref = await encolarPendiente(paraLaCola);
      if (ref) return { encolado: true, clientRef: ref };
    }

    try {
      const response = await apiClient.post('/gym/payments', cuerpo);
      this.#refrescarEspejo();
      return response.data;
    } catch (error) {
      // Si el SERVIDOR contestó, no es un problema de conexión: es un rechazo real y hay que
      // mostrarlo. Encolarlo sería reintentar para siempre algo que ya dijo que no.
      if (error?.response || !disponible()) throw error;

      const ref = await encolarPendiente(paraLaCola);
      if (!ref) throw error; // no hay dónde guardarlo: que falle como antes, sin mentir
      return { encolado: true, clientRef: ref };
    }
  }

  /**
   * Manda UN cobro que estaba en la cola. Lo usa el vaciado, de a uno y en orden.
   *
   * <p>Se sacan los campos que son de la COLA y no del cobro: el servidor no sabe qué es
   * `intentos` ni `creadoEn`, y el momento ya viaja adentro como `paymentDate`.</p>
   */
  async enviarEncolado(item) {
    // eslint-disable-next-line no-unused-vars
    const { tipo, ocurridoEn, intentos, ultimoError, creadoEn, tenantId, ...cuerpo } = item;
    const response = await apiClient.post('/gym/payments', cuerpo);
    this.#refrescarEspejo();
    return response.data;
  }

  /**
   * Cobrar corre el vencimiento del socio, así que la copia local quedó vieja justo en el dato
   * que más importa: sin esto, el socio que ACABA de pagar sigue apareciendo vencido en el
   * buscador de al lado.
   *
   * <p>⚠️ Sin internet esto no puede pasar, y por eso la pantalla de Acceso mira aparte si el
   * socio tiene un cobro esperando en la cola. Refrescar acá y "arreglar" el vencimiento a mano
   * del lado del terminal serían dos cuentas de la misma cobertura, que es exactamente el error
   * que este proyecto ya cometió con las fechas.</p>
   */
  #refrescarEspejo() {
    const tenantId = localStorage.getItem('current_org_id');
    if (tenantId) refrescarSocios(tenantId).catch(() => {});

    // Y el molinete quedó viejo en lo mismo: el socio que acaba de pagar camina hasta la
    // puerta en veinte segundos, y la puerta no puede seguir diciéndole que no.
    //
    // ⭐ Vive ACÁ y no en `createPayment` —que es donde estaba— porque este método lo llaman
    // los DOS caminos: el cobro directo y el que estuvo esperando en la cola. Así, un cobro
    // hecho sin internet también le avisa a la puerta cuando finalmente sube.
    avisarCambioDeCobertura();
  }

  async update(id, updates) {
    const response = await apiClient.put(`/gym/payments/${id}`, updates);
    // Marcar un pago como cobrado corre el vencimiento igual que cobrarlo de cero.
    avisarCambioDeCobertura();
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
    // Corregir a un socio que pagó y figuraba vencido también le abre la puerta.
    avisarCambioDeCobertura();
    return response.data?.membershipEnd || null;
  }
}

export const paymentService = new PaymentService();
