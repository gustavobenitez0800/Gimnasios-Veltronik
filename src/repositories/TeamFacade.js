import AbstractFacade from './AbstractFacade';
import TeamMember from '../models/TeamMember';

/**
 * Clase: TeamFacade
 * Equivalente a: PersonalFacade.java o UsuarioFacade.java
 * Nota: En lugar de consultar una tabla directa, aquí usamos
 * Store Procedures (RPC) de PostgreSQL alojados en Supabase,
 * un patrón muy similar a usar Callables en JDBC/JPA.
 */
class TeamFacade extends AbstractFacade {
  constructor() {
    // Al ser principalmente RPC, la tabla base es referencial
    super(TeamMember, 'organization_members');
  }

  /**
   * Obtener miembros del equipo (Llamada a Procedimiento Almacenado)
   */
  async getTeamMembers(orgId) {
    const { data, error } = await this.getEntityManager().rpc('get_team_members', { org_id: orgId });
    if (error) throw error;
    return data ? data.map(record => new this.entityClass(record)) : [];
  }

  /**
   * Obtener historial de actividad (Logs)
   */
  async getActivityLog(orgId, limit = 50) {
    const { data, error } = await this.getEntityManager().rpc('get_activity_log', { org_id: orgId, log_limit: limit });
    if (error) throw error;
    return data || [];
  }

  /**
   * Invitar / Agregar miembro al equipo
   */
  async inviteMember(orgId, email, role) {
    const { error } = await this.getEntityManager().rpc('invite_team_member', {
      org_id: orgId,
      invite_email: email,
      invite_role: role,
    });
    if (error) throw error;
  }

  /**
   * Actualizar rol de un miembro
   */
  async updateRole(orgId, targetUserId, newRole) {
    const { error } = await this.getEntityManager().rpc('update_team_member_role', {
      org_id: orgId,
      target_user_id: targetUserId,
      new_role: newRole,
    });
    if (error) throw error;
  }

  /**
   * Eliminar miembro del equipo
   */
  async removeMember(orgId, targetUserId) {
    const { error } = await this.getEntityManager().rpc('remove_team_member', {
      org_id: orgId,
      target_user_id: targetUserId,
    });
    if (error) throw error;
  }
}

export const teamFacade = new TeamFacade();
