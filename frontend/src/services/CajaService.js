import apiClient from '../lib/apiClient';

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
    const { data } = await apiClient.post('/gym/caja/movimientos-de-caja', {
      tipo, categoria, detalle, monto, metodo, hechoPor,
    });
    return data;
  }

  /**
   * Los movimientos del período, anulados incluidos.
   *
   * A diferencia de los cobros, esto lo ve cualquiera: quien cuenta ya sabe cuánto sacó del
   * cajón —lo sacó ella— y necesita verlo para no cargar dos veces el mismo gasto.
   */
  async movimientosDeCaja() {
    const { data } = await apiClient.get('/gym/caja/movimientos-de-caja');
    return data;
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
