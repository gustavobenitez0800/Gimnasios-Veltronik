import apiClient from '../lib/apiClient';
import { ponerLlaveroLocal, sacarLlaveroLocal } from '../lib/localMembers';

/**
 * Los llaveros de los socios (ADR-016): lo que ESCRIBE.
 *
 * <p>Leer un llavero no pasa por acá: cuando un socio pasa el suyo, el mostrador lo busca en la
 * copia local (`buscarPorLlavero`), que anda sin internet. Asignar y dar de baja sí necesitan el
 * servidor —la regla de «un llavero, un socio» la garantiza la base— y por eso fallan sin red,
 * con un mensaje que lo dice.</p>
 *
 * <p>⭐ Después de escribir se toca la copia local EN EL ACTO: el socio al que se le acaba de
 * asignar está parado en el mostrador y lo va a pasar en el segundo siguiente. Esperar al
 * refresco de cinco minutos sería decirle que su llavero nuevo no anda.</p>
 */
class LlaveroService {

  /** Los llaveros de un socio, los activos primero. */
  async delSocio(memberId) {
    const { data } = await apiClient.get(`/gym/members/${memberId}/llaveros`);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Le asigna un llavero a un socio.
   *
   * @returns {Promise<{llavero: object, nuevo: boolean, reasignadoDe: string|null}>}
   * @throws el 409 trae `response.data.socio` ({id, nombre}) cuando el llavero es de otro: con eso
   *         la pantalla pregunta «¿Pasárselo a…?» y vuelve a llamar con `reasignar`.
   */
  async asignar(memberId, codigo, { reasignar = false, hechoPor = null } = {}) {
    const { data } = await apiClient.post(`/gym/members/${memberId}/llaveros`, { codigo, reasignar, hechoPor });
    if (data?.llavero?.codigo) await ponerLlaveroLocal(memberId, data.llavero.codigo);
    return data;
  }

  /** Da de baja un llavero (lo perdió, se lo cambiaron). Deja de abrir en el acto. */
  async darDeBaja(llavero, { motivo = null, hechoPor = null } = {}) {
    const { data } = await apiClient.post(`/gym/llaveros/${llavero.id}/baja`, { motivo, hechoPor });
    await sacarLlaveroLocal(llavero.codigo);
    return data;
  }

  /**
   * De quién es un llavero que la copia local no conoce: si lo asignaron en otra PC hace un
   * rato, o si se dio de baja. Por POST, para que el número no quede en la dirección.
   *
   * @returns {Promise<{codigo: string, activo: object|null, ultimaBaja: object|null}>}
   */
  async consultar(codigo) {
    const { data } = await apiClient.post('/gym/llaveros/consulta', { codigo }, { timeout: 8000 });
    return data || { codigo, activo: null, ultimaBaja: null };
  }

  /** Los socios que tienen el número del llavero en el DNI, como los dejaba ControlFit. */
  async candidatosEnElDocumento() {
    const { data } = await apiClient.get('/gym/llaveros/en-el-documento');
    return Array.isArray(data) ? data : [];
  }

  /** Les pasa a llavero el número que tienen en el DNI. El documento no se toca. */
  async pasarDelDocumento(memberIds, { hechoPor = null } = {}) {
    const { data } = await apiClient.post('/gym/llaveros/en-el-documento', { memberIds, hechoPor });
    return data || { pasados: 0, salteados: 0 };
  }
}

export const llaveroService = new LlaveroService();
