import apiClient from '../lib/apiClient';
import { encolar, disponible, nuevoSello, momentoLocal, cuantosPendientes } from '../lib/colaAccesos';

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
   * ⭐ REGISTRAR EL PASO DE UN SOCIO. Con internet va derecho; sin internet, a la cola.
   *
   * <p><b>La regla es escribir derecho y encolar solo como paracaídas</b>, no al revés.
   * Escribir siempre local metería un retraso entre lo que pasa en el gimnasio y lo que el
   * dueño puede ver, a cambio de nada: el mostrador ya es rápido porque lo que era lento
   * eran las LECTURAS, y esas ya salen del espejo.</p>
   *
   * <p><b>⚠️ EL SELLO SE GENERA ANTES DE INTENTAR, Y VIAJA TAMBIÉN EN EL PEDIDO ONLINE.</b>
   * Esto es lo que cierra el agujero del momento ambiguo: el pedido salió, el servidor lo
   * guardó, y la respuesta se perdió en el camino de vuelta. Sin el sello, encolaríamos un
   * acceso NUEVO y el servidor lo procesaría como un segundo paso — y dos pasos del mismo
   * socio no duplican, INVIERTEN: quedaría "afuera" sin haberse ido. Con el mismo sello, el
   * índice único (V54) lo reconoce y devuelve el que ya tenía.</p>
   *
   * <p>Plazo corto a propósito. Que la recepcionista mire un spinner de veinte segundos con
   * un socio esperando es exactamente lo que la copia local vino a matar, y no puede volver
   * a entrar por la puerta de la escritura: a los cinco segundos se deja de esperar, se
   * guarda, y la pantalla lo dice.</p>
   *
   * @returns lo que devolvió el servidor, o `{encolado: true}` si quedó guardado para después.
   */
  async checkIn(memberId, accessMethod = 'manual', memberName = '') {
    const clientRef = nuevoSello();
    const ocurridoEn = momentoLocal();
    const paraLaCola = { memberId, method: accessMethod, memberName, ocurridoEn, clientRef };

    // ⚠️⚠️ SI HAY ALGO ESPERANDO, ESTE TAMBIÉN ESPERA. Y esto es corrección, no prolijidad.
    //
    // La regla del orden decía "se vacía en orden estricto", y eso cubría el orden DENTRO de
    // la cola. Pero escribir derecho abre una puerta lateral: si la conexión vuelve un
    // segundo y este acceso pasa por ahí, se registra ANTES que los que siguen esperando —
    // y el orden global se rompe igual.
    //
    // Lo que pasa entonces no es un detalle: el servidor evalúa cada acceso contra el momento
    // en que ocurrió, así que uno viejo llegando tarde le cierra la salida a una visita que
    // empezó DESPUÉS. Se ve como una visita con la salida antes que la entrada, y un tiempo
    // promedio NEGATIVO en el resumen del día. Se encontró exactamente así.
    //
    // Mientras haya cola, la cola es el único camino. Así el orden se mantiene de punta a
    // punta y no solo de la mitad para adelante.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (disponible() && (sinRed || (await cuantosPendientes()) > 0)) {
      const ref = await encolar(paraLaCola);
      if (ref) return { encolado: true, clientRef: ref };
    }

    try {
      // ⚠️ EL PLAZO CORTO SOLO VALE SI HAY DÓNDE CAER.
      //
      // Cinco segundos existen para no dejar a la recepcionista mirando un spinner: se corta,
      // se encola, y la pantalla lo dice. Pero en el PORTAL WEB no hay cola — cortar a los
      // cinco segundos ahí no la salva de nada, solo le falla antes en una conexión lenta,
      // que es justo el cliente que más necesita que el pedido llegue. Sin cola, se espera lo
      // que el apiClient espera siempre.
      const opciones = disponible() ? { timeout: 5000 } : {};
      const response = await apiClient.post('/gym/access/register', {
        memberId,
        method: accessMethod,
        clientRef,
        ocurridoEn,
      }, opciones);
      return response.data;
    } catch (error) {
      // Si el SERVIDOR contestó, no es un problema de conexión: es un rechazo real y hay
      // que mostrarlo. Encolarlo sería reintentar para siempre algo que ya dijo que no.
      if (error?.response || !disponible()) throw error;

      const ref = await encolar(paraLaCola);
      if (!ref) throw error; // no hay dónde guardarlo: que falle como antes, sin mentir
      return { encolado: true, clientRef: ref };
    }
  }

  /**
   * Manda UN acceso que estaba en la cola. Lo usa el vaciado, de a uno y en orden.
   *
   * <p>Va sin plazo corto a propósito: acá no hay nadie esperando en el mostrador, y darse
   * por vencido rápido solo lograría cortar la tanda antes de tiempo. El que espera es el
   * dato, y el dato puede esperar.</p>
   */
  async enviarEncolado(item) {
    const response = await apiClient.post('/gym/access/register', {
      memberId: item.memberId,
      method: item.method,
      clientRef: item.clientRef,
      ocurridoEn: item.ocurridoEn,
    });
    return response.data;
  }

  /**
   * Marcar la salida. Sin conexión también, pero por otro camino.
   *
   * <p><b>Sin red, marcar la salida es EL MISMO hecho que marcar el paso:</b> se anota el
   * momento y el servidor deduce la dirección contra ese instante. Como el socio tiene una
   * visita abierta, la deduce SALIDA. Por eso va por la misma cola que las entradas, con su
   * sello y su momento, y respeta la misma regla de orden — si hay algo esperando, este
   * también espera, o se registraría antes que accesos que ocurrieron primero.</p>
   *
   * <p><b>⚠️ Y POR ESO MISMO NO SE ENCOLA SI EL PEDIDO YA SALIÓ Y FALLÓ EL TRANSPORTE.</b>
   * Esa es la diferencia con `checkIn`, y es deliberada. El registro de un paso lleva
   * `clientRef`, así que si la respuesta se pierde el servidor reconoce el reintento y no lo
   * procesa dos veces. Este endpoint <b>no lleva sello</b>: si la salida se guardó y la
   * respuesta se perdió, encolar un paso lo haría procesar de nuevo — y con la visita ya
   * cerrada el servidor lo leería como una ENTRADA. El socio quedaría adentro justo después
   * de haberse ido. Ese es el bug que ya apareció dos veces en este proyecto, y no se paga
   * una tercera vez por ahorrarle un mensaje a alguien.</p>
   *
   * <p>Entonces: sin red <b>conocida</b>, a la cola. Con red y fallo de transporte, falla —
   * pero con un mensaje que se entiende.</p>
   *
   * @param memberId  necesario para poder encolar; sin él, sin conexión no hay nada que hacer.
   */
  async checkOut(accessLogId, memberId = null, memberName = '') {
    const puedeEncolar = disponible() && !!memberId;

    if (puedeEncolar) {
      const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (sinRed || (await cuantosPendientes()) > 0) {
        const ref = await encolar({
          memberId, method: 'manual', memberName,
          ocurridoEn: momentoLocal(), clientRef: nuevoSello(),
        });
        if (ref) return { encolado: true, clientRef: ref };
      }
    }

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
