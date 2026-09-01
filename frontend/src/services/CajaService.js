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

  /** Desde cuándo y cuántos cobros, SIN importes. Para quien va a contar. */
  async pendiente() {
    const { data } = await apiClient.get('/gym/caja/pendiente');
    return data;
  }

  /**
   * Cierra el período.
   *
   * @param declaradoEfectivo lo contado. null = corte sin conteo (solo dueño/admin).
   */
  async cerrar({ declaradoEfectivo, nota, cerradoPor }) {
    const { data } = await apiClient.post('/gym/caja/cierre', { declaradoEfectivo, nota, cerradoPor });
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
