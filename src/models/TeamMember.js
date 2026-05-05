/**
 * Clase Modelo: TeamMember (Staff)
 * Encapsula la información y lógica de un miembro del equipo del gimnasio.
 */
export default class TeamMember {
  constructor(data = {}) {
    this.user_id = data.user_id || null;
    this.org_id = data.org_id || null;
    this.role = data.role || 'staff';
    this.email = data.email || '';
    this.full_name = data.full_name || '';
  }

  /**
   * Obtiene la etiqueta del rol
   */
  getRoleLabel() {
    const labels = {
      owner: 'Dueño',
      admin: 'Administrador',
      staff: 'Empleado',
      reception: 'Recepción'
    };
    return labels[this.role] || this.role;
  }

  /**
   * Devuelve si el usuario es dueño
   */
  isOwner() {
    return this.role === 'owner';
  }

  /**
   * Devuelve si el usuario es administrador
   */
  isAdmin() {
    return this.role === 'admin';
  }
}
