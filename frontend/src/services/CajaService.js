import apiClient from '../lib/apiClient';

/**
 * El cierre de caja.
 *
 * ⚠️ Hay DOS endpoints para mirar el período abierto y la diferencia entre los dos es el
 * corazón de la función: `abierto()` trae los importes y **solo lo puede pedir el dueño**;
 * `pendiente()` dice que hay algo que cerrar pero NO cuánto. Quien va a contar la plata usa
 * el segundo. Si viera el número esperado antes de contar, escribiría ese número y el
 * arqueo no valdría nada — y esconderlo solo en la pantalla no alcanza, porque cualquiera
 * puede abrir la API.
 */
class CajaService {

  /** Lo que lleva el período, CON importes. Solo dueño/admin (lo verifica el backend). */
  async abierto() {
    const { data } = await apiClient.get('/gym/caja/abierto');
    return data;
  }

  /** ¿Hay una caja abierta? Desde cuándo, quién y con cuánto cambio. Lo ve cualquiera. */
  async estado() {
    const { data } = await apiClient.get('/gym/caja/estado');
    return data;
  }

  /**
   * Abre la caja con el cambio que ya había en el cajón.
   *
   * ⚠️ El fondo NO es opcional aunque sea cero: sin él el arqueo nunca cuadra, porque el
   * cajón arranca el día con el cambio de ayer y eso aparece como sobrante todos los días.
   */
  async abrir({ fondoInicial, abiertaPor }) {
    const { data } = await apiClient.post('/gym/caja/abrir', { fondoInicial, abiertaPor });
    return data;
  }

  /** Los cobros que forman el número: socio, monto, método, fecha. SOLO dueño. */
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
   * Cierra el período.
   *
   * @param declaradoEfectivo lo contado en el cajón. null = corte sin conteo (solo dueño).
   * @param declaradoDigital  lo que entró por transferencia y Mercado Pago.
   */
  async cerrar({ declaradoEfectivo, declaradoDigital, nota, cerradoPor }) {
    const { data } = await apiClient.post('/gym/caja/cierre', { declaradoEfectivo, declaradoDigital, nota, cerradoPor });
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
