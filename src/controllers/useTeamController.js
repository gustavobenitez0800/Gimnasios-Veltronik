import { useState, useCallback } from 'react';
import { teamFacade } from '../repositories/TeamFacade';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook Controlador: useTeamController
 * Equivalente a: PersonalController.java (@ManagedBean)
 */
export function useTeamController() {
  const { gym: currentGym } = useAuth();
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Cargar miembros del equipo
   */
  const loadTeam = useCallback(async () => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await teamFacade.getTeamMembers(currentGym.id);
      setTeamMembers(data);
    } catch (err) {
      console.error("Error loading team:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  /**
   * Cargar registro de actividad
   */
  const loadActivity = useCallback(async () => {
    if (!currentGym?.id) return;
    setActivityLoading(true);
    try {
      const data = await teamFacade.getActivityLog(currentGym.id, 50);
      setActivityLog(data);
    } catch (err) {
      console.error("Error loading activity:", err);
    } finally {
      setActivityLoading(false);
    }
  }, [currentGym]);

  /**
   * Invitar a un nuevo miembro
   */
  const inviteMember = async (email, role) => {
    setLoading(true);
    setError(null);
    try {
      await teamFacade.inviteMember(currentGym.id, email, role);
      await loadTeam(); // Recargar después de invitar
    } catch (err) {
      console.error("Error inviting member:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Actualizar el rol de un miembro
   */
  const updateRole = async (targetUserId, newRole) => {
    setLoading(true);
    setError(null);
    try {
      await teamFacade.updateRole(currentGym.id, targetUserId, newRole);
      await loadTeam(); // Recargar
    } catch (err) {
      console.error("Error updating role:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Remover un miembro
   */
  const removeMember = async (targetUserId) => {
    setLoading(true);
    setError(null);
    try {
      await teamFacade.removeMember(currentGym.id, targetUserId);
      await loadTeam(); // Recargar
    } catch (err) {
      console.error("Error removing member:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    teamMembers,
    activityLog,
    loading,
    activityLoading,
    error,
    loadTeam,
    loadActivity,
    inviteMember,
    updateRole,
    removeMember
  };
}
