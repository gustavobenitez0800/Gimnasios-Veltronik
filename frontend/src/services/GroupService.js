import apiClient from '../lib/apiClient';

/**
 * Servicio de Grupos de Sucursales. Organiza el lobby cuando el dueño tiene
 * varias sucursales/rubros. Todo el filtrado de propiedad lo hace el backend.
 *
 * OJO — la feature está a medio terminar: el backend la tiene COMPLETA (migración V18,
 * `TenantGroupController` con crear/editar/borrar/asignar) pero la app solo sabe LEER.
 * Como no hay ninguna pantalla para crear un grupo ni para asignarle una sucursal,
 * `getMyGroups()` hoy devuelve vacío para todo el mundo y el agrupado del Lobby nunca
 * se dibuja. Los métodos de escritura se borraron por no tener llamadores (están en el
 * historial de git); cuando se construya la UI, se reponen contra ese controller.
 */
class GroupService {
  async getMyGroups() {
    const response = await apiClient.get('/tenants/groups');
    return response.data;
  }
}

export const groupService = new GroupService();
