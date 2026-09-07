import apiClient from '../lib/apiClient';
import {
  prepararSocios, buscarSocios, estadoSocios, refrescarSocios, agregarSocioLocal,
} from '../lib/localMembers';
import {
  encolarPendiente, disponible, nuevoSello, cuantosPendientes,
} from '../lib/colaAccesos';

/**
 * Servicio para gestionar Socios usando la API Java.
 * Nota: Java devuelve camelCase. Este servicio expone métodos que
 * aceptan/devuelven snake_case para compatibilidad con la UI legacy.
 */
class MemberService {
  async getAllMembers() {
    const response = await apiClient.get('/gym/members');
    return response.data;
  }

  /**
   * Página de socios desde el backend (server-side). Devuelve
   * { content, totalElements, totalPages, page, size }.
   */
  async getMembersPaged(page = 0, size = 50, search = '') {
    const params = { page, size };
    if (search && search.trim() !== '') params.search = search.trim();
    const response = await apiClient.get('/gym/members/paged', { params });
    return response.data;
  }

  async getMemberById(id) {
    const response = await apiClient.get(`/gym/members/${id}`);
    return response.data;
  }

  /**
   * Después de tocar un socio hay que refrescar la copia local, o el mostrador seguiría
   * buscando contra una lista que no tiene al que acaba de dar de alta — el caso más
   * confuso posible: lo cargó hace diez segundos y el buscador dice que no existe.
   *
   * Sin `await` y sin romper si falla: el alta ya terminó bien, y que el refresco no
   * llegue no puede convertirse en un error para quien la hizo.
   */
  refrescarCopiaLocal() {
    const tenantId = localStorage.getItem('current_org_id');
    if (tenantId) refrescarSocios(tenantId).catch(() => {});
  }

  /**
   * ⭐ DAR DE ALTA. Con internet va derecho; sin internet, a la cola.
   *
   * <p><b>El id lo genera el terminal, siempre.</b> Y esa es la pieza que hace posible dar de
   * alta y cobrar en el mismo acto sin conexión: el cobro que se encola detrás tiene que poder
   * nombrar al socio, y si el id lo inventara el servidor apuntaría a alguien que todavía no
   * existe. El backend lo respeta (`AssignableUuidGenerator`) y verifica que no sea el de otro
   * gimnasio antes de aceptarlo.</p>
   *
   * <p><b>Y el socio queda en la copia local en el acto</b>, aunque el alta no haya subido: si
   * no, quien atiende lo da de alta y no lo puede buscar para cobrarle, que es literalmente el
   * paso siguiente.</p>
   *
   * @returns el socio como lo devolvió el servidor, o `{encolado: true, id}` si quedó guardado.
   */
  async createMember(memberData) {
    const id = memberData?.id || nuevoSello();
    const cuerpo = { ...memberData, id };

    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (disponible() && (sinRed || (await cuantosPendientes()) > 0)) {
      const ref = await encolarPendiente({ ...cuerpo, tipo: 'ALTA', clientRef: id });
      if (ref) {
        await agregarSocioLocal(cuerpo);
        return { ...cuerpo, encolado: true };
      }
    }

    try {
      const response = await apiClient.post('/gym/members', cuerpo);
      this.refrescarCopiaLocal();
      return response.data;
    } catch (error) {
      if (error?.response || !disponible()) throw error;

      const ref = await encolarPendiente({ ...cuerpo, tipo: 'ALTA', clientRef: id });
      if (!ref) throw error;
      await agregarSocioLocal(cuerpo);
      return { ...cuerpo, encolado: true };
    }
  }

  /** Manda UN alta que estaba en la cola. Lo usa el vaciado, de a uno y en orden. */
  async enviarEncolado(item) {
    // eslint-disable-next-line no-unused-vars
    const { tipo, clientRef, ocurridoEn, intentos, ultimoError, creadoEn, tenantId, ...cuerpo } = item;
    const response = await apiClient.post('/gym/members', cuerpo);
    this.refrescarCopiaLocal();
    return response.data;
  }

  async updateMember(id, memberData) {
    const response = await apiClient.put(`/gym/members/${id}`, memberData);
    this.refrescarCopiaLocal();
    return response.data;
  }

  /**
   * Le asigna el mismo arancel a muchos socios de una sola vez.
   *
   * ⚠️ Es UN pedido, no uno por socio. Con 383 socios, hacerlo desde acá con un bucle son
   * 383 viajes y más de un minuto — y si se cierra la pestaña a la mitad, queda la mitad
   * hecha sin forma de saber cuál. El servidor lo aplica entero o no lo aplica.
   *
   * @param planId null = sacarles el arancel a todos
   * @returns {Promise<{actualizados: number, pedidos: number}>}
   */
  async asignarArancelMasivo(memberIds, planId) {
    const { data } = await apiClient.post('/gym/members/arancel-masivo', { memberIds, planId });
    // Cambió el arancel de muchos socios: la copia local del mostrador quedó vieja.
    this.refrescarCopiaLocal();
    return data;
  }

  async deleteMember(id) {
    await apiClient.delete(`/gym/members/${id}`);
    this.refrescarCopiaLocal();
    return true;
  }

  /**
   * Búsqueda de socios para el modal de pagos y control de acceso.
   * Filtra en el BACKEND (SQL, endpoint paginado) en vez de traer TODOS los socios
   * y filtrar en el navegador — clave en recepción con cientos de socios.
   * Devuelve un array con campos camelCase + fullName (contrato estable para la UI).
   */
  async searchForAccess(searchTerm) {
    const search = (searchTerm || '').trim();
    const tenantId = localStorage.getItem('current_org_id');

    // ── Primero la copia local: instantánea, y funciona sin internet ──
    //
    // Antes esto salía a la nube en cada búsqueda. Con el timeout en 20 segundos y dos
    // reintentos, una consulta que no llegaba tardaba MÁS DE UN MINUTO en admitir que no
    // pudo, con el socio esperando en el mostrador. Ahora buscar es recorrer un array en
    // memoria; la red ocurre en el fondo, no mientras alguien espera.
    if (tenantId) {
      // No se espera: si ya hay lista cargada devuelve al instante, y si no, dispara la
      // carga y esta búsqueda cae al backend. La siguiente ya va a ser local.
      prepararSocios(tenantId).catch(() => {});
      const { vacia } = estadoSocios();
      if (!vacia) return buscarSocios(search, 20);
    }

    // ── Respaldo: la primera búsqueda antes de que baje la lista, o si no hay
    //    almacenamiento disponible. Es el comportamiento de siempre. ──
    const page = await this.getMembersPaged(0, 20, search.length >= 2 ? search : '');
    const list = page?.content || [];
    return list.map(m => ({
      ...m,
      fullName: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
      // Alias dni: el DTO expone document y dni; aseguramos que la UI siempre tenga dni.
      dni: m.dni || m.document || '',
    }));
  }
}

export const memberService = new MemberService();
