import apiClient from '../lib/apiClient';

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

  async getAll() {
    return this.getAllMembers();
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

  async createMember(memberData) {
    const response = await apiClient.post('/gym/members', memberData);
    return response.data;
  }

  async updateMember(id, memberData) {
    const response = await apiClient.put(`/gym/members/${id}`, memberData);
    return response.data;
  }

  async deleteMember(id) {
    await apiClient.delete(`/gym/members/${id}`);
    return true;
  }

  async update(id, data) {
    return this.updateMember(id, data);
  }

  /**
   * Búsqueda de socios para el modal de pagos y control de acceso.
   * Devuelve resultados con campos en camelCase directamente.
   */
  async searchForAccess(searchTerm) {
    const allMembers = await this.getAllMembers();
    
    // Add fullName helper property for the UI search
    const mapped = allMembers.map(m => ({
      ...m,
      fullName: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
    }));

    if (!searchTerm || searchTerm.trim().length < 2) return mapped.slice(0, 20);
    
    const term = searchTerm.toLowerCase();
    return mapped.filter(m => {
      return (m.fullName && m.fullName.toLowerCase().includes(term)) ||
             (m.dni && m.dni.includes(term)) ||
             (m.id && m.id === searchTerm);
    });
  }
}

export const memberService = new MemberService();
