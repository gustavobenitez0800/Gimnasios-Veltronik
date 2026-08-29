import apiClient from '../lib/apiClient';
import { prepararSocios, buscarSocios, estadoSocios, refrescarSocios } from '../lib/localMembers';

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

  async createMember(memberData) {
    const response = await apiClient.post('/gym/members', memberData);
    this.refrescarCopiaLocal();
    return response.data;
  }

  async updateMember(id, memberData) {
    const response = await apiClient.put(`/gym/members/${id}`, memberData);
    this.refrescarCopiaLocal();
    return response.data;
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
