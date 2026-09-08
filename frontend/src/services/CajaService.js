import apiClient from '../lib/apiClient';
import {
  encolarPendiente, disponible, nuevoSello, momentoLocal, cuantosPendientes,
  movimientosPendientes,
} from '../lib/colaAccesos';

/**
 * El cierre de caja, diario.
 *
 * ⚠️ CAMBIÓ DE RAÍZ EL 2026-09-02. Antes esto era un ARQUEO A CIEGAS: quien iba a contar
 * pedía `pendiente()` —que decía que había algo que cerrar pero NO cuánto—, contaba la
 * plata, escribía el monto, y recién ahí veía lo que el sistema esperaba.
 *
 * Ahora el sistema muestra los totales por forma de pago: cada cobro ya tiene su método, y
 * hacer que una persona vuelva a averiguarlo y lo tipee era rehacer a mano una cuenta hecha.
 * Lo único que se declara al cerrar es CUÁNTO EFECTIVO SE RETIRA del cajón.
 *
 * Lo que se pierde, dicho claro: sin conteo declarado el sistema no puede avisar que falta
 * plata. Fue una decisión del dueño, sabiendo el costo.
 */
class CajaService {

  /**
   * Lo que lleva el período abierto, con importes y con el fondo del cajón.
   *
   * Ya no es solo del dueño: estos totales SON el cierre diario, y ahora también cierra
   * recepción. Trae `fondo` (lo que dejó el cierre anterior) y `esperadoEnElCajon`.
   */
  async abierto() {
    const { data } = await apiClient.get('/gym/caja/abierto');
    return data;
  }

  /** ¿Hay una caja abierta? Desde cuándo, quién y con cuánto cambio. Lo ve cualquiera. */
  async estado() {
    const { data } = await apiClient.get('/gym/caja/estado');
    return data;
  }

  /** Los cobros del período: socio, monto, método, fecha. Es la lista del cierre. */
  async movimientos() {
    const { data } = await apiClient.get('/gym/caja/movimientos');
    return data;
  }

  /** Desde cuándo y cuántos cobros, SIN importes. Para quien va a contar. */
  async pendiente() {
    const { data } = await apiClient.get('/gym/caja/pendiente');
    return data;
  }

  // ─── Movimientos de caja: lo que sale y entra sin ser un cobro ───
  //
  // ⚠️ La ruta se llama `movimientos-de-caja` y no `movimientos` porque ese nombre ya está
  // tomado por los COBROS del período, y lo consumen escritorios ya instalados: renombrarlo
  // dejaría sin pantalla a los que todavía no actualizaron.

  /**
   * Anota un gasto o una entrada de plata que no es un cobro de socio.
   *
   * ⚠️ Esto es lo que evita que el arqueo mienta todos los días. Se le pagan $15.000 a la
   * chica de la limpieza del cajón: si no queda anotado, a la noche el sistema espera esa
   * plata igual, el cierre dice FALTANTE, y acusa a quien atendió sin que haya robado nada.
   */
  async registrarMovimiento({ tipo, categoria, detalle, monto, metodo, hechoPor }) {
    const clientRef = nuevoSello();
    const ocurridoEn = momentoLocal();
    const cuerpo = { tipo, categoria, detalle, monto, metodo, hechoPor, clientRef, ocurridoEn };

    // ⚠️ El tipo del MOVIMIENTO viaja aparte para la cola: `tipo` ahí adentro significa qué
    // clase de cosa es (ACCESO, COBRO, EGRESO…), y mandarlo con "EGRESO" en los dos campos
    // haría que un INGRESO manual volviera del otro lado convertido en un gasto.
    const paraLaCola = {
      ...cuerpo, tipo: 'EGRESO', movimientoTipo: tipo, ocurridoEn,
    };

    // Si hay algo esperando, este también espera: la cola es una sola y el orden vale entre
    // tipos. Adelantarse por la escritura directa lo rompería.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (disponible() && (sinRed || (await cuantosPendientes()) > 0)) {
      const ref = await encolarPendiente(paraLaCola);
      if (ref) return { encolado: true, clientRef: ref };
    }

    try {
      const { data } = await apiClient.post('/gym/caja/movimientos-de-caja', cuerpo);
      return data;
    } catch (error) {
      // Un rechazo del servidor es un rechazo real (monto en cero, egreso sin detalle) y se
      // muestra. Encolarlo sería reintentar para siempre algo que ya dijo que no.
      if (error?.response || !disponible()) throw error;

      const ref = await encolarPendiente(paraLaCola);
      if (!ref) throw error; // no hay dónde guardarlo: que falle como antes, sin mentir
      return { encolado: true, clientRef: ref };
    }
  }

  /**
   * Manda UN movimiento que estaba en la cola. Lo usa el vaciado, de a uno y en orden.
   *
   * <p>El sello y el momento viajan tal como se guardaron: son lo que impide contarlo dos
   * veces y lo que lo deja en el día en que la plata salió del cajón.</p>
   */
  async enviarEncolado(item) {
    const { data } = await apiClient.post('/gym/caja/movimientos-de-caja', {
      tipo: item.movimientoTipo || 'EGRESO',
      categoria: item.categoria,
      detalle: item.detalle,
      monto: item.monto,
      metodo: item.metodo,
      hechoPor: item.hechoPor,
      clientRef: item.clientRef,
      ocurridoEn: item.ocurridoEn,
    });
    return data;
  }

  /**
   * Los movimientos del período, anulados incluidos.
   *
   * A diferencia de los cobros, esto lo ve cualquiera: quien cuenta ya sabe cuánto sacó del
   * cajón —lo sacó ella— y necesita verlo para no cargar dos veces el mismo gasto.
   *
   * ⭐ Y LOS QUE TODAVÍA NO SUBIERON VAN EN LA MISMA LISTA. No es un adorno: esa última
   * frase —"para no cargar dos veces el mismo gasto"— es exactamente la que dejaba de
   * cumplirse sin conexión, porque la lista aparecía vacía. Quien anotó que le pagó $15.000
   * a la limpieza no lo veía, lo cargaba de nuevo, y el arqueo terminaba con un faltante de
   * $15.000 que nadie se llevó.
   *
   * Los pendientes van marcados (`sinSubir`) y primero: son los más recientes.
   */
  async movimientosDeCaja() {
    const enCola = await movimientosPendientes();

    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (sinRed) return enCola;

    try {
      const { data } = await apiClient.get('/gym/caja/movimientos-de-caja');
      return [...enCola, ...(data || [])];
    } catch (error) {
      // Con la copia de la cola en la mano, un servidor que no contesta no tiene por qué
      // dejar la pantalla sin nada. Un rechazo del servidor sí se muestra.
      if (error?.response || enCola.length === 0) throw error;
      return enCola;
    }
  }

  /** Anula un movimiento. No lo borra: borrarlo sería poder borrar la prueba. */
  async anularMovimiento(id, { motivo, anuladoPor }) {
    const { data } = await apiClient.post(`/gym/caja/movimientos-de-caja/${id}/anular`, {
      motivo, anuladoPor,
    });
    return data;
  }

  /**
   * Cierra el día.
   *
   * @param retiroEfectivo cuánto se lleva del cajón. 0 o null = queda todo para mañana, y
   *                       ese resto es el fondo con el que arranca el día siguiente.
   */
  async cerrar({ retiroEfectivo, nota, cerradoPor }) {
    const { data } = await apiClient.post('/gym/caja/cierre', { retiroEfectivo, nota, cerradoPor });
    return data;
  }

  /**
   * Balance de ingresos de hoy o del mes en curso.
   *
   * No es lo mismo que el período abierto: si nadie cerró ayer, aquel arrastra dos días y
   * esto sigue diciendo lo de hoy.
   *
   * @param periodo 'hoy' | 'mes'
   */
  async balance(periodo = 'hoy') {
    const { data } = await apiClient.get('/gym/caja/balance', { params: { periodo } });
    return data;
  }

  /** Explica una diferencia. Se puede una sola vez. */
  async explicar(cierreId, nota) {
    const { data } = await apiClient.patch(`/gym/caja/cierre/${cierreId}/nota`, { nota });
    return data;
  }

  /** El historial. Solo dueño/admin. */
  async historial(cuantos = 60) {
    const { data } = await apiClient.get('/gym/caja/historial', { params: { cuantos } });
    return data;
  }
}

export const cajaService = new CajaService();
export default cajaService;
